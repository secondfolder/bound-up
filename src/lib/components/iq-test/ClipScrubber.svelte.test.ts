import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { defined } from '$lib/testing/defined';
import ClipScrubber from './ClipScrubber.svelte';

/**
 * An item with a video in it, as `ClipPlayer` leaves one: its length and
 * place set by hand, since the test browser has no clip to load.
 */
function itemWithVideo(duration: number) {
	const item = document.createElement('div');
	item.className = 'item';
	const video = document.createElement('video');
	let currentTime = 0;
	Object.defineProperty(video, 'duration', { value: duration });
	Object.defineProperty(video, 'currentTime', {
		get: () => currentTime,
		set: (value: number) => {
			currentTime = value;
		}
	});
	item.append(video);
	document.body.append(item);
	return { item, video };
}

describe('ClipScrubber', () => {
	it('follows the clip being shown, and moves it when dragged', async () => {
		const { item, video } = itemWithVideo(40);
		render(ClipScrubber, { target: item, props: { name: 'clip' } });
		const scrub = defined(item.querySelector<HTMLInputElement>('input.scrub'), 'the scrub bar');
		expect(scrub).toHaveAccessibleName('Position in the clip');

		video.currentTime = 10;
		video.dispatchEvent(new Event('timeupdate'));
		await tick();
		expect(Number(scrub.max)).toBe(40);
		expect(Number(scrub.value)).toBe(10);
		expect(scrub).toHaveAttribute('aria-valuetext', '0:10 of 0:40');

		scrub.value = '30';
		scrub.dispatchEvent(new Event('input', { bubbles: true }));
		expect(video.currentTime).toBe(30);
	});

	it('follows the shown clip, not the next one loading out of sight', async () => {
		const { item, video } = itemWithVideo(40);
		const pending = document.createElement('video');
		pending.className = 'pending';
		Object.defineProperty(pending, 'duration', { value: 99 });
		item.append(pending);
		render(ClipScrubber, { target: item, props: { name: 'clip' } });
		const scrub = defined(item.querySelector<HTMLInputElement>('input.scrub'), 'the scrub bar');
		pending.dispatchEvent(new Event('loadedmetadata'));
		video.dispatchEvent(new Event('loadedmetadata'));
		await tick();
		expect(Number(scrub.max)).toBe(40);
	});
});
