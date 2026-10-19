import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PICTURE_MODELS } from '$lib/server/daydream/image-config';
import { acceptDisclosure } from '$lib/server/daydreams';
import type { Db } from '$lib/server/db';
import type { RateLimitResult } from '$lib/server/rate-limit';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import {
	createTestDaydream,
	createTestUser,
	grantTestDaydreams,
	type TestUser
} from '$lib/testing/fixtures';
import { POST } from './+server';

/**
 * The picture endpoint: like the reply endpoint, it handles what a story says
 * in plaintext. `fetch` stands in for Runware, and `$env/dynamic/private` for
 * the server's configuration.
 */
const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env }));

/** Something only the story said, to look for anywhere it must not be. */
const SECRET_WORDS = 'the-blue-door-in-the-cellar';
const PROMPT = `A woman in her thirties by ${SECRET_WORDS}`;
const PICTURE = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);

let harness: TestDb;
let db: Db;
let ada: TestUser;
let upstream: ReturnType<typeof vi.fn>;

const body = { prompt: PROMPT, style: 'photo', heat: 4 };

function runware(): Response {
	const base64 = btoa(String.fromCharCode(...PICTURE));
	return Response.json({ data: [{ taskType: 'imageInference', imageBase64Data: base64 }] });
}

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
	await grantTestDaydreams(db, ada.id);
	await acceptDisclosure(db, ada.id);
	env.RUNWARE_AI_API_KEY = 'rw-test';
	env.RUNWARE_BASE_URL = 'https://images.test/v1';
	upstream = vi.fn(async () => runware());
	vi.stubGlobal('fetch', upstream);
});

afterEach(() => {
	harness.close();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	for (const key of Object.keys(env)) {
		delete env[key];
	}
});

function post(
	user: TestUser | null,
	id: string,
	json: unknown = body,
	daydreamImageRateLimit?: () => Promise<RateLimitResult>
) {
	return runAndCatch(() =>
		POST(
			fakeEvent({
				db,
				user,
				params: { id },
				json,
				...(daydreamImageRateLimit ? { daydreamImageRateLimit } : {})
			})
		)
	);
}

describe('POST /api/daydreams/[id]/image', () => {
	it('asks Runware for the picture, and sends it back as it came', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		const result = await post(ada, id);
		if (result.type !== 'ok') {
			throw new Error(`expected a picture, got ${result.type}`);
		}
		expect(result.value.headers.get('content-type')).toBe('image/webp');
		expect(result.value.headers.get('cache-control')).toBe('no-store');
		expect(new Uint8Array(await result.value.arrayBuffer())).toEqual(PICTURE);

		const [url, init] = upstream.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://images.test/v1');
		expect(new Headers(init.headers).get('authorization')).toBe('Bearer rw-test');
		const [task] = JSON.parse(String(init.body));
		expect(task).toMatchObject({
			taskType: 'imageInference',
			model: DEFAULT_PICTURE_MODELS.photo,
			outputType: 'base64Data'
		});
		expect(task.positivePrompt).toContain(PROMPT);
		expect(task.negativePrompt).toContain('child');
	});

	it('uses the model for the style asked for', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		await post(ada, id, { ...body, style: 'illustrated' });
		const [, init] = upstream.mock.calls[0] as unknown as [string, RequestInit];
		expect(JSON.parse(String(init.body))[0].model).toBe(DEFAULT_PICTURE_MODELS.illustrated);
	});

	it('prompts the default photo model as the Z-Image Turbo it is, without asking', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		await post(ada, id);
		expect(upstream).toHaveBeenCalledTimes(1);
		const [, init] = upstream.mock.calls[0] as unknown as [string, RequestInit];
		const [task] = JSON.parse(String(init.body));
		expect(task.positivePrompt).toMatch(/^A candid, realistic photograph\./);
		expect(task.steps).toBe(9);
	});

	it('asks Runware once what a configured model is, and prompts it to suit', async () => {
		env.RUNWARE_AI_IMAGE_MODEL = 'civitai:9@9';
		upstream.mockImplementation((_url: string, init: RequestInit) => {
			const [task] = JSON.parse(String(init.body));
			return task.taskType === 'modelSearch'
				? Response.json({
						data: [{ results: [{ air: 'civitai:9@9', architecture: 'sdxl' }] }]
					})
				: runware();
		});
		const { id } = await createTestDaydream(db, ada.id);
		await post(ada, id);
		await post(ada, id);
		const tasks = upstream.mock.calls.map(
			([, init]) => JSON.parse(String((init as RequestInit).body))[0]
		);
		expect(tasks.map((task) => task.taskType)).toEqual([
			'modelSearch',
			'imageInference',
			'imageInference'
		]);
		expect(tasks[1]).toMatchObject({ model: 'civitai:9@9', steps: 30 });
		expect(tasks[1].positivePrompt).toMatch(/^photograph/);
	});

	it('refuses a configured model no recipe suits, naming the variable to change', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		env.RUNWARE_AI_IMAGE_MODEL = 'civitai:8@8';
		upstream.mockResolvedValueOnce(
			Response.json({ data: [{ results: [{ air: 'civitai:8@8', architecture: 'flux1d' }] }] })
		);
		const { id } = await createTestDaydream(db, ada.id);
		expect(await post(ada, id)).toMatchObject({ type: 'error', status: 503 });
		expect(upstream).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(logged.mock.calls)).toContain('RUNWARE_AI_IMAGE_MODEL');
	});

	it('refuses a configured model Runware does not host', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		env.RUNWARE_AI_IMAGE_MODEL_ILLUSTRATED = 'civitai:7@7';
		upstream.mockResolvedValueOnce(Response.json({ data: [{ results: [] }] }));
		const { id } = await createTestDaydream(db, ada.id);
		expect(await post(ada, id, { ...body, style: 'illustrated' })).toMatchObject({
			type: 'error',
			status: 503
		});
	});

	it('refuses a description that puts a minor in the picture, before anything is sent', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		const limit = vi.fn(async () => ({ allowed: true }) as const);
		expect(await post(ada, id, { ...body, prompt: 'a teen on a bed' }, limit)).toMatchObject({
			type: 'error',
			status: 422
		});
		expect(upstream).not.toHaveBeenCalled();
		// Not counted against the limit either: it was never going to be sent.
		expect(limit).not.toHaveBeenCalled();
	});

	it('refuses an unsigned visitor, an account without the feature, and someone else’s daydream', async () => {
		const bo = await createTestUser(db, { name: 'Bo' });
		const { id } = await createTestDaydream(db, ada.id);
		expect(await post(null, id)).toMatchObject({ type: 'error', status: 401 });
		expect(await post(bo, id)).toMatchObject({ type: 'error', status: 403 });
		await grantTestDaydreams(db, bo.id);
		expect(await post(bo, id)).toMatchObject({ type: 'error', status: 404 });
		expect(upstream).not.toHaveBeenCalled();
	});

	it('sends nothing until the user has accepted where it goes', async () => {
		const jun = await createTestUser(db, { name: 'Jun' });
		await grantTestDaydreams(db, jun.id);
		const { id } = await createTestDaydream(db, jun.id);
		expect(await post(jun, id)).toMatchObject({ type: 'error', status: 409 });
		expect(upstream).not.toHaveBeenCalled();
	});

	it('is unavailable on a server with no key', async () => {
		env.RUNWARE_AI_API_KEY = undefined;
		const { id } = await createTestDaydream(db, ada.id);
		expect(await post(ada, id)).toMatchObject({ type: 'error', status: 503 });
		expect(upstream).not.toHaveBeenCalled();
	});

	it('refuses a malformed request', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		expect(await post(ada, id, { ...body, style: 'oil painting' })).toMatchObject({
			type: 'error',
			status: 400
		});
	});

	it('refuses past the limit, saying how long to wait', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		const result = await post(ada, id, body, async () => ({
			allowed: false,
			retryAfterSeconds: 42
		}));
		if (result.type !== 'ok') {
			throw new Error(`expected a response, got ${result.type}`);
		}
		expect(result.value.status).toBe(429);
		expect(result.value.headers.get('retry-after')).toBe('42');
		expect(upstream).not.toHaveBeenCalled();
	});

	it('answers a provider failure with a 502, logging only its status', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		upstream.mockResolvedValueOnce(
			Response.json({ errors: [{ message: `refused: ${SECRET_WORDS}` }] }, { status: 400 })
		);
		const { id } = await createTestDaydream(db, ada.id);
		expect(await post(ada, id)).toMatchObject({ type: 'error', status: 502 });
		expect(JSON.stringify(logged.mock.calls)).not.toContain(SECRET_WORDS);
		expect(JSON.stringify(logged.mock.calls)).toContain('400');
	});

	it('answers a reply with no picture in it with a 502', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		upstream.mockResolvedValueOnce(Response.json({ data: [] }));
		const { id } = await createTestDaydream(db, ada.id);
		expect(await post(ada, id)).toMatchObject({ type: 'error', status: 502 });
	});
});
