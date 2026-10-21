import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { type DaydreamNarrator, DEFAULT_STORY_DIALS } from '$lib/daydream';
import DaydreamDials from './DaydreamDials.svelte';

/** The thoughts choice, if the dials offer one. */
const thoughts = (container: HTMLElement, value: 'shown' | 'hidden') =>
	container.querySelector<HTMLInputElement>(`input[name="their-thoughts"][value="${value}"]`);

describe('DaydreamDials', () => {
	it('offers the characters’ thoughts shown or hidden, and says which was chosen', () => {
		const onchange = vi.fn();
		const { container } = render(DaydreamDials, {
			value: DEFAULT_STORY_DIALS,
			onchange,
			narrator: 'second-person'
		});
		expect(thoughts(container, 'shown')?.checked).toBe(true);
		thoughts(container, 'hidden')?.click();
		expect(onchange).toHaveBeenCalledWith({ ...DEFAULT_STORY_DIALS, thoughts: 'hidden' });
	});

	it('offers no thoughts to show for a monologue or the system', () => {
		for (const narrator of ['monologue', 'impersonal'] satisfies DaydreamNarrator[]) {
			const { container, unmount } = render(DaydreamDials, {
				value: DEFAULT_STORY_DIALS,
				onchange: () => undefined,
				narrator
			});
			expect(thoughts(container, 'shown'), narrator).toBeNull();
			unmount();
		}
	});
});
