import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type DreamEvent, readEvents } from '$lib/dream/events';
import type { PassageRequest } from '$lib/dream/requests';
import { acceptDisclosure } from '$lib/server/daydreams';
import type { Db } from '$lib/server/db';
import { saveCheck } from '$lib/server/model-providers/store';
import type { ServerSettingKey } from '$lib/server-settings';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import {
	createTestUser,
	ensureTestSelfVault,
	fakeSealed,
	grantTestDaydreams,
	grantTestDreams,
	type TestUser
} from '$lib/testing/fixtures';
import { testSettings } from '$lib/testing/settings';
import { POST as create, GET as list } from './+server';
import { GET as getDream } from './[id]/+server';
import { POST as appendTurn } from './[id]/turns/+server';
import { POST as passage } from './passage/+server';

/**
 * The new engine's API (docs/dreams.md): only for accounts holding the
 * feature, storage round trips sealed records, and a passage streams back as
 * the engine's events, pinned to a provider that passed the daydream's heat.
 * `fetch` stands in for OpenRouter.
 */

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env }));

let harness: TestDb;
let db: Db;
let ada: TestUser;
let upstream: ReturnType<typeof vi.fn>;
const configured: Partial<Record<ServerSettingKey, string>> = {
	openrouterApiKey: 'sk-or-test',
	storyModel: JSON.stringify({ provider: 'openrouter', openrouterModelId: 'test/model' })
};

const PROSE = 'She sets the cup down, and waits for you to notice.';

function sse(...pieces: string[]): Response {
	const text = `${pieces.map((piece) => `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`).join('')}data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`;
	return new Response(text, { headers: { 'content-type': 'text/event-stream' } });
}

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
	await grantTestDreams(db, ada.id);
	await acceptDisclosure(db, ada.id);
	env.OPENROUTER_BASE_URL = 'https://models.test/api/v1';
	upstream = vi.fn(() => Promise.resolve(sse(`${PROSE.slice(0, 20)}`, PROSE.slice(20))));
	vi.stubGlobal('fetch', upstream);
	// Only providers with full adult support are used: one has passed.
	const at = new Date();
	await saveCheck(db, MODEL, { provider: 'prude/fp4', order: 0, levelPassed: 2, at, reason: null });
	await saveCheck(db, MODEL, { provider: 'open/fp8', order: 1, levelPassed: 4, at, reason: null });
});

const MODEL = { model: 'test/model', kind: 'language' as const };

afterEach(() => {
	harness.close();
	vi.unstubAllGlobals();
});

function event(
	user: TestUser | null,
	options: { json?: unknown; params?: Record<string, string> } = {}
) {
	return fakeEvent({ db, user, settings: testSettings(configured), ...options });
}

async function sealed(label: string) {
	return {
		vaultId: await ensureTestSelfVault(db, ada.id),
		ciphertext: fakeSealed(label),
		payloadVersion: 1
	};
}

const passageBody: PassageRequest = {
	setup: {
		heat: 'explicit',
		telling: 'Close second person.',
		capabilities: [],
		elements: [],
		presentation: { view: 'scroll', theme: 'rust', notes: '' },
		musts: [],
		research: ''
	},
	limits: ['Nothing about feet'],
	preferences: [],
	history: [{ passage: 'The door shuts.', turn: { kind: 'words', text: 'I sit.' } }],
	summaries: [],
	take: null,
	repeated: []
};

describe('the feature', () => {
	it('refuses someone signed out, and an account without it, even one with the old daydreams', async () => {
		const bo = await createTestUser(db, { name: 'Bo' });
		await grantTestDaydreams(db, bo.id);
		expect(await runAndCatch(() => list(event(null)))).toMatchObject({
			type: 'error',
			status: 401
		});
		expect(await runAndCatch(() => list(event(bo)))).toMatchObject({ type: 'error', status: 403 });
		expect(await runAndCatch(() => passage(event(bo, { json: passageBody })))).toMatchObject({
			type: 'error',
			status: 403
		});
		expect(upstream).not.toHaveBeenCalled();
	});
});

describe('storage', () => {
	it('creates a daydream, saves a turn, and reads the branch back sealed', async () => {
		const id = crypto.randomUUID();
		const created = await runAndCatch(() =>
			create(
				event(ada, { json: { id, setup: { vaultId: '', ciphertext: '', payloadVersion: 1 } } })
			)
		);
		expect(created).toMatchObject({ type: 'error', status: 400 });
		await create(event(ada, { json: { id, setup: await sealed('setup') } }));
		const turnId = crypto.randomUUID();
		const turn = await sealed('turn');
		await appendTurn(
			event(ada, {
				params: { id },
				json: { id: turnId, parentId: null, role: 'model', content: turn }
			})
		);
		const response = await getDream(event(ada, { params: { id } }));
		const dream = (await response.json()) as {
			activeTurnId: string;
			path: { id: string; sealed: { ciphertext: string } }[];
		};
		expect(dream.activeTurnId).toBe(turnId);
		expect(dream.path.map((entry) => entry.sealed.ciphertext)).toEqual([turn.ciphertext]);
	});

	it('answers someone else’s daydream as not there', async () => {
		const id = crypto.randomUUID();
		await create(event(ada, { json: { id, setup: await sealed('setup') } }));
		const jun = await createTestUser(db, { name: 'Jun' });
		await grantTestDreams(db, jun.id);
		expect(await runAndCatch(() => getDream(event(jun, { params: { id } })))).toMatchObject({
			type: 'error',
			status: 404
		});
	});
});

describe('POST /api/dreams/passage', () => {
	async function read(response: Response) {
		const events: DreamEvent[] = [];
		for await (const item of readEvents(response.body as ReadableStream<Uint8Array>)) {
			events.push(item);
		}
		return events;
	}

	it('asks for the disclosure to be accepted first', async () => {
		const jun = await createTestUser(db, { name: 'Jun' });
		await grantTestDreams(db, jun.id);
		expect(await runAndCatch(() => passage(event(jun, { json: passageBody })))).toMatchObject({
			type: 'error',
			status: 409
		});
	});

	it('streams the passage as the engine’s events, with the limits in the prompt', async () => {
		const response = await passage(event(ada, { json: passageBody }));
		const events = await read(response);
		expect(
			events
				.filter((item) => item.type === 'text')
				.map((item) => item.text)
				.join('')
		).toBe(PROSE);
		expect(events.at(-1)).toMatchObject({ type: 'done', ended: 'complete' });
		const [, init] = upstream.mock.calls[0] as [string, RequestInit];
		const sent = JSON.parse(String(init.body));
		expect(sent.messages[0].content).toContain('Nothing about feet');
		expect(String(init.body)).not.toContain('sk-or-test');
	});

	it('sends only to a provider with full adult support, whatever the heat', async () => {
		await read(
			await passage(
				event(ada, { json: { ...passageBody, setup: { ...passageBody.setup, heat: 'none' } } })
			)
		);
		const [, init] = upstream.mock.calls[0] as [string, RequestInit];
		expect(JSON.parse(String(init.body)).provider).toEqual({
			data_collection: 'deny',
			order: ['open/fp8'],
			allow_fallbacks: false
		});
	});

	it('refuses, asking nobody, when no provider has full adult support', async () => {
		await saveCheck(db, MODEL, {
			provider: 'open/fp8',
			order: 1,
			levelPassed: 3,
			at: new Date(),
			reason: null
		});
		const result = await runAndCatch(() => passage(event(ada, { json: passageBody })));
		expect(result).toMatchObject({ type: 'error', status: 503 });
		expect(JSON.stringify(result)).toContain('Admin → Server settings');
		expect(upstream).not.toHaveBeenCalled();
	});

	it('refuses a malformed request without asking the model', async () => {
		expect(
			await runAndCatch(() =>
				passage(event(ada, { json: { ...passageBody, setup: { heat: 'scorching' } } }))
			)
		).toMatchObject({ type: 'error', status: 400 });
		expect(upstream).not.toHaveBeenCalled();
	});
});
