import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pictureWorkload } from '$lib/daydream/image-prompt';
import { readImageConfig } from '$lib/server/daydream/image-config';
import { estimatePictureMs } from '$lib/server/daydream/picture-timings';
import { acceptDisclosure } from '$lib/server/daydreams';
import type { Db } from '$lib/server/db';
import { daydreamPictureTimings } from '$lib/server/db/schema';
import type { RateLimitResult } from '$lib/server/rate-limit';
import { RUNWARE_PICTURE_MODEL_PRESETS, type ServerSettings } from '$lib/server-settings';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import {
	createTestDaydream,
	createTestUser,
	grantTestDaydreams,
	type TestUser
} from '$lib/testing/fixtures';
import { testSettings } from '$lib/testing/settings';
import { GET, POST } from './+server';

/**
 * The picture endpoint: like the reply endpoint, it handles what a story says
 * in plaintext. `fetch` stands in for Runware, `settings` for the server's
 * settings, and `$env/dynamic/private` for the base URL test seam.
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
let settings: ServerSettings;

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
	settings = testSettings({ runwareApiKey: 'rw-test' });
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
				settings,
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
			model: RUNWARE_PICTURE_MODEL_PRESETS.photo[0].runwareModelAir,
			outputType: 'base64Data'
		});
		expect(task.positivePrompt).toContain(PROMPT);
		expect(task.negativePrompt).toContain('child');
	});

	it('uses the model for the style asked for', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		await post(ada, id, { ...body, style: 'illustrated' });
		const [, init] = upstream.mock.calls[0] as unknown as [string, RequestInit];
		expect(JSON.parse(String(init.body))[0].model).toBe(
			RUNWARE_PICTURE_MODEL_PRESETS.illustrated[0].runwareModelAir
		);
	});

	it('prompts the default photo model as the Z-Image Turbo it is, without asking', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		await post(ada, id);
		expect(upstream).toHaveBeenCalledTimes(1);
		const [, init] = upstream.mock.calls[0] as unknown as [string, RequestInit];
		const [task] = JSON.parse(String(init.body));
		expect(task.positivePrompt).toMatch(/^A candid, realistic personal photograph by/);
		expect(task.steps).toBe(9);
	});

	it('prompts a custom model by the base model it was saved with, without asking Runware', async () => {
		settings = testSettings({
			runwareApiKey: 'rw-test',
			runwarePhotoModel: JSON.stringify({ runwareModelAir: 'civitai:9@9', base: 'pony' })
		});
		const { id } = await createTestDaydream(db, ada.id);
		await post(ada, id);
		expect(upstream).toHaveBeenCalledTimes(1);
		const [, init] = upstream.mock.calls[0] as unknown as [string, RequestInit];
		const [task] = JSON.parse(String(init.body));
		expect(task).toMatchObject({ taskType: 'imageInference', model: 'civitai:9@9', steps: 30 });
		expect(task.positivePrompt).toMatch(/^photograph/);
	});

	it('uses a preset other than the default by its pinned AIR and base model', async () => {
		settings = testSettings({
			runwareApiKey: 'rw-test',
			runwarePhotoModel: JSON.stringify({ preset: 'lustify' })
		});
		const { id } = await createTestDaydream(db, ada.id);
		await post(ada, id);
		const [, init] = upstream.mock.calls[0] as unknown as [string, RequestInit];
		expect(JSON.parse(String(init.body))[0]).toMatchObject({
			model: 'civitai:573152@1094291',
			steps: 30
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
		settings = testSettings();
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

describe('how long pictures take', () => {
	const photo = () => {
		const config = readImageConfig(settings, undefined);
		if (!config) {
			throw new Error('expected pictures to be set up');
		}
		return pictureWorkload('photo', config.models.photo);
	};

	function estimate(user: TestUser | null, style = 'photo') {
		return runAndCatch(() =>
			GET(
				fakeEvent({
					db,
					user,
					params: { id: 'any' },
					path: `/api/daydreams/any/image?style=${style}`,
					settings
				})
			)
		);
	}

	it('records how long a picture took, under what decides that and nothing about the story', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		await post(ada, id);
		await vi.waitFor(async () => expect(await estimatePictureMs(db, photo())).not.toBeNull());
		const rows = await db.select().from(daydreamPictureTimings);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ model: photo().model, steps: 9, width: 832, samples: 1 });
		expect(JSON.stringify(rows)).not.toContain(SECRET_WORDS);
		expect(JSON.stringify(rows)).not.toContain(ada.id);
	});

	it('records nothing for a picture that did not come', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		upstream.mockResolvedValueOnce(Response.json({ data: [] }));
		const { id } = await createTestDaydream(db, ada.id);
		await post(ada, id);
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(await db.select().from(daydreamPictureTimings)).toEqual([]);
	});

	it('averages evenly at first, then weights the latest, and caps a run far over the usual', async () => {
		const { recordPictureTiming } = await import('$lib/server/daydream/picture-timings');
		const workload = photo();
		await recordPictureTiming(db, workload, 10_000);
		await recordPictureTiming(db, workload, 20_000);
		expect(await estimatePictureMs(db, workload)).toBe(15_000);
		await recordPictureTiming(db, workload, 15_000);
		await recordPictureTiming(db, workload, 15_000);
		await recordPictureTiming(db, workload, 15_000);
		// Five runs in: the weight has reached its floor of a fifth.
		await recordPictureTiming(db, workload, 25_000);
		expect(await estimatePictureMs(db, workload)).toBe(17_000);
		// A cold start of ten minutes counts as three times the usual, no more.
		await recordPictureTiming(db, workload, 600_000);
		expect(await estimatePictureMs(db, workload)).toBe(
			Math.round(17_000 + 0.2 * (51_000 - 17_000))
		);
		// A different workload has an average of its own.
		expect(await estimatePictureMs(db, { ...workload, steps: 30 })).toBeNull();
	});

	it('says how long a picture usually takes, and null before one has been made', async () => {
		const first = await estimate(ada);
		if (first.type !== 'ok') {
			throw new Error(`expected an answer, got ${first.type}`);
		}
		expect(await first.value.json()).toEqual({ estimateMs: null });
		const { recordPictureTiming } = await import('$lib/server/daydream/picture-timings');
		await recordPictureTiming(db, photo(), 12_345);
		const second = await estimate(ada);
		if (second.type !== 'ok') {
			throw new Error(`expected an answer, got ${second.type}`);
		}
		expect(await second.value.json()).toEqual({ estimateMs: 12_345 });
	});

	it('refuses an unsigned visitor, an account without the feature, a bad style and a server without pictures', async () => {
		const bo = await createTestUser(db, { name: 'Bo' });
		expect(await estimate(null)).toMatchObject({ type: 'error', status: 401 });
		expect(await estimate(bo)).toMatchObject({ type: 'error', status: 403 });
		expect(await estimate(ada, 'oil')).toMatchObject({ type: 'error', status: 400 });
		settings = testSettings();
		expect(await estimate(ada)).toMatchObject({ type: 'error', status: 503 });
	});
});
