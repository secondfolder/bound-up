import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { waProp, waSettled } from '$lib/testing/web-awesome';
import ExchangeLog from './ExchangeLog.svelte';

describe('ExchangeLog', () => {
	it('shows every bubble of the exchange in order, each under its label', async () => {
		const { container } = render(ExchangeLog, {
			log: {
				model: 'test/model',
				api: 'responses',
				cost: 0.000_312,
				entries: [
					{ who: 'system', label: 'System prompt', text: 'The rules' },
					{ who: 'user', label: 'Sent', text: 'A brief' },
					{ who: 'model', label: 'Reply', text: '{"voice":"talk"}', tokens: 6 }
				]
			}
		});
		await waSettled(container);
		expect(waProp(container.querySelector('wa-details'), 'summary')).toBe(
			'Chat log: test/model, responses · $0.000312'
		);
		const items = [...container.querySelectorAll('li')];
		expect(items.map((item) => item.classList[0])).toEqual(['system', 'user', 'model']);
		// Each titled with how long it is: estimated, or exact where the usage said.
		expect(
			items.map((item) => item.querySelector('[slot="summary"]')?.textContent?.trim())
		).toEqual([
			'System prompt · 9 characters · ~3 tokens',
			'Sent · 7 characters · ~2 tokens',
			'Reply · 16 characters · 6 tokens'
		]);
		expect(items[2]?.querySelector('pre')?.textContent).toBe('{"voice":"talk"}');
	});
});
