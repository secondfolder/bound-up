import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSseEvents } from '$lib/daydream/sse';
import { SUGGEST_RULES } from '$lib/server/daydream/suggest-prompt';
import { acceptDisclosure } from '$lib/server/daydreams';
import type { Db } from '$lib/server/db';
import { grantFeature } from '$lib/server/features';
import type { RateLimitResult } from '$lib/server/rate-limit';
import type { ServerSettingKey } from '$lib/server-settings';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
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
	configured.storyModel = JSON.stringify({ openrouterModelId: 'test/model' });
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

/** The events of a streamed answer, by name, with their data parsed. */
async function eventsOf(response: Response): Promise<{ event: string | null; data: unknown }[]> {
	const type = response.headers.get('content-type');
	if (type !== 'text/event-stream') {
		throw new Error(`expected a stream of events, not ${type}`);
	}
	const events: { event: string | null; data: unknown }[] = [];
	for await (const { event, data } of readSseEvents(defined(response.body, 'a body'))) {
		events.push({ event, data: JSON.parse(data) });
	}
	return events;
}

/** The events of the answer to `json`. */
async function streamed(json: unknown = body) {
	const result = await post(ada, json);
	if (result.type !== 'ok') {
		throw new Error(JSON.stringify(result));
	}
	return eventsOf(result.value);
}

/** What the `done` event carried: the answer, whole. */
async function answerTo(json: unknown = body) {
	const done = (await streamed(json)).find((each) => each.event === 'done');
	return defined(done, 'a done event').data;
}

/** A provider's stream of these events, as `text/event-stream`. */
function sse(...events: string[]) {
	return new Response(events.join(''), { headers: { 'content-type': 'text/event-stream' } });
}
const chunk = (fields: Record<string, unknown>) => `data: ${JSON.stringify(fields)}\n\n`;

/** A failed request's status and JSON body. */
async function failure() {
	const result = await post(ada);
	if (result.type !== 'ok') {
		throw new Error(`expected a response, not ${JSON.stringify(result)}`);
	}
	return { status: result.value.status, body: await result.value.json() };
}

describe('POST /api/daydreams/suggest', () => {
	it('passes back a provider’s whole answer as it came, when it did not stream', async () => {
		expect(await answerTo()).toEqual({
			choices: [{ message: { content: '{"chips":["praise"]}' } }]
		});
	});

	it('streams how it is going, and ends with the answer put back together', async () => {
		upstream.mockResolvedValueOnce(
			sse(
				': OPENROUTER PROCESSING\n\n',
				chunk({ choices: [{ delta: { reasoning: SECRET_WORDS } }] }),
				chunk({ choices: [{ delta: { content: '{"chips":' } }] }),
				chunk({ choices: [{ delta: { content: '["praise"]}' }, finish_reason: 'stop' }] }),
				'data: [DONE]\n\n'
			)
		);
		const events = await streamed();
		expect(events[0]).toEqual({
			event: 'progress',
			data: { stage: 'waiting', chars: 0, reasoningChars: 0, pagesRead: 0 }
		});
		expect(events.map((each) => each.event)).toContain('progress');
		expect(events.at(-2)).toEqual({
			event: 'progress',
			data: {
				stage: 'writing',
				chars: '{"chips":["praise"]}'.length,
				reasoningChars: SECRET_WORDS.length,
				pagesRead: 0
			}
		});
		expect(events.at(-1)).toEqual({
			event: 'done',
			data: {
				choices: [
					{
						message: {
							role: 'assistant',
							content: '{"chips":["praise"]}',
							reasoning: SECRET_WORDS
						},
						finish_reason: 'stop'
					}
				]
			}
		});
		// Nothing of what was written goes anywhere but the answer, without debug mode.
		expect(events.some((each) => each.event === 'delta' || each.event === 'request')).toBe(false);
	});

	it('sends the request and every piece as it comes only to debug mode, and only when asked', async () => {
		const stream = () =>
			sse(
				chunk({ choices: [{ delta: { reasoning: 'Hmm.' } }] }),
				chunk({ choices: [{ delta: { content: '{}' }, finish_reason: 'stop' }] }),
				'data: [DONE]\n\n'
			);
		const live = { ...body, live: 'full' };

		// Asked, without the feature: progress only.
		upstream.mockResolvedValueOnce(stream());
		const refused = await streamed(live);
		expect(refused.map((each) => each.event)).not.toContain('delta');
		expect(refused.map((each) => each.event)).not.toContain('request');

		await grantFeature(db, { userId: ada.id, feature: 'debugMode', grantedByUserId: ada.id });
		upstream.mockResolvedValueOnce(stream());
		const events = await streamed(live);
		const [, init] = upstream.mock.calls.at(-1) as [string, RequestInit];
		expect(events[0]).toEqual({ event: 'request', data: { body: init.body } });
		expect(events.filter((each) => each.event === 'delta').map((each) => each.data)).toEqual([
			{ kind: 'reasoning', text: 'Hmm.' },
			{ kind: 'text', text: '{}' }
		]);
		// Never the key.
		expect(JSON.stringify(events)).not.toContain('sk-or-test');

		// Not asked: progress only, even for debug mode.
		upstream.mockResolvedValueOnce(stream());
		expect((await streamed()).map((each) => each.event)).not.toContain('delta');
	});

	it('says a stream that failed partway failed, with what went wrong for debug mode', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const broken = () =>
			sse(
				chunk({ choices: [{ delta: { content: '{"ch' } }] }),
				chunk({ error: { message: 'overloaded' } })
			);
		upstream.mockResolvedValueOnce(broken());
		expect((await streamed()).at(-1)).toEqual({
			event: 'failed',
			data: { message: 'No suggestions just now. Try again in a moment.' }
		});

		await grantFeature(db, { userId: ada.id, feature: 'debugMode', grantedByUserId: ada.id });
		upstream.mockResolvedValueOnce(broken());
		const failed = (await streamed()).at(-1);
		expect(failed?.event).toBe('failed');
		expect(JSON.stringify(failed?.data)).toContain('overloaded');
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
		expect(sent.stream).toBe(true);
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
		// The ideas round runs hotter than the rest, for spread across asks.
		expect(sent[0].temperature).toBe(1);
		expect(sent[1].temperature).toBe(1);
		expect(sent[2].temperature).toBeGreaterThan(1);
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

		configured.storyModel = JSON.stringify({
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
				// Only the brief's own site, and its link plus a few an index leads to.
				tools: [
					{
						type: 'openrouter:web_fetch',
						parameters: { engine: 'parallel', max_uses: 5, allowed_domains: ['www.reddit.com'] }
					}
				],
				text: { format: { type: 'json_object' } },
				provider: { data_collection: 'deny' },
				stream: true
			});
			expect(reading.messages).toBeUndefined();
			expect(reading.input[0].content.startsWith(SUGGEST_RULES)).toBe(true);
			expect(reading.input.at(-1).content).toContain(SECRET_WORDS);
			expect(reading.input.at(-1).content).toContain('web_fetch');
		}
		expect(sent(1).body.max_output_tokens).toBeGreaterThan(sent(0).body.max_tokens);
		// The ideas round runs hotter through this API too; a whole daydream keeps the default.
		expect(sent(1).body.temperature).toBeGreaterThan(1);
		expect(sent(2).body.temperature).toBe(1);

		// Nothing to read, or a task that takes no brief: Chat Completions, no tool.
		await post(ada, { ...ideas, brief: SECRET_WORDS });
		await post(ada);
		for (const call of [3, 4]) {
			expect(sent(call).url).toBe('https://models.test/api/v1/chat/completions');
			expect(sent(call).body.tools).toBeUndefined();
		}
	});

	it('passes a Responses answer back whole, fetches and all', async () => {
		configured.storyModel = JSON.stringify({
			openrouterModelId: 'test/model',
			tools: true
		});
		const answer = {
			output: [
				{ type: 'openrouter:web_fetch', status: 'completed', url: 'https://a.test/', content: 'x' },
				{ type: 'message', content: [{ type: 'output_text', text: '{"ideas":[]}' }] }
			]
		};
		const ideas = { task: 'ideas', brief: 'from https://a.test/', side: null, limits: '' };
		upstream.mockResolvedValueOnce(Response.json(answer));
		expect(await answerTo(ideas)).toEqual(answer);

		// Streamed, it is the completed response, and the fetch is progress of its own.
		const typed = (type: string, fields: Record<string, unknown>) =>
			`event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`;
		upstream.mockResolvedValueOnce(
			sse(
				typed('response.output_item.added', {
					item: { ...answer.output[0], status: 'in_progress' }
				}),
				typed('response.output_item.done', { item: answer.output[0] }),
				typed('response.output_text.delta', { delta: '{"ideas":[]}' }),
				typed('response.completed', { response: answer })
			)
		);
		const events = await streamed(ideas);
		expect(events.at(-1)).toEqual({ event: 'done', data: answer });
		expect(events.map((each) => each.data)).toContainEqual({
			stage: 'reading',
			chars: 0,
			reasoningChars: 0,
			pagesRead: 0
		});
	});

	it('adds what it sent to a draft’s or ideas’ answer, only when asked and only for debug mode', async () => {
		const daydream = { task: 'daydream', brief: SECRET_WORDS, limits: '', debugLog: true };
		const answer = { choices: [{ message: { content: '{"voice":"talk"}' } }] };
		const read = (json: unknown) => answerTo(json) as Promise<Record<string, unknown>>;

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
		const sent = JSON.parse(String(logged.boundUpRequest));
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
		expect(await answerTo(daydream)).toBe('not json');
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
