import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUGGEST_RULES } from '$lib/server/daydream/suggest-prompt';
import { acceptDisclosure } from '$lib/server/daydreams';
import type { Db } from '$lib/server/db';
import { grantFeature } from '$lib/server/features';
import type { RateLimitResult } from '$lib/server/rate-limit';
import type { ServerSettingKey } from '$lib/server-settings';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import { createTestUser, grantTestDaydreams, type TestUser } from '$lib/testing/fixtures';
import { testSettings } from '$lib/testing/settings';
import { POST } from './+server';

/**
 * The suggest endpoint: the second place the server handles a user's words
 * in plaintext, held to the same rules as the replies.
 */
const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env }));

/** The server's settings for the next request, reset before each test. */
let configured: Partial<Record<ServerSettingKey, string>> = {};

const SECRET_WORDS = 'the-blue-door-in-the-cellar';

let harness: TestDb;
let db: Db;
let ada: TestUser;
let upstream: ReturnType<typeof vi.fn>;

const body = {
	task: 'chips',
	target: 'character',
	field: 'likes',
	draft: { name: 'Mara', notes: SECRET_WORDS },
	context: { characters: [], limits: '' }
};

beforeEach(async () => {
	configured = {};
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
	await grantTestDaydreams(db, ada.id);
	await acceptDisclosure(db, ada.id);
	configured.openrouterApiKey = 'sk-or-test';
	configured.openrouterStoryModel = JSON.stringify({ openrouterModelId: 'test/model' });
	env.OPENROUTER_BASE_URL = 'https://models.test/api/v1';
	upstream = vi.fn(async () =>
		Response.json({ choices: [{ message: { content: '{"chips":["praise"]}' } }] })
	);
	vi.stubGlobal('fetch', upstream);
});

afterEach(() => {
	harness.close();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function post(
	user: TestUser | null,
	json: unknown = body,
	daydreamSuggestRateLimit?: () => Promise<RateLimitResult>
) {
	return runAndCatch(() =>
		POST(
			fakeEvent({
				settings: testSettings(configured),
				db,
				user,
				json,
				...(daydreamSuggestRateLimit ? { daydreamSuggestRateLimit } : {})
			})
		)
	);
}

/** A failed request's status and JSON body. */
async function failure() {
	const result = await post(ada);
	if (result.type !== 'ok') {
		throw new Error(`expected a response, not ${JSON.stringify(result)}`);
	}
	return { status: result.value.status, body: await result.value.json() };
}

describe('POST /api/daydreams/suggest', () => {
	it('passes the provider’s answer straight back', async () => {
		const result = await post(ada);
		if (result.type !== 'ok') {
			throw new Error(JSON.stringify(result));
		}
		expect(await result.value.json()).toEqual({
			choices: [{ message: { content: '{"chips":["praise"]}' } }]
		});
	});

	it('sends the server’s own rules, asks for JSON, and only from providers that keep nothing', async () => {
		await post(ada);
		const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://models.test/api/v1/chat/completions');
		const sent = JSON.parse(String(init.body));
		expect(sent).toMatchObject({
			model: 'test/model',
			response_format: { type: 'json_object' },
			provider: { data_collection: 'deny' }
		});
		expect(sent.stream).toBeUndefined();
		expect(sent.messages[0].content.startsWith(SUGGEST_RULES)).toBe(true);
	});

	it('refuses a visitor, an account without the feature, and before the disclosure', async () => {
		const bo = await createTestUser(db, { name: 'Bo' });
		expect(await post(null)).toMatchObject({ status: 401 });
		expect(await post(bo)).toMatchObject({ status: 403 });
		const cy = await createTestUser(db, { name: 'Cy' });
		await grantTestDaydreams(db, cy.id);
		expect(await post(cy)).toMatchObject({ status: 409 });
		expect(upstream).not.toHaveBeenCalled();
	});

	it('is unavailable on a server with no key', async () => {
		configured.openrouterApiKey = '';
		expect(await post(ada)).toMatchObject({ status: 503 });
	});

	it('refuses a malformed request without counting it', async () => {
		const limit = vi.fn(async (): Promise<RateLimitResult> => ({ allowed: true }));
		expect(await post(ada, { ...body, field: 'premise' }, limit)).toMatchObject({ status: 400 });
		expect(limit).not.toHaveBeenCalled();
	});

	it('writes a casting, names a daydream from its opening, and generates ideas, under the same rules', async () => {
		const casting = {
			task: 'casting',
			character: { name: 'Mara', notes: SECRET_WORDS },
			idea: { title: 'After hours', premise: 'an interview' },
			part: { name: 'the interviewer', description: '' },
			others: [],
			stance: 'self',
			limits: ''
		};
		const naming = {
			task: 'name',
			idea: { title: 'After hours', premise: 'an interview' },
			characters: ['Mara'],
			opening: SECRET_WORDS,
			limits: ''
		};
		const ideas = { task: 'ideas', brief: SECRET_WORDS, side: 'sub', limits: '' };
		for (const json of [casting, naming, ideas]) {
			expect(await post(ada, json)).toMatchObject({ type: 'ok' });
		}
		const sent = upstream.mock.calls.map(([, init]) =>
			JSON.parse(String((init as RequestInit).body))
		);
		for (const each of sent) {
			expect(each.messages[0].content.startsWith(SUGGEST_RULES)).toBe(true);
			expect(each.provider).toEqual({ data_collection: 'deny' });
			expect(each.messages.at(-1).content).toContain(SECRET_WORDS);
		}
	});

	it('reads a brief’s links through the Responses API, only with a model that calls tools', async () => {
		const brief = `inspired by https://www.reddit.com/r/example/ and ${SECRET_WORDS}`;
		const ideas = { task: 'ideas', brief, side: 'sub', limits: '' };
		const daydream = { task: 'daydream', brief, side: 'sub', limits: '' };
		const sent = (call: number) => {
			const [url, init] = upstream.mock.calls[call] as [string, RequestInit];
			return { url, body: JSON.parse(String(init.body)) };
		};

		// Saved before tools were asked about: the links go as text.
		await post(ada, ideas);
		expect(sent(0).url).toBe('https://models.test/api/v1/chat/completions');
		expect(sent(0).body.tools).toBeUndefined();

		configured.openrouterStoryModel = JSON.stringify({
			openrouterModelId: 'test/model',
			tools: true
		});
		await post(ada, ideas);
		await post(ada, daydream);
		for (const call of [1, 2]) {
			const { url, body: reading } = sent(call);
			// Only the Responses API says what each fetch got, for debug mode.
			expect(url).toBe('https://models.test/api/v1/responses');
			expect(reading).toMatchObject({
				model: 'test/model',
				tools: [{ type: 'openrouter:web_fetch', parameters: { engine: 'parallel' } }],
				text: { format: { type: 'json_object' } },
				provider: { data_collection: 'deny' }
			});
			expect(reading.messages).toBeUndefined();
			expect(reading.input[0].content.startsWith(SUGGEST_RULES)).toBe(true);
			expect(reading.input.at(-1).content).toContain(SECRET_WORDS);
			expect(reading.input.at(-1).content).toContain('web_fetch');
		}
		expect(sent(1).body.max_output_tokens).toBeGreaterThan(sent(0).body.max_tokens);

		// Nothing to read, or a task that takes no brief: Chat Completions, no tool.
		await post(ada, { ...ideas, brief: SECRET_WORDS });
		await post(ada);
		for (const call of [3, 4]) {
			expect(sent(call).url).toBe('https://models.test/api/v1/chat/completions');
			expect(sent(call).body.tools).toBeUndefined();
		}
	});

	it('passes a Responses answer back unread, fetches and all', async () => {
		configured.openrouterStoryModel = JSON.stringify({
			openrouterModelId: 'test/model',
			tools: true
		});
		const answer = {
			output: [
				{ type: 'openrouter:web_fetch', status: 'completed', url: 'https://a.test/', content: 'x' },
				{ type: 'message', content: [{ type: 'output_text', text: '{"ideas":[]}' }] }
			]
		};
		upstream.mockResolvedValueOnce(Response.json(answer));
		const result = await post(ada, {
			task: 'ideas',
			brief: 'from https://a.test/',
			side: null,
			limits: ''
		});
		if (result.type !== 'ok') {
			throw new Error(JSON.stringify(result));
		}
		expect(await result.value.json()).toEqual(answer);
	});

	it('adds what it sent to a draft’s or ideas’ answer, only when asked and only for debug mode', async () => {
		const daydream = { task: 'daydream', brief: SECRET_WORDS, limits: '', debugLog: true };
		const answer = { choices: [{ message: { content: '{"voice":"talk"}' } }] };
		const read = async (json: unknown) => {
			const result = await post(ada, json);
			if (result.type !== 'ok') {
				throw new Error(JSON.stringify(result));
			}
			return result.value.json();
		};

		// Without the feature, the flag is ignored.
		upstream.mockResolvedValueOnce(Response.json(answer));
		expect(await read(daydream)).toEqual(answer);

		await grantFeature(db, { userId: ada.id, feature: 'debugMode', grantedByUserId: ada.id });
		upstream.mockResolvedValueOnce(Response.json(answer));
		const logged = await read(daydream);
		expect(logged.choices).toEqual(answer.choices);
		// The very body that went to the provider, as text.
		const [, init] = upstream.mock.calls.at(-1) as [string, RequestInit];
		expect(logged.boundUpRequest).toBe(init.body);
		const sent = JSON.parse(logged.boundUpRequest);
		expect(sent.model).toBe('test/model');
		expect(sent.messages[0].content.startsWith(SUGGEST_RULES)).toBe(true);
		expect(sent.messages.at(-1).content).toContain(SECRET_WORDS);
		// Never the key.
		expect(JSON.stringify(logged)).not.toContain('sk-or-test');

		// Not asked, or another task: passed back as it came.
		upstream.mockResolvedValueOnce(Response.json(answer));
		expect(await read({ ...daydream, debugLog: false })).toEqual(answer);
		upstream.mockResolvedValueOnce(Response.json(answer));
		expect(await read({ ...body, debugLog: true })).toEqual(answer);
		// Generated ideas take it too.
		upstream.mockResolvedValueOnce(Response.json(answer));
		expect(
			await read({ task: 'ideas', brief: SECRET_WORDS, side: null, limits: '', debugLog: true })
		).toHaveProperty('boundUpRequest');
		// An answer with nowhere to put it goes back as it came.
		upstream.mockResolvedValueOnce(new Response('not json'));
		const result = await post(ada, daydream);
		expect(result.type === 'ok' && (await result.value.text())).toBe('not json');
	});

	it('refuses an opening too long to name from, without counting it', async () => {
		const limit = vi.fn(async (): Promise<RateLimitResult> => ({ allowed: true }));
		const naming = {
			task: 'name',
			idea: { title: 'After hours', premise: 'an interview' },
			characters: [],
			opening: 'x'.repeat(2001),
			limits: ''
		};
		expect(await post(ada, naming, limit)).toMatchObject({ status: 400 });
		expect(limit).not.toHaveBeenCalled();
	});

	it('refuses past its own limit, saying how long to wait', async () => {
		const result = await post(ada, body, async () => ({ allowed: false, retryAfterSeconds: 9 }));
		if (result.type !== 'ok') {
			throw new Error(JSON.stringify(result));
		}
		expect(result.value.status).toBe(429);
		expect(result.value.headers.get('retry-after')).toBe('9');
		expect(upstream).not.toHaveBeenCalled();
	});

	it('answers a provider failure with a 502, and never logs what the user wrote', async () => {
		const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
			vi.spyOn(console, method).mockImplementation(() => undefined)
		);
		upstream.mockResolvedValueOnce(new Response(`echo: ${SECRET_WORDS}`, { status: 500 }));
		expect(await failure()).toEqual({
			status: 502,
			body: { message: 'No suggestions just now. Try again in a moment.' }
		});
		upstream.mockRejectedValueOnce(new TypeError(`failed for ${SECRET_WORDS}`));
		expect((await failure()).status).toBe(502);
		await grantFeature(db, { userId: ada.id, feature: 'debugMode', grantedByUserId: ada.id });
		upstream.mockResolvedValueOnce(new Response(`echo: ${SECRET_WORDS}`, { status: 500 }));
		await failure();
		for (const spy of spies) {
			expect(JSON.stringify(spy.mock.calls)).not.toContain(SECRET_WORDS);
		}
	});

	it('says what went wrong with the provider only to an account holding debug mode', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		upstream.mockResolvedValueOnce(new Response('{"error":"model overloaded"}', { status: 503 }));
		expect((await failure()).body).not.toHaveProperty('detail');

		await grantFeature(db, { userId: ada.id, feature: 'debugMode', grantedByUserId: ada.id });
		upstream.mockResolvedValueOnce(new Response('{"error":"model overloaded"}', { status: 503 }));
		expect((await failure()).body).toEqual({
			message: 'No suggestions just now. Try again in a moment.',
			detail: 'The model provider answered 503:\n{"error":"model overloaded"}'
		});
		upstream.mockRejectedValueOnce(new TypeError('fetch failed'));
		expect((await failure()).body).toMatchObject({
			detail: 'The model provider could not be reached: fetch failed'
		});
	});
});
