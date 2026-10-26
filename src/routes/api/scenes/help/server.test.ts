import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '$lib/server/db';
import type { RateLimitResult } from '$lib/server/rate-limit';
import { acceptSceneHelp, hasAcceptedSceneHelp } from '$lib/server/scenes/help';
import type { ServerSettingKey } from '$lib/server-settings';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import { createTestUser, type TestUser } from '$lib/testing/fixtures';
import { testSettings } from '$lib/testing/settings';
import { POST } from './+server';
import { POST as consent } from './consent/+server';

/**
 * Help from the model with a scene: one of the places the server handles a
 * person's words in plaintext, held to the daydreams' rules. See
 * docs/scenes.md, "Help from the model".
 */
const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env }));

const SECRET_WORDS = 'the-blue-door-in-the-cellar';

let harness: TestDb;
let db: Db;
let ada: TestUser;
let configured: Partial<Record<ServerSettingKey, string>>;
let upstream: ReturnType<typeof vi.fn>;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
	configured = {
		openrouterApiKey: 'sk-or-test',
		storyModel: JSON.stringify({ openrouterModelId: 'test/model' })
	};
	env.OPENROUTER_BASE_URL = 'https://models.test/api/v1';
	upstream = vi.fn(async () =>
		Response.json({ choices: [{ message: { content: '{"chips":["a hotel room"]}' } }] })
	);
	vi.stubGlobal('fetch', upstream);
});

afterEach(() => {
	harness.close();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const body = { task: 'story-chips', line: 'where', page: SECRET_WORDS };

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

describe('POST /api/scenes/help', () => {
	it('is for someone signed in', async () => {
		expect(await post(null)).toMatchObject({ type: 'error', status: 401 });
	});

	it('is not there without a model set up', async () => {
		configured = {};
		await acceptSceneHelp(db, ada.id);
		expect(await post(ada)).toMatchObject({ type: 'error', status: 503 });
	});

	/** The agreement is the server's to check: nothing leaves without it. */
	it('sends nothing until the person has agreed', async () => {
		expect(await post(ada)).toMatchObject({ type: 'error', status: 409 });
		expect(upstream).not.toHaveBeenCalled();
	});

	it('refuses a request it does not understand', async () => {
		await acceptSceneHelp(db, ada.id);
		expect(await post(ada, { task: 'write-my-novel' })).toMatchObject({
			type: 'error',
			status: 400
		});
	});

	it('honours the rate limit before asking', async () => {
		await acceptSceneHelp(db, ada.id);
		const result = await post(ada, body, () =>
			Promise.resolve({ allowed: false, retryAfterSeconds: 30 })
		);
		expect(result).toMatchObject({ type: 'ok' });
		expect(result.type === 'ok' && result.value.status).toBe(429);
		expect(upstream).not.toHaveBeenCalled();
	});

	it('asks the model, without letting the provider keep it, and passes the answer back', async () => {
		await acceptSceneHelp(db, ada.id);
		const log = vi.spyOn(console, 'error');
		const result = await post(ada);
		expect(result.type === 'ok' && (await result.value.json())).toEqual({
			task: 'story-chips',
			chips: ['a hotel room']
		});
		const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://models.test/api/v1/chat/completions');
		const sent = JSON.parse(String(init.body));
		expect(sent).toMatchObject({ model: 'test/model', provider: { data_collection: 'deny' } });
		expect(JSON.stringify(sent.messages)).toContain(SECRET_WORDS);
		expect(log).not.toHaveBeenCalled();
	});

	it('never logs what was written, even when the model answers nonsense', async () => {
		await acceptSceneHelp(db, ada.id);
		upstream.mockImplementation(async () =>
			Response.json({ choices: [{ message: { content: `Sorry: ${SECRET_WORDS}` } }] })
		);
		const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		expect(await post(ada)).toMatchObject({ type: 'error', status: 502 });
		expect(JSON.stringify(log.mock.calls)).not.toContain(SECRET_WORDS);
	});
});

describe('POST /api/scenes/help/consent', () => {
	it('records the agreement, once', async () => {
		const event = () => fakeEvent({ db, user: ada });
		await consent(event());
		await consent(event());
		expect(await hasAcceptedSceneHelp(db, ada.id)).toBe(true);
	});
});
