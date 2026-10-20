import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import { createTestUser, type TestUser } from '$lib/testing/fixtures';
import { GET } from './+server';

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env }));

let harness: TestDb;
let admin: TestUser;
let upstream: ReturnType<typeof vi.fn>;

const MODELS = {
	data: [
		{
			id: 'nousresearch/hermes-4-70b',
			name: 'Nous: Hermes 4 70B',
			description: 'Hermes 4 is   a hybrid reasoning model.',
			context_length: 131_072,
			pricing: { prompt: '0.0000001', completion: '0.0000004' },
			supported_parameters: ['max_tokens', 'tools']
		},
		{ id: 'sao10k/l3.1-euryale-70b', name: 'Sao10K: Euryale 70B' }
	]
};

beforeEach(async () => {
	harness = await createTestDb();
	admin = await createTestUser(harness.db, { role: 'admin' });
	// A base URL per test: the catalogue is cached per URL for ten minutes.
	env.OPENROUTER_BASE_URL = `https://models-${crypto.randomUUID()}.test/v1`;
	upstream = vi.fn(async () => Response.json(MODELS));
	vi.stubGlobal('fetch', upstream);
});

afterEach(() => {
	harness.close();
	vi.unstubAllGlobals();
});

function search(user: TestUser, q: string) {
	return runAndCatch(() =>
		GET(
			fakeEvent({
				db: harness.db,
				user,
				path: `/api/admin/models/openrouter?q=${encodeURIComponent(q)}`
			})
		)
	);
}

describe('GET /api/admin/models/openrouter', () => {
	it('finds models with every word in their id or name, with prices per million tokens', async () => {
		const result = await search(admin, 'hermes 70b');
		if (result.type !== 'ok') {
			throw new Error(`expected results, got ${result.type}`);
		}
		const { results } = await result.value.json();
		expect(results).toEqual([
			{
				openrouterModelId: 'nousresearch/hermes-4-70b',
				name: 'Nous: Hermes 4 70B',
				description: 'Hermes 4 is a hybrid reasoning model.',
				contextLength: 131_072,
				promptPerMillion: expect.closeTo(0.1),
				completionPerMillion: expect.closeTo(0.4),
				tools: true
			}
		]);
		expect(upstream.mock.calls[0]?.[0]).toBe(`${env.OPENROUTER_BASE_URL}/models`);
	});

	it('looks one id up exactly, by what comes before any @ suffix', async () => {
		const lookUp = async (id: string) => {
			const result = await runAndCatch(() =>
				GET(
					fakeEvent({
						db: harness.db,
						user: admin,
						path: `/api/admin/models/openrouter?id=${encodeURIComponent(id)}`
					})
				)
			);
			if (result.type !== 'ok') {
				throw new Error(`expected an answer, got ${result.type}`);
			}
			return (await result.value.json()).results.map(
				(model: { openrouterModelId: string }) => model.openrouterModelId
			);
		};
		expect(await lookUp('nousresearch/hermes-4-70b@preset/nsfw-compatible')).toEqual([
			'nousresearch/hermes-4-70b'
		]);
		// Exactly: a search for "hermes" would find it, a lookup of a prefix does not.
		expect(await lookUp('nousresearch/hermes')).toEqual([]);
	});

	it('asks OpenRouter once, and searches its list again from memory', async () => {
		await search(admin, 'hermes');
		await search(admin, 'euryale');
		expect(upstream).toHaveBeenCalledTimes(1);
	});

	it('is a 404 for anyone but an admin, and asks nothing', async () => {
		const ada = await createTestUser(harness.db, { role: 'user' });
		expect(await search(ada, 'hermes')).toMatchObject({ type: 'error', status: 404 });
		expect(upstream).not.toHaveBeenCalled();
	});

	it('is a 502 when OpenRouter cannot be reached', async () => {
		upstream.mockRejectedValueOnce(new TypeError('fetch failed'));
		expect(await search(admin, 'hermes')).toMatchObject({ type: 'error', status: 502 });
	});
});
