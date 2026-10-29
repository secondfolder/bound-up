import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type DreamEvent, readEvents } from '$lib/dream/events';
import { acceptDisclosure } from '$lib/server/daydreams';
import type { Db } from '$lib/server/db';
import { grantFeature } from '$lib/server/features';
import type { ServerSettingKey } from '$lib/server-settings';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import { createTestUser, grantTestDreams, type TestUser } from '$lib/testing/fixtures';
import { testSettings } from '$lib/testing/settings';
import { POST } from './+server';

/**
 * Reading aloud (docs/dreams.md, "Read aloud"): behind its own feature, in
 * the narrator's or a curated voice only, within the daily cap, and relayed
 * as the engine's events. `fetch` stands in for Fish Audio.
 */

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env }));

let harness: TestDb;
let db: Db;
let ada: TestUser;
let upstream: ReturnType<typeof vi.fn>;

function fishStream(): Response {
	const event = (fields: Record<string, unknown>) =>
		`event: message\ndata: ${JSON.stringify(fields)}\n\n`;
	return new Response(
		[
			event({
				audio_base64: 'AAAA',
				content: 'Come closer.',
				alignment: null,
				chunk_seq: 0,
				chunk_audio_offset_sec: 0
			}),
			event({
				audio_base64: 'BBBB',
				content: 'Come closer.',
				alignment: {
					audio_duration: 1,
					segments: [
						{ text: 'Come', start: 0, end: 0.3 },
						{ text: 'closer', start: 0.3, end: 0.9 }
					]
				},
				chunk_seq: 0,
				chunk_audio_offset_sec: 2
			})
		].join(''),
		{ headers: { 'content-type': 'text/event-stream' } }
	);
}

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
	await grantTestDreams(db, ada.id);
	await grantFeature(db, { userId: ada.id, feature: 'dreamVoice', grantedByUserId: ada.id });
	await acceptDisclosure(db, ada.id);
	env.FISH_AUDIO_BASE_URL = 'https://fish.test';
	upstream = vi.fn(() => Promise.resolve(fishStream()));
	vi.stubGlobal('fetch', upstream);
});

afterEach(() => {
	harness.close();
	vi.unstubAllGlobals();
});

const SETTINGS: Partial<Record<ServerSettingKey, string>> = {
	fishAudioApiKey: 'fish-key',
	narratorVoice: JSON.stringify({ provider: 'fish', preset: 'breathy' })
};

async function speak(
	json: unknown,
	settings: Partial<Record<ServerSettingKey, string>> = SETTINGS,
	user: TestUser = ada
) {
	return await POST(fakeEvent({ db, user, settings: testSettings(settings), json }));
}

async function eventsOf(response: Response): Promise<DreamEvent[]> {
	const events: DreamEvent[] = [];
	for await (const event of readEvents(response.body as ReadableStream<Uint8Array>)) {
		events.push(event);
	}
	return events;
}

describe('POST /api/dreams/speak', () => {
	it('reads in the narrator’s voice, relaying the clip and the timings from the clip’s start', async () => {
		const response = await speak({ text: '[soft] Come closer.', voice: 'narrator' });
		const events = await eventsOf(response);
		const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://fish.test/v1/tts/stream/with-timestamp');
		expect(new Headers(init.headers).get('model')).toBe('s2-pro');
		expect(new Headers(init.headers).get('authorization')).toBe('Bearer fish-key');
		expect(JSON.parse(String(init.body))).toMatchObject({
			text: '[soft] Come closer.',
			reference_id: '3effd15d464044c18bffa56fc7024225',
			format: 'mp3'
		});
		expect(events.filter((event) => event.type === 'audio')).toEqual([
			{ type: 'audio', data: 'AAAA' },
			{ type: 'audio', data: 'BBBB' }
		]);
		expect(events.find((event) => event.type === 'words')).toEqual({
			type: 'words',
			seq: 0,
			words: [
				{ text: 'Come', start: 2, end: 2.3 },
				{ text: 'closer', start: 2.3, end: 2.9 }
			]
		});
		expect(events.at(-1)).toMatchObject({ type: 'done', ended: 'complete' });
	});

	it('speaks a curated voice by name, and refuses any other', async () => {
		await eventsOf(await speak({ text: 'Hello.', voice: 'commanding' }));
		const [, init] = upstream.mock.calls[0] as [string, RequestInit];
		expect(JSON.parse(String(init.body)).reference_id).toBe('d2666f42721e48729b4907fdeb70e3c9');
		const refused = await runAndCatch(() => speak({ text: 'Hello.', voice: 'a'.repeat(32) }));
		expect(refused).toMatchObject({ status: 400 });
	});

	it('needs its own feature, and a key on the server', async () => {
		const bo = await createTestUser(db, { name: 'Bo' });
		await grantTestDreams(db, bo.id);
		await acceptDisclosure(db, bo.id);
		expect(
			await runAndCatch(() => speak({ text: 'Hello.', voice: 'narrator' }, SETTINGS, bo))
		).toMatchObject({ status: 403 });
		expect(
			await runAndCatch(() => speak({ text: 'Hello.', voice: 'narrator' }, { fishAudioApiKey: '' }))
		).toMatchObject({ status: 503 });
	});

	it('stops at the daily cap, without asking Fish', async () => {
		const capped = { ...SETTINGS, voiceDailyCap: '10' };
		const first = await speak({ text: 'Six b.', voice: 'narrator' }, capped);
		await eventsOf(first);
		const second = await speak({ text: 'Six b.', voice: 'narrator' }, capped);
		expect(second.status).toBe(429);
		expect(upstream).toHaveBeenCalledTimes(1);
	});

	it('says it failed, in its own words, when Fish refuses', async () => {
		upstream.mockResolvedValueOnce(new Response('{"message":"no credit"}', { status: 402 }));
		const events = await eventsOf(await speak({ text: 'Hello.', voice: 'narrator' }));
		expect(events).toEqual([
			{ type: 'failed', message: 'That could not be read aloud just now. Try again in a moment.' }
		]);
	});
});
