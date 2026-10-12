import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { defined } from '$lib/testing/defined';
import BellCurve from './BellCurve.svelte';

describe('BellCurve', () => {
	it('draws the marker from the dot down, never above it', () => {
		for (const iq of [55, 100, 140]) {
			const { container, unmount } = render(BellCurve, { iq });
			const dot = defined(container.querySelector('[data-testid="bell-curve-marker"]'), 'the dot');
			const line = defined(container.querySelector('[data-testid="bell-curve-line"]'), 'the line');
			expect(Number(line.getAttribute('y1'))).toBe(Number(dot.getAttribute('cy')));
			unmount();
		}
	});
});
