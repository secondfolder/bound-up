import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RULES } from '$lib/server/daydream/prompt';
import type { Db } from '$lib/server/db';
import { grantFeature } from '$lib/server/features';
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
 * Debug mode's "Show prompt": the reply's messages, rebuilt and never sent.
 * It handles what the user wrote in plaintext, so it is held to the reply
 * endpoint's rules: nothing reaches the console, and nothing leaves.
 */
const SECRET_WORDS = 'the-blue-door-in-the-cellar';

let harness: TestDb;
let db: Db;
let ada: TestUser;
let jun: TestUser;
let daydreamId: string;
let upstream: ReturnType<typeof vi.fn>;

const body = {
	mode: 'reply',
	setup: testDaydreamSetup(),
	turns: [{ role: 'user', type: 'text', text: SECRET_WORDS }],
	currentDirections: []
};

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
	jun = await createTestUser(db, { name: 'Jun' });
	await grantTestDaydreams(db, ada.id);
	({ id: daydreamId } = await createTestDaydream(db, ada.id));
	upstream = vi.fn();
	vi.stubGlobal('fetch', upstream);
});

afterEach(() => {
	harness.close();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const grantDebug = (user: TestUser) =>
	grantFeature(db, { userId: user.id, feature: 'debugMode', grantedByUserId: user.id });

function post(user: TestUser, id = daydreamId, json: unknown = body, settings = testSettings()) {
	return runAndCatch(() => POST(fakeEvent({ db, user, json, params: { id }, settings })));
}

async function systemPrompt(result: Awaited<ReturnType<typeof post>>): Promise<string> {
	if (result.type !== 'ok') {
		throw new Error(JSON.stringify(result));
	}
	const { messages } = (await result.value.json()) as { messages: { content: string }[] };
	return messages[0]?.content ?? '';
}

describe('POST /api/daydreams/[id]/prompt', () => {
	it('answers with the messages the model would read, and sends nothing', async () => {
		await grantDebug(ada);
		const result = await post(ada);
		if (result.type !== 'ok') {
			throw new Error(JSON.stringify(result));
		}
		const { messages } = (await result.value.json()) as {
			messages: { role: string; content: string }[];
		};
		expect(messages[0]?.role).toBe('system');
		expect(messages[0]?.content).toContain(RULES);
		expect(
			messages.at(-1)?.content.startsWith(`${SECRET_WORDS}\n\n(Direction buttons on screen now:`)
		).toBe(true);
		expect(upstream).not.toHaveBeenCalled();
	});

	it("asks for pictures in the recipe of the model that draws the daydream's style", async () => {
		await grantDebug(ada);
		const settings = testSettings({
			runwareApiKey: 'rw-key',
			runwarePhotoModel: JSON.stringify({ preset: 'flux-2-klein-9b' })
		});
		const withStyle = (style: 'photo' | 'illustrated') => ({
			...body,
			setup: { ...body.setup, pictures: { on: true, style } }
		});
		const photo = await systemPrompt(await post(ada, daydreamId, withStyle('photo'), settings));
		expect(photo).toContain('about 30 to 80 words');
		// The illustrated style is still drawn by an SDXL model, which gets the long recipe.
		const drawn = await systemPrompt(
			await post(ada, daydreamId, withStyle('illustrated'), settings)
		);
		expect(drawn).toContain('about 80 to 150 words');
		// Without a Runware key, no pictures at all.
		expect(await systemPrompt(await post(ada))).not.toContain('"image"');
	});

	it('is refused without debug mode, even with Daydreams', async () => {
		expect(await post(ada)).toMatchObject({ type: 'error', status: 403 });
	});

	it('is refused without Daydreams, even with debug mode', async () => {
		await grantDebug(jun);
		expect(await post(jun)).toMatchObject({ type: 'error', status: 403 });
	});

	it("is a 404 for someone else's daydream", async () => {
		await grantTestDaydreams(db, jun.id);
		await grantDebug(jun);
		expect(await post(jun)).toMatchObject({ type: 'error', status: 404 });
	});

	it('refuses a malformed request', async () => {
		await grantDebug(ada);
		expect(await post(ada, daydreamId, { mode: 'reply' })).toMatchObject({
			type: 'error',
			status: 400
		});
	});

	it('writes nothing to the console, whatever happens', async () => {
		const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
			vi.spyOn(console, method)
		);
		await post(ada);
		await grantDebug(ada);
		await post(ada);
		await post(ada, daydreamId, { ...body, turns: 'nope' });
		for (const spy of spies) {
			expect(spy).not.toHaveBeenCalled();
		}
	});
});
