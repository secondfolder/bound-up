import { render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { defined } from '$lib/testing/defined';
import SidePanelLayoutHarness from '$lib/testing/SidePanelLayoutHarness.svelte';
import { waSettled } from '$lib/testing/web-awesome';

const KEY = 'test:side-panel';

afterEach(async () => {
	localStorage.removeItem(KEY);
	await page.viewport(1280, 800);
});

async function layoutAt(width: number) {
	await page.viewport(width, 800);
	const { container, rerender } = render(SidePanelLayoutHarness, { storageKey: KEY });
	await waSettled(container);
	const find = <T extends Element>(selector: string) =>
		defined(container.querySelector<T>(selector), selector);
	return {
		panel: () => find<HTMLElement>('aside'),
		show: () => find<HTMLElement>('.show-tab'),
		hide: () => find<HTMLElement>('aside wa-button'),
		scrim: () => find<HTMLElement>('.scrim'),
		scroller: () => find<HTMLElement>('.scroller'),
		settle: () => waSettled(container),
		retitle: (title: string) => rerender({ storageKey: KEY, title })
	};
}

const shown = (element: HTMLElement) => getComputedStyle(element).visibility === 'visible';
const drawn = (element: HTMLElement) => getComputedStyle(element).display !== 'none';

describe('a side panel', () => {
	it('sits beside the page where there is room, and is remembered put away', async () => {
		const layout = await layoutAt(1280);
		expect(shown(layout.panel())).toBe(true);
		expect(getComputedStyle(layout.panel()).position).toBe('sticky');
		expect(drawn(layout.show())).toBe(false);
		expect(drawn(layout.scrim())).toBe(false);

		layout.hide().click();
		await layout.settle();
		expect(shown(layout.panel())).toBe(false);
		expect(drawn(layout.show())).toBe(true);
		expect(localStorage.getItem(KEY)).toBe('0');
		// On the screen's edge, not the page's.
		expect(layout.show().getBoundingClientRect().right).toBeGreaterThanOrEqual(window.innerWidth);

		layout.show().click();
		await layout.settle();
		expect(shown(layout.panel())).toBe(true);
		expect(localStorage.getItem(KEY)).toBe('1');
	});

	it('comes over all the page where there is not, leaving a strip of it to press', async () => {
		const layout = await layoutAt(400);
		// Away to start with, whatever it was beside a wider page.
		expect(shown(layout.panel())).toBe(false);
		expect(drawn(layout.show())).toBe(true);

		layout.show().click();
		await layout.settle();
		expect(shown(layout.panel())).toBe(true);
		expect(drawn(layout.show())).toBe(false);
		const panel = layout.panel().getBoundingClientRect();
		const area = layout.scroller().getBoundingClientRect();
		// The whole height of what the page's scroller shows, out of the page's flow.
		expect(getComputedStyle(layout.panel()).position).toBe('fixed');
		expect(panel.top).toBeCloseTo(area.top, 0);
		expect(panel.bottom).toBeCloseTo(area.bottom, 0);
		expect(panel.right).toBeCloseTo(area.right, 0);
		expect(panel.left - area.left).toBeGreaterThanOrEqual(40);
		const scrim = layout.scrim().getBoundingClientRect();
		expect([scrim.top, scrim.bottom, scrim.left]).toEqual([area.top, area.bottom, area.left]);

		// The strip of page left showing puts it away.
		layout
			.scrim()
			.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
		await layout.settle();
		expect(shown(layout.panel())).toBe(false);
		// And over the page, putting it away is not remembered for beside it.
		expect(localStorage.getItem(KEY)).toBeNull();
	});

	it('nudges its tab when what it opens changes, and names it in words where there is room', async () => {
		const layout = await layoutAt(1000);
		layout.hide().click();
		await layout.settle();
		expect(layout.show().getAnimations()).toHaveLength(0);
		await layout.retitle('Menu options');
		await layout.settle();
		expect(layout.show().getAnimations()).toHaveLength(1);
		// An icon at this width, its words only for assistive tech.
		const label = defined(layout.show().querySelector<HTMLElement>('.show-label'), 'its words');
		expect(label.getBoundingClientRect().width).toBeLessThanOrEqual(1);
		expect(label.textContent).toBe('Show Menu options');

		await page.viewport(1600, 800);
		expect(label.getBoundingClientRect().width).toBeGreaterThan(40);
	});
});
