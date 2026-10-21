import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { waSettled } from '$lib/testing/web-awesome';
import PromptDiff from './PromptDiff.svelte';

describe('PromptDiff', () => {
	const props = {
		before: 'Rules.\nDecide this before anything else.\nAnswer.',
		after: 'Rules.\nDecide this first.\nAnswer.',
		beforeLabel: 'A: baseline',
		afterLabel: 'B: voice=monologue'
	};

	it('shows what changed, word by word, under the two labels', async () => {
		const { container } = render(PromptDiff, props);
		await waSettled(container);
		expect(container.textContent).toContain('A: baseline');
		expect(container.textContent).toContain('1 lines out, 1 in');
		const removed = container.querySelector('.removed mark');
		const added = container.querySelector('.added mark');
		expect(removed?.textContent).toBe('before anything else');
		expect(added?.textContent).toBe('first');
	});

	it('says so when the two are the same', async () => {
		const { container } = render(PromptDiff, { ...props, after: props.before });
		await waSettled(container);
		expect(container.querySelector('.same')?.textContent).toBe('No difference.');
	});
});
