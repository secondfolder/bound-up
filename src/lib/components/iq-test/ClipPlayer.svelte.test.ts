import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import type { Clip } from '$lib/playroom/iq-test/media';

import ClipLoadingHarness from '$lib/testing/ClipLoadingHarness.svelte';
import ClipPlayer from './ClipPlayer.svelte';

const fetchSpy = vi.fn();
beforeEach(() => {
	vi.stubGlobal('fetch', fetchSpy);
	// The diagnostics are the point of some tests, and noise in the rest.
	vi.spyOn(console, 'info').mockImplementation(() => undefined);
	vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
	fetchSpy.mockReset();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const clip = (video: string | null): Clip => ({ id: 'happypinkbunny', video, sound: true });
const FILE = 'https://media.redgifs.com/HappyPinkBunny-mobile.mp4';

/**
 * A real, playable video, made in the test browser: a canvas recorded for a
 * moment. A fake blob will not do — the element fails to decode it and the
 * clip (correctly) falls back to the player before anything can look at it.
 */
async function realVideo(): Promise<Blob> {
	const canvas = document.createElement('canvas');
	canvas.width = 16;
	canvas.height = 16;
	const context = canvas.getContext('2d');
	const recorder = new MediaRecorder(canvas.captureStream(10), { mimeType: 'video/webm' });
	const chunks: Blob[] = [];
	recorder.addEventListener('dataavailable', (event) => chunks.push(event.data));
	const stopped = new Promise((resolve) => recorder.addEventListener('stop', resolve));
	recorder.start();
	for (let frame = 0; frame < 5; frame += 1) {
		if (context) {
			context.fillStyle = frame % 2 === 0 ? '#f0f' : '#0ff';
			context.fillRect(0, 0, 16, 16);
		}
		await new Promise((resolve) => setTimeout(resolve, 60));
	}
	recorder.stop();
	await stopped;
	return new Blob(chunks, { type: 'video/webm' });
}

describe('ClipPlayer', () => {
	it("downloads the file without a referrer, which Redgifs refuses, and plays it as the page's own video", async () => {
		fetchSpy.mockResolvedValue(new Response(await realVideo()));
		const { container } = render(ClipPlayer, { clip: clip(FILE) });

		await expect.poll(() => container.querySelector('video')).not.toBeNull();
		const video = container.querySelector('video') as HTMLVideoElement;
		expect(video.src).toMatch(/^blob:/);
		// Muted until the visitor turns the sound up: only muted video may autoplay.
		expect(video.muted).toBe(true);
		expect(fetchSpy).toHaveBeenCalledWith(
			FILE,
			expect.objectContaining({ referrerPolicy: 'no-referrer', mode: 'cors' })
		);
	});

	it('covers a clip that could play but is paused with a play button, gone once it plays', async () => {
		fetchSpy.mockResolvedValue(new Response(await realVideo()));
		const { container } = render(ClipPlayer, { clip: clip(FILE) });
		await expect.poll(() => container.querySelector('video')).not.toBeNull();
		const video = container.querySelector('video') as HTMLVideoElement;
		await expect.poll(() => !video.paused).toBe(true);
		expect(container.querySelector('button.play')).toBeNull();

		// As a browser does when it will not autoplay, or pauses it itself.
		video.pause();
		await expect.poll(() => container.querySelector('button.play')).not.toBeNull();
		const play = container.querySelector<HTMLButtonElement>('button.play');
		expect(play).toHaveAccessibleName('Play video');
		play?.click();
		await expect.poll(() => video.paused).toBe(false);
		await expect.poll(() => container.querySelector('button.play')).toBeNull();
	});

	it('shows no play button over the background, which cannot be clicked', async () => {
		fetchSpy.mockResolvedValue(new Response(await realVideo()));
		const { container } = render(ClipPlayer, { clip: clip(FILE), fit: 'cover' });
		await expect.poll(() => container.querySelector('video')).not.toBeNull();
		const video = container.querySelector('video') as HTMLVideoElement;
		await expect.poll(() => !video.paused).toBe(true);
		video.pause();
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(container.querySelector('button.play')).toBeNull();
	});

	it('says it is loading from a new clip being asked for until that clip can play', async () => {
		fetchSpy.mockResolvedValue(new Response(await realVideo()));
		const { container, rerender } = render(ClipLoadingHarness, { clip: clip(FILE) });
		const loading = () =>
			container.querySelector('[data-testid="clip-loading"]')?.getAttribute('data-loading');
		await expect.poll(loading).toBe('false');

		let deliver: (response: Response) => void = () => undefined;
		fetchSpy.mockReturnValue(
			new Promise<Response>((resolve) => {
				deliver = resolve;
			})
		);
		await rerender({ clip: { id: 'nextone', video: `${FILE}?next`, sound: false } });
		// Downloading: the old one plays on, and it is loading.
		await expect.poll(loading).toBe('true');
		expect(container.querySelectorAll('video')).toHaveLength(1);
		deliver(new Response(await realVideo()));
		await expect.poll(loading).toBe('false');
	});

	it('falls back to the player when the file downloads but will not play', async () => {
		fetchSpy.mockResolvedValue(new Response(new Blob(['not a video'], { type: 'video/mp4' })));
		const { container } = render(ClipPlayer, { clip: clip(FILE) });
		await expect.poll(() => container.querySelector('iframe')).not.toBeNull();
	});

	it("falls back to Redgifs' own player when the file is refused", async () => {
		fetchSpy.mockResolvedValue(new Response('', { status: 403 }));
		const { container } = render(ClipPlayer, { clip: clip(FILE) });

		await expect.poll(() => container.querySelector('iframe')).not.toBeNull();
		expect(container.querySelector('iframe')).toHaveAttribute(
			'src',
			'https://www.redgifs.com/ifr/happypinkbunny'
		);
		expect(container.querySelector('video')).toBeNull();
	});

	it('says in the console why a clip fell back, with the browser’s own reason', async () => {
		fetchSpy.mockRejectedValue(new TypeError('NetworkError when attempting to fetch resource.'));
		render(ClipPlayer, { clip: clip(FILE) });
		await expect
			.poll(() =>
				vi
					.mocked(console.warn)
					.mock.calls.map((call) => String(call[0]))
					.join('\n')
			)
			.toContain('TypeError: NetworkError when attempting to fetch resource.');
	});

	it('falls back when there is no connection at all', async () => {
		fetchSpy.mockRejectedValue(new TypeError('NetworkError when attempting to fetch resource.'));
		const { container } = render(ClipPlayer, { clip: clip(FILE) });
		await expect.poll(() => container.querySelector('iframe')).not.toBeNull();
	});

	it('goes straight to the player for a clip with no file, without fetching', () => {
		const { container } = render(ClipPlayer, { clip: clip(null) });
		expect(container.querySelector('iframe')).not.toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('asks for the next clip when one ends — once, while it loops on until the next arrives', async () => {
		fetchSpy.mockResolvedValue(new Response(await realVideo()));
		const onended = vi.fn();
		const { container, rerender } = render(ClipPlayer, { clip: clip(FILE), onended });

		// The recorded clip is a fraction of a second, so it ends — and loops —
		// several times over while nothing new arrives.
		await expect.poll(() => onended.mock.calls.length).toBe(1);
		const video = container.querySelector('video') as HTMLVideoElement;
		const firstSrc = video.src;
		await expect.poll(() => video.currentTime > 0 || !video.paused).toBe(true);
		expect(onended).toHaveBeenCalledTimes(1);

		// The next clip: the old one stays on screen while its file downloads,
		// and while it loads in a hidden element of its own, and is only
		// replaced once the new one can play.
		let deliver: (response: Response) => void = () => undefined;
		fetchSpy.mockReturnValue(
			new Promise<Response>((resolve) => {
				deliver = resolve;
			})
		);
		await rerender({ clip: { id: 'nextone', video: `${FILE}?next`, sound: false }, onended });
		expect(container.querySelector('video')?.src).toBe(firstSrc);
		// Caught the moment it appears, before it can play and take over.
		const loaded = new Promise<{ next: Element; onShow: Element | null }>((resolve) => {
			new MutationObserver((_, observer) => {
				const pending = container.querySelector('video.pending');
				if (pending) {
					observer.disconnect();
					resolve({ next: pending, onShow: container.querySelector('video:not(.pending)') });
				}
			}).observe(container, { subtree: true, childList: true, attributes: true });
		});
		deliver(new Response(await realVideo()));
		const { next, onShow } = await loaded;
		// While it got ready, the one on show was still the old one.
		expect(onShow).toBe(video);
		await expect.poll(() => container.querySelectorAll('video').length).toBe(1);
		expect(container.querySelector('video')).toBe(next);
		expect(container.querySelector('video')?.src).not.toBe(firstSrc);
		expect(container.querySelector('video')?.classList.contains('pending')).toBe(false);
	});

	it("moves on by itself from a clip in Redgifs' player, which cannot say it ended", () => {
		vi.useFakeTimers();
		try {
			const onended = vi.fn();
			render(ClipPlayer, { clip: clip(null), onended });
			vi.advanceTimersByTime(44_000);
			expect(onended).not.toHaveBeenCalled();
			vi.advanceTimersByTime(2000);
			expect(onended).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});
});
