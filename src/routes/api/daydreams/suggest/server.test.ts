import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUGGEST_RULES } from '$lib/server/daydream/suggest-prompt';
import { acceptDisclosure } from '$lib/server/daydreams';
import type { Db } from '$lib/server/db';
import type { RateLimitResult } from '$lib/server/rate-limit';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import { createTestUser, grantTestDaydreams, type TestUser } from '$lib/testing/fixtures';
import { POST } from './+server';

/**
 * The suggest endpoint: the second place the server handles a user's words
 * in plaintext, held to the same rules as the replies.
 */
const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env }));

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
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
	await grantTestDaydreams(db, ada.id);
	await acceptDisclosure(db, ada.id);
	env.OPENROUTER_API_KEY = 'sk-or-test';
	env.DAYDREAM_MODEL = 'test/model';
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
				db,
				user,
				json,
				...(daydreamSuggestRateLimit ? { daydreamSuggestRateLimit } : {})
			})
		)
	);
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
		env.OPENROUTER_API_KEY = undefined;
		expect(await post(ada)).toMatchObject({ status: 503 });
	});

	it('refuses a malformed request without counting it', async () => {
		const limit = vi.fn(async (): Promise<RateLimitResult> => ({ allowed: true }));
		expect(await post(ada, { ...body, field: 'premise' }, limit)).toMatchObject({ status: 400 });
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
		expect(await post(ada)).toMatchObject({ status: 502 });
		upstream.mockRejectedValueOnce(new TypeError(`failed for ${SECRET_WORDS}`));
		expect(await post(ada)).toMatchObject({ status: 502 });
		await post(ada);
		for (const spy of spies) {
			expect(JSON.stringify(spy.mock.calls)).not.toContain(SECRET_WORDS);
		}
	});
});
