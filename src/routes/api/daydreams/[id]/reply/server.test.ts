import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RULES } from '$lib/server/daydream/prompt';
import { acceptDisclosure } from '$lib/server/daydreams';
import type { Db } from '$lib/server/db';
import { grantFeature } from '$lib/server/features';
import type { RateLimitResult } from '$lib/server/rate-limit';
import type { ServerSettingKey } from '$lib/server-settings';
import { testDaydreamSetup } from '$lib/testing/daydream-setup';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import {
	createTestDaydream,
	createTestUser,
	grantTestDaydreams,
	type TestUser
} from '$lib/testing/fixtures';
import { testSettings } from '$lib/testing/settings';
import { POST } from './+server';

/**
 * The reply endpoint: one of the two places the server handles a user's
 * words in plaintext (the suggest endpoint is the other). `fetch` stands in for OpenRouter, and `$env/dynamic/private` for
 * the server's configuration; these routes never see a platform, as under
 * `vite dev`.
 */
const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env }));

/** The server's settings for the next request, reset before each test. */
let configured: Partial<Record<ServerSettingKey, string>> = {};

/** Something only the user wrote, to look for anywhere it must not be. */
const SECRET_WORDS = 'the-blue-door-in-the-cellar';

let harness: TestDb;
let db: Db;
let ada: TestUser;
let jun: TestUser;
let upstream: ReturnType<typeof vi.fn>;

const setup = testDaydreamSetup();
const USER_TURN = `I tell her about ${SECRET_WORDS}.`;
const body = {
	mode: 'reply',
	setup,
	turns: [
		{ type: 'text', role: 'story', text: 'Sit.' },
		{ type: 'text', role: 'user', text: USER_TURN }
	],
	currentDirections: [{ id: 'slower', label: 'Slower' }]
};

function sse(...pieces: string[]): Response {
	const text = `${pieces.map((piece) => `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`).join('')}data: [DONE]\n\n`;
	return new Response(text, { headers: { 'content-type': 'text/event-stream' } });
}

beforeEach(async () => {
	configured = {};
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
	jun = await createTestUser(db, { name: 'Jun' });
	await grantTestDaydreams(db, ada.id);
	await grantTestDaydreams(db, jun.id);
	await acceptDisclosure(db, ada.id);
	configured.openrouterApiKey = 'sk-or-test';
	configured.openrouterStoryModel = JSON.stringify({ openrouterModelId: 'test/model' });
	env.OPENROUTER_BASE_URL = 'https://models.test/api/v1';
	upstream = vi.fn(async () => sse('Mara ', 'smiles.'));
	vi.stubGlobal('fetch', upstream);
});

afterEach(() => {
	harness.close();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function post(
	user: TestUser | null,
	id: string,
	json: unknown = body,
	daydreamRateLimit?: () => Promise<RateLimitResult>
) {
	return runAndCatch(() =>
		POST(
			fakeEvent({
				settings: testSettings(configured),
				db,
				user,
				params: { id },
				json,
				...(daydreamRateLimit ? { daydreamRateLimit } : {})
			})
		)
	);
}

describe('POST /api/daydreams/[id]/reply', () => {
	it('streams the model’s reply straight back as server-sent events', async () => {
		const { id } = await createTestDaydream(db, ada.id, ['story', 'user']);
		const result = await post(ada, id);
		expect(result.type).toBe('ok');
		if (result.type !== 'ok') {
			return;
		}
		expect(result.value.headers.get('content-type')).toBe('text/event-stream');
		expect(await result.value.text()).toContain('smiles.');
	});

	it('for debug mode, says first the very request it sent the model, then streams the reply as it came', async () => {
		await grantFeature(db, { userId: ada.id, feature: 'debugMode', grantedByUserId: ada.id });
		const { id } = await createTestDaydream(db, ada.id, ['story', 'user']);
		const result = await post(ada, id, { ...body, record: true });
		if (result.type !== 'ok') {
			throw new Error(`expected a reply, got ${result.type}`);
		}
		const text = await result.value.text();
		const end = text.indexOf('\n\n');
		const { boundUpRequest } = JSON.parse(text.slice('data: '.length, end));
		const [, init] = upstream.mock.calls[0] as unknown as [string, RequestInit];
		expect(boundUpRequest).toBe(init.body);
		const sent = JSON.parse(boundUpRequest);
		expect(sent.messages[0].content.startsWith(RULES)).toBe(true);
		expect(sent.messages.at(-1).content).toContain(USER_TURN);
		// The usage, for the raw log's "How it ended"; and never the key.
		expect(sent.usage).toEqual({ include: true });
		expect(text).not.toContain('sk-or-test');
		// The provider's stream after it, untouched.
		expect(text.slice(end + 2)).toContain('smiles.');
	});

	it('sends nothing of its own unless asked to record, by an account holding debug mode', async () => {
		const { id } = await createTestDaydream(db, ada.id, ['story', 'user']);
		for (const asked of [body, { ...body, record: true }]) {
			const result = await post(ada, id, asked);
			if (result.type !== 'ok') {
				throw new Error(`expected a reply, got ${result.type}`);
			}
			expect(await result.value.text()).not.toContain('boundUpRequest');
		}
		for (const call of upstream.mock.calls as unknown as [string, RequestInit][]) {
			expect(JSON.parse(String(call[1].body)).usage).toBeUndefined();
		}
	});

	it('sends the server’s own rules first, and asks only for providers that keep nothing', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		await post(ada, id);

		expect(upstream).toHaveBeenCalledOnce();
		const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://models.test/api/v1/chat/completions');
		expect(new Headers(init.headers).get('authorization')).toBe('Bearer sk-or-test');
		const sent = JSON.parse(String(init.body));
		expect(sent).toMatchObject({
			model: 'test/model',
			stream: true,
			provider: { data_collection: 'deny' }
		});
		expect(sent.messages[0].role).toBe('system');
		expect(sent.messages[0].content.startsWith(RULES)).toBe(true);
		// The buttons on screen, for the model to add to or prune.
		expect(sent.messages[0].content).not.toContain('"Slower" (id "slower")');
		expect(sent.messages.at(-1)).toEqual({
			role: 'user',
			content: `${USER_TURN}\n\n(Direction buttons on screen now: "Slower" (id "slower").)`
		});
		// Room for the passage, the metadata block after it, and reasoning first.
		expect(sent.max_tokens).toBe(6000);
		expect(sent.temperature).toBe(0.9);
		// So pressing Stop ends the request upstream as well.
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});

	it('refuses an unsigned visitor', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		expect(await post(null, id)).toMatchObject({ type: 'error', status: 401 });
	});

	it('refuses an account without the feature', async () => {
		const bo = await createTestUser(db, { name: 'Bo' });
		const { id } = await createTestDaydream(db, ada.id);
		expect(await post(bo, id)).toMatchObject({ type: 'error', status: 403 });
		expect(upstream).not.toHaveBeenCalled();
	});

	it('is unavailable on a server with no key', async () => {
		configured.openrouterApiKey = '';
		const { id } = await createTestDaydream(db, ada.id);
		expect(await post(ada, id)).toMatchObject({ type: 'error', status: 503 });
		expect(upstream).not.toHaveBeenCalled();
	});

	it("answers someone else's daydream as not there", async () => {
		await acceptDisclosure(db, jun.id);
		const { id } = await createTestDaydream(db, ada.id);
		expect(await post(jun, id)).toMatchObject({ type: 'error', status: 404 });
		expect(upstream).not.toHaveBeenCalled();
	});

	it('sends nothing on until the user has accepted where it goes', async () => {
		const { id } = await createTestDaydream(db, jun.id);
		expect(await post(jun, id)).toMatchObject({ type: 'error', status: 409 });
		expect(upstream).not.toHaveBeenCalled();
	});

	it('writes another take a little hotter than a reply, for one that goes another way', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		await post(ada, id, { ...body, mode: 'rewrite', rewrite: { targetText: 'Sit.', again: true } });
		const [, init] = upstream.mock.calls[0] as [string, RequestInit];
		expect(JSON.parse(String(init.body)).temperature).toBe(1.05);
	});

	it('refuses a rewrite that does not say what to rewrite', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		expect(await post(ada, id, { ...body, mode: 'rewrite' })).toMatchObject({
			type: 'error',
			status: 400
		});
		expect(upstream).not.toHaveBeenCalled();
	});

	it('refuses a setup no device could have sealed', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		const watchingNobody = testDaydreamSetup({
			voice: { narrator: 'third-person', stance: 'absent', protagonistName: '' },
			characters: []
		});
		expect(await post(ada, id, { ...body, setup: watchingNobody })).toMatchObject({
			type: 'error',
			status: 400
		});
	});

	it('refuses a malformed request without counting it against the limit', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		const limit = vi.fn(async (): Promise<RateLimitResult> => ({ allowed: true }));
		expect(await post(ada, id, { ...body, mode: 'anything' }, limit)).toMatchObject({
			type: 'error',
			status: 400
		});
		expect(limit).not.toHaveBeenCalled();
	});

	it('refuses past the limit, saying how long to wait', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		const result = await post(ada, id, body, async () => ({
			allowed: false,
			retryAfterSeconds: 42
		}));
		expect(result.type).toBe('ok');
		if (result.type !== 'ok') {
			return;
		}
		expect(result.value.status).toBe(429);
		expect(result.value.headers.get('retry-after')).toBe('42');
		expect(await result.value.json()).toEqual({
			message: 'Too many attempts. Try again in 42 seconds.'
		});
		expect(upstream).not.toHaveBeenCalled();
	});

	it('answers a provider failure with a 502, logging only its status', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		upstream.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: { message: `echo: ${SECRET_WORDS}` } }), { status: 500 })
		);
		const { id } = await createTestDaydream(db, ada.id);
		expect(await post(ada, id)).toMatchObject({ type: 'error', status: 502 });
		expect(logged).toHaveBeenCalledOnce();
		expect(JSON.stringify(logged.mock.calls)).not.toContain(SECRET_WORDS);
		expect(JSON.stringify(logged.mock.calls)).toContain('500');
	});

	it('answers an unreachable provider with a 502, logging nothing of the request', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		upstream.mockRejectedValueOnce(new TypeError(`fetch failed for ${SECRET_WORDS}`));
		const { id } = await createTestDaydream(db, ada.id);
		expect(await post(ada, id)).toMatchObject({ type: 'error', status: 502 });
		expect(JSON.stringify(logged.mock.calls)).not.toContain(SECRET_WORDS);
	});

	it('never writes what the user said to the console when it works', async () => {
		const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
			vi.spyOn(console, method).mockImplementation(() => undefined)
		);
		const { id } = await createTestDaydream(db, ada.id);
		const result = await post(ada, id);
		if (result.type === 'ok') {
			await result.value.text();
		}
		for (const spy of spies) {
			expect(JSON.stringify(spy.mock.calls)).not.toContain(SECRET_WORDS);
		}
	});
});
