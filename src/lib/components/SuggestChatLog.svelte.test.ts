import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { waProp, waSettled } from '$lib/testing/web-awesome';
import SuggestChatLog from './SuggestChatLog.svelte';

describe('SuggestChatLog', () => {
	it('shows every bubble of the exchange in order, each under its label', async () => {
		const { container } = render(SuggestChatLog, {
			log: {
				model: 'test/model',
				api: 'responses',
				entries: [
					{ who: 'system', label: 'System prompt', text: 'The rules' },
					{ who: 'user', label: 'Sent', text: 'A brief' },
					{ who: 'model', label: 'Reply', text: '{"voice":"talk"}' }
				]
			}
		});
		await waSettled(container);
		expect(waProp(container.querySelector('wa-details'), 'summary')).toBe(
			'Chat log: test/model, responses'
		);
		const items = [...container.querySelectorAll('li')];
		expect(items.map((item) => item.classList[0])).toEqual(['system', 'user', 'model']);
		expect(items.map((item) => waProp(item.querySelector('wa-details'), 'summary'))).toEqual([
			'System prompt',
			'Sent',
			'Reply'
		]);
		expect(items[2]?.querySelector('pre')?.textContent).toBe('{"voice":"talk"}');
	});
});
