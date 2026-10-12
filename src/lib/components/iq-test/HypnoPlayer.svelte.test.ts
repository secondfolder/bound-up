import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import type { HypnoFile } from '$lib/playroom/iq-test/hypno';

const tryFetch = vi.fn();
vi.mock('$lib/request-failure.svelte', () => ({ tryFetch }));

const { HypnoSession, MAX_FAILURES } = await import('$lib/playroom/iq-test/hypno-session.svelte');
const { default: HypnoPlayer } = await import('./HypnoPlayer.svelte');

/** A real, playable WAV: half a second of silence. */
function silentWav(): string {
	const rate = 8000;
	const samples = rate / 2;
	const buffer = new ArrayBuffer(44 + samples * 2);
	const view = new DataView(buffer);
	const text = (offset: number, value: string) => {
		for (let i = 0; i < value.length; i += 1) {
			view.setUint8(offset + i, value.charCodeAt(i));
		}
	};
	text(0, 'RIFF');
	view.setUint32(4, 36 + samples * 2, true);
	text(8, 'WAVE');
	text(12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, rate, true);
	view.setUint32(28, rate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	text(36, 'data');
	view.setUint32(40, samples * 2, true);
	return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

function file(n: number, mediaUrl: string): HypnoFile {
	return {
		source: 'bambicloud',
		pageUrl: 'https://bambicloud.com/file/x',
		uuid: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
		name: `Loop ${n}`,
		author: 'bambi',
		durationMs: 500,
		fileType: 'loop',
		triggers: [],
		description: '',
		warnings: [],
		mediaUrl,
		plays: 0
	};
}

/** The endpoint, answering each random pick with the next file in turn. */
function serve(...files: HypnoFile[]) {
	const queue = [...files];
	tryFetch.mockImplementation(() =>
		Promise.resolve(
			Response.json({ files: queue.length > 0 ? [queue.shift()] : [], total: files.length })
		)
	);
}

beforeEach(() => {
	vi.spyOn(console, 'info').mockImplementation(() => undefined);
	vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
	tryFetch.mockReset();
	vi.restoreAllMocks();
});

describe('HypnoSession and HypnoPlayer', () => {
	it('asks for a random file from its categories, and loads it into the element', async () => {
		const wav = silentWav();
		serve(file(1, wav));
		const session = new HypnoSession(['loop', 'subliminal']);
		const { container } = render(HypnoPlayer, { session });
		await session.next();

		const url = new URL(String(tryFetch.mock.calls[0]?.[0]), 'http://x');
		expect(url.pathname).toBe('/api/playroom/iq-test/hypnos');
		expect(url.searchParams.get('categories')).toBe('loop,subliminal');
		expect(url.searchParams.get('random')).toBe('1');
		expect(session.current?.name).toBe('Loop 1');
		expect((container.querySelector('audio') as HTMLAudioElement).src).toBe(wav);
	});

	it('moves to another file, excluding the one just played, when it ends', async () => {
		serve(file(1, silentWav()), file(2, silentWav()));
		const session = new HypnoSession(['loop']);
		const { container } = render(HypnoPlayer, { session });
		await session.next();
		const audio = container.querySelector('audio') as HTMLAudioElement;

		audio.dispatchEvent(new Event('ended'));
		await expect.poll(() => session.current?.name).toBe('Loop 2');
		const second = new URL(String(tryFetch.mock.calls[1]?.[0]), 'http://x');
		expect(second.searchParams.get('exclude')).toBe(file(1, '').uuid);
	});

	it('skips a file that will not play, and gives up after a few in a row', async () => {
		const broken = Array.from({ length: MAX_FAILURES + 2 }, (_, i) =>
			file(i + 1, `blob:broken-${i}`)
		);
		serve(...broken);
		const session = new HypnoSession(['loop']);
		const { container } = render(HypnoPlayer, { session });
		await session.next();
		const audio = container.querySelector('audio') as HTMLAudioElement;

		for (let i = 0; i < MAX_FAILURES; i += 1) {
			audio.dispatchEvent(new Event('error'));
			await Promise.resolve();
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
		await expect.poll(() => session.status).toBe('unavailable');
		expect(tryFetch).toHaveBeenCalledTimes(MAX_FAILURES);
		expect(String(vi.mocked(console.warn).mock.calls.at(-1)?.[0])).toContain('cdn.bambicloud.com');
	});

	it('says nothing is available when no file matches', async () => {
		serve();
		const session = new HypnoSession(['awakener']);
		render(HypnoPlayer, { session });
		await session.next();
		expect(session.status).toBe('unavailable');
		expect(session.current).toBeNull();
	});

	it('marks the element to pause at zero volume, and wants it playing once started', async () => {
		serve(file(1, silentWav()));
		const session = new HypnoSession(['loop']);
		const { container } = render(HypnoPlayer, { session });
		await session.next();
		const audio = container.querySelector('audio') as HTMLAudioElement;
		expect(audio.dataset.pauseWhenSilent).toBeDefined();
		expect(audio.dataset.wantsPlay).toBeUndefined();

		session.resume();
		expect(session.started).toBe(true);
		expect(audio.dataset.wantsPlay).toBe('true');
		// Muted (a fresh load), so it waits paused rather than running down unheard.
		expect(audio.paused).toBe(true);
	});

	it("plays a PMVHaven hypno as a video, asking for its vibe's videos", async () => {
		const wav = silentWav();
		serve({ ...file(1, wav), source: 'pmvhaven', pageUrl: 'https://pmvhaven.com/video/x' });
		const session = new HypnoSession([], 'pmvhaven', 'gooner');
		const { container } = render(HypnoPlayer, { session });
		await session.next();

		const url = new URL(String(tryFetch.mock.calls[0]?.[0]), 'http://x');
		expect(url.pathname).toBe('/api/playroom/iq-test/pmvs');
		expect(url.searchParams.get('vibe')).toBe('gooner');
		expect(container.querySelector('audio')).toBeNull();
		const video = container.querySelector<HTMLVideoElement>('video.hypno-video');
		expect(video?.src).toBe(wav);
		// No CORS from PMVHaven's bucket: asking for it would refuse the file.
		expect(video?.hasAttribute('crossorigin')).toBe(false);
	});

	it('looks up the file of a video chosen from search before playing it', async () => {
		const wav = silentWav();
		const found = { ...file(2, ''), source: 'pmvhaven' as const, pageUrl: 'x', uuid: 'abc' };
		tryFetch.mockImplementation((url: string) =>
			Promise.resolve(Response.json(url.includes('/pmvs/abc') ? { ...found, mediaUrl: wav } : {}))
		);
		const session = new HypnoSession([], 'pmvhaven', 'denial');
		const { container } = render(HypnoPlayer, { session });
		session.play(found);
		await expect
			.poll(() => container.querySelector<HTMLVideoElement>('video.hypno-video')?.src)
			.toBe(wav);
		expect(String(tryFetch.mock.calls[0]?.[0])).toBe('/api/playroom/iq-test/pmvs/abc?vibe=denial');
	});
});
