import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { Difference } from '$lib/daydream/copy-differences';
import { waSettled } from '$lib/testing/web-awesome';
import DaydreamCopyDifferences from './DaydreamCopyDifferences.svelte';

const differences: Difference<'premise' | 'heat'>[] = [
	{
		key: 'premise',
		label: 'What it’s about',
		here: 'A tender evening.',
		library: 'A strict interview.'
	},
	{ key: 'heat', label: 'Heat', here: 'Explicit', library: 'SFW' }
];

function press(container: HTMLElement, text: string, at = 0) {
	const buttons = [...container.querySelectorAll<HTMLElement>('wa-button')].filter(
		(candidate) => candidate.textContent?.trim() === text
	);
	buttons[at]?.click();
}

describe('DaydreamCopyDifferences', () => {
	it('lists each difference, with both sides', async () => {
		const { container } = render(DaydreamCopyDifferences, {
			differences,
			kindName: 'idea',
			onuselibrary: vi.fn(),
			oncopytolibrary: vi.fn()
		});
		await waSettled(container);
		const details = container.querySelector('wa-details') as HTMLElement & { summary: string };
		expect(details.summary).toBe('This idea differs from your library in 2 places');
		expect(container.textContent).toContain('Here: A tender evening.');
		expect(container.textContent).toContain('In your library: SFW');
	});

	it('takes the library’s, or copies this one to it, one field at a time', async () => {
		const onuselibrary = vi.fn();
		const oncopytolibrary = vi.fn().mockResolvedValue('The library could not be saved.');
		const { container } = render(DaydreamCopyDifferences, {
			differences,
			kindName: 'idea',
			onuselibrary,
			oncopytolibrary
		});
		await waSettled(container);
		press(container, 'Use your library’s', 1);
		expect(onuselibrary).toHaveBeenCalledWith('heat');
		press(container, 'Copy to your library', 0);
		expect(oncopytolibrary).toHaveBeenCalledWith('premise');
		await waitFor(() => expect(container.textContent).toContain('The library could not be saved.'));
	});

	it('shows nothing when the copy matches its library', () => {
		const { container } = render(DaydreamCopyDifferences, {
			differences: [],
			kindName: 'idea',
			onuselibrary: vi.fn(),
			oncopytolibrary: vi.fn()
		});
		expect(container.querySelector('wa-details')).toBeNull();
	});
});
