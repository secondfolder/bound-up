import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerSettings } from '$lib/server-settings';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import { createTestUser, type TestUser } from '$lib/testing/fixtures';
import { testSettings } from '$lib/testing/settings';
import { GET } from './+server';

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env }));

let harness: TestDb;
let admin: TestUser;
let upstream: ReturnType<typeof vi.fn>;

beforeEach(async () => {
	harness = await createTestDb();
	admin = await createTestUser(harness.db, { role: 'admin' });
	env.RUNWARE_BASE_URL = 'https://images.test/v1';
	upstream = vi.fn(async () =>
		Response.json({
			data: [
				{
					taskType: 'modelSearch',
					results: [
						{
							air: 'civitai:1@2',
							name: 'A Pony',
							version: 'v3',
							architecture: 'pony',
							shortDescription: '<p>Made for <b>ponies</b>.</p>',
							tags: ['pony'],
							defaultSteps: 30,
							defaultCFG: 7,
							positiveTriggerWords: 'score_9, score_8'
						},
						{ air: 'civitai:3@4', name: 'A Flux', version: 'dev', architecture: 'flux1d' }
					]
				}
			]
		})
	);
	vi.stubGlobal('fetch', upstream);
});

afterEach(() => {
	harness.close();
	vi.unstubAllGlobals();
});

function search(
	user: TestUser,
	settings: ServerSettings = testSettings({ runwareApiKey: 'rw-key' })
) {
	return runAndCatch(() =>
		GET(fakeEvent({ db: harness.db, user, settings, path: '/api/admin/models/runware?q=pony' }))
	);
}

describe('GET /api/admin/models/runware', () => {
	it('searches Runware’s checkpoints with the saved key, and suggests each one’s base model', async () => {
		const result = await search(admin);
		if (result.type !== 'ok') {
			throw new Error(`expected results, got ${result.type}`);
		}
		expect((await result.value.json()).results).toEqual([
			{
				runwareModelAir: 'civitai:1@2',
				name: 'A Pony',
				version: 'v3',
				architecture: 'pony',
				base: 'pony',
				// As plain text: the picker never renders a model page's markup.
				description: 'Made for ponies.',
				tags: ['pony'],
				defaultSteps: 30,
				defaultCfg: 7,
				triggerWords: 'score_9, score_8'
			},
			{
				runwareModelAir: 'civitai:3@4',
				name: 'A Flux',
				version: 'dev',
				architecture: 'flux1d',
				base: null,
				description: '',
				tags: [],
				defaultSteps: null,
				defaultCfg: null,
				triggerWords: ''
			}
		]);
		const [url, init] = upstream.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://images.test/v1');
		expect(new Headers(init.headers).get('authorization')).toBe('Bearer rw-key');
		expect(JSON.parse(String(init.body))[0]).toMatchObject({
			taskType: 'modelSearch',
			search: 'pony',
			category: 'checkpoint'
		});
	});

	it('looks one AIR up exactly, answering nothing for one Runware does not host', async () => {
		const exact = await runAndCatch(() =>
			GET(
				fakeEvent({
					db: harness.db,
					user: admin,
					settings: testSettings({ runwareApiKey: 'rw-key' }),
					path: '/api/admin/models/runware?air=civitai%3A3%404'
				})
			)
		);
		if (exact.type !== 'ok') {
			throw new Error(`expected an answer, got ${exact.type}`);
		}
		expect(
			(await exact.value.json()).results.map((r: { runwareModelAir: string }) => r.runwareModelAir)
		).toEqual(['civitai:3@4']);
		const [, init] = upstream.mock.calls[0] as unknown as [string, RequestInit];
		expect(JSON.parse(String(init.body))[0].search).toBe('civitai:3@4');
	});

	it('says to save a key first, without asking Runware', async () => {
		const result = await search(admin, testSettings());
		if (result.type !== 'ok') {
			throw new Error(`expected an answer, got ${result.type}`);
		}
		expect(result.value.status).toBe(409);
		expect((await result.value.json()).message).toMatch(/Save a Runware API key first/);
		expect(upstream).not.toHaveBeenCalled();
	});

	it('says so when Runware refuses the saved key', async () => {
		upstream.mockResolvedValueOnce(new Response(null, { status: 401 }));
		const result = await search(admin);
		if (result.type !== 'ok') {
			throw new Error(`expected an answer, got ${result.type}`);
		}
		expect(result.value.status).toBe(409);
	});

	it('is a 404 for anyone but an admin, and asks nothing', async () => {
		const ada = await createTestUser(harness.db, { role: 'user' });
		expect(await search(ada)).toMatchObject({ type: 'error', status: 404 });
		expect(upstream).not.toHaveBeenCalled();
	});
});
