import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it } from 'vitest';
import { ModelWatch } from '$lib/daydream/model-watch.svelte';
import { WAITING } from '$lib/daydream/progress';
import { waProp, waSettled } from '$lib/testing/web-awesome';
import DaydreamArriving from './DaydreamArriving.svelte';
import ModelProgress from './ModelProgress.svelte';

const REQUEST = JSON.stringify({
	model: 'test/model',
	messages: [
		{ role: 'system', content: 'The rules.' },
		{ role: 'user', content: 'A stranger on a train.' }
	],
	max_tokens: 100
});

describe('ModelProgress', () => {
	it('says what the model is doing and how much it has written, telling a screen reader only the stage', async () => {
		const watch = new ModelWatch(false);
		const { container, getByRole } = render(ModelProgress, { watch });
		await waSettled(container);
		expect(container.textContent).toContain('Waiting for the model…');
		expect(getByRole('status').textContent).toBe('Waiting for the model');

		watch.watch.onProgress?.({ ...WAITING, stage: 'writing', chars: 1240 });
		await tick();
		expect(container.textContent).toContain('Writing… 1,240 characters');
		expect(getByRole('status').textContent).toBe('Writing');
		// Without debug mode there is no live chat, whatever arrives.
		expect(watch.watch.onLive).toBeUndefined();
		expect(container.querySelector('wa-details')).toBeNull();
	});

	it('shows the live chat in debug mode: the request, then the answer as it comes', async () => {
		const watch = new ModelWatch(true);
		const { container } = render(ModelProgress, { watch });
		const live = watch.watch.onLive;
		if (!live) {
			throw new Error('a live watch takes live events');
		}
		live({ kind: 'request', body: REQUEST });
		live({ kind: 'fetch', url: 'https://a.test/', status: 'completed' });
		live({ kind: 'reasoning', text: 'Weighing ' });
		live({ kind: 'reasoning', text: 'it up.' });
		live({ kind: 'text', text: '{"voice":' });
		live({ kind: 'text', text: '"talk"}' });
		await waSettled(container);

		const details = container.querySelector('wa-details.live');
		expect(waProp(details, 'summary')).toBe('Live chat: test/model, chat/completions');
		const entries = [...container.querySelectorAll('ol > li')].map((entry) => ({
			label: waProp(entry.querySelector('wa-details'), 'summary'),
			text: entry.querySelector('pre')?.textContent
		}));
		expect(entries).toEqual([
			{ label: 'System prompt', text: 'The rules.' },
			{ label: 'Sent', text: 'A stranger on a train.' },
			{ label: 'Settings', text: expect.stringContaining('"max_tokens": 100') },
			{ label: 'Fetched https://a.test/ (completed)', text: '' },
			// Pieces of the same kind run on in one bubble.
			{ label: 'Reasoning', text: 'Weighing it up.' },
			{ label: 'Reply', text: '{"voice":"talk"}' }
		]);
	});

	it('keeps the live chat out of sight with the debug switch off', async () => {
		const watch = new ModelWatch(true);
		watch.feed({ kind: 'reasoning', text: 'Hmm.' });
		const { container } = render(ModelProgress, { watch, showLive: false });
		await waSettled(container);
		expect(container.textContent).toContain('Thinking… 4 characters');
		expect(container.querySelector('wa-details')).toBeNull();
	});
});

describe('DaydreamArriving, before the passage begins', () => {
	const cast = { you: [], characters: ['Mara'] };

	it('says how the reply is going until there is text to show', async () => {
		const watch = new ModelWatch(true);
		const { container, rerender } = render(DaydreamArriving, {
			text: '',
			watch,
			debug: true,
			speaker: null,
			cast
		});
		watch.feed({ kind: 'reasoning', text: 'She would look up.' });
		await waSettled(container);
		expect(container.textContent).toContain('Thinking… 18 characters');
		// The reasoning itself, in the bubble, not a chat log to open.
		expect(container.querySelector('.reasoning')?.textContent?.trim()).toBe('She would look up.');
		expect(container.querySelector('wa-details')).toBeNull();

		await rerender({ text: 'Mara looks up.', watch, debug: true, speaker: null, cast });
		await expect.poll(() => container.textContent).toContain('Mara');
		expect(container.textContent).not.toContain('Thinking');
	});
});
