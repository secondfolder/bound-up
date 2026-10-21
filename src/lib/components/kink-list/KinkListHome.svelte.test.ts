import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/svelte';
import { page, userEvent } from 'vitest/browser';
import { DeviceKinkList } from '$lib/kink-list/device-store.svelte';
import { defined } from '$lib/testing/defined';
import KinkListHarness from '$lib/testing/KinkListHarness.svelte';
import { waSettled } from '$lib/testing/web-awesome';

/** Debug mode, which only the level of detail's exact switch reads. */
vi.mock('$app/state', () => ({ page: { data: { debug: false } } }));

function emptyStore(): DeviceKinkList {
	localStorage.clear();
	const store = new DeviceKinkList();
	store.open();
	return store;
}

afterEach(async () => {
	await page.viewport(1280, 800);
});

describe('the answer dots', () => {
	it('marks the chosen dot with its level, not only its colour', async () => {
		render(KinkListHarness, { store: emptyStore(), itemKey: 'romance' });
		const scale = screen.getByRole('group', { name: 'Romance and affection' });
		const love = within(scale).getByRole('radio', { name: 'Love' });
		const label = defined(love.closest('label'), 'its label');
		expect(label.dataset.kinkLevel).toBe('love');

		// Which dots popped, recorded as it happens rather than sampled after
		// the click. `popped` lasts only as long as the 220ms pop, and
		// `userEvent.click` resolves only once its round trip through Vitest
		// and Playwright has come back, which under a full parallel run took
		// 300–600ms: the pop had ended and taken the class with it, so a
		// check after the click saw `false`.
		const popped = new Set<string>();
		const observer = new MutationObserver((records) => {
			for (const { target } of records) {
				if (target instanceof HTMLElement && target.classList.contains('popped')) {
					popped.add(target.dataset.kinkLevel ?? '');
				}
			}
		});
		observer.observe(scale, { attributeFilter: ['class'], subtree: true });
		try {
			await userEvent.click(love);
			// The one just chosen pops; the others are left alone.
			await waitFor(() => expect([...popped]).toEqual(['love']));
			// Once the pop has played the class goes, so reading the mark after
			// that reads where it settles, not a frame of its scale-in.
			await waitFor(() => expect(label.classList.contains('popped')).toBe(false));
		} finally {
			observer.disconnect();
		}

		// The mark is the level's own (level-glyphs.css), and showing.
		const dot = defined(label.querySelector('.dot'), 'its dot');
		const mark = getComputedStyle(dot, '::after');
		expect(mark.maskImage).toContain('data:image/svg+xml');
		expect(mark.opacity).toBe('1');
	});

	it('gives every level in the key a different mark', () => {
		const { container } = render(KinkListHarness, { store: emptyStore(), home: true });
		const masks = [...container.querySelectorAll('.key .dot')].map(
			(dot) => getComputedStyle(dot, '::after').maskImage
		);
		expect(masks).toHaveLength(7);
		expect(new Set(masks).size).toBe(7);
	});
});

describe('the pinned bar', () => {
	it('holds the search, the level of detail and "Answer as" on a wide screen', async () => {
		const { container } = render(KinkListHarness, { store: emptyStore(), home: true });
		await waSettled(container);
		const pinned = defined(container.querySelector('.pinned'), 'the pinned bar');
		expect(pinned.querySelector('wa-input[type="search"]')).not.toBeNull();
		expect(pinned.querySelector('.filter')).not.toBeNull();
		expect(pinned.querySelector('.your-side')).not.toBeNull();
	});

	it('pins only the search and the key on a phone, leaving the rest to scroll away', async () => {
		await page.viewport(390, 800);
		const { container } = render(KinkListHarness, { store: emptyStore(), home: true });
		await waSettled(container);
		const pinned = defined(container.querySelector('.pinned'), 'the pinned bar');
		expect(pinned.querySelector('wa-input[type="search"]')).not.toBeNull();
		expect(pinned.querySelector('.key')).not.toBeNull();
		expect(pinned.querySelector('.filter')).toBeNull();
		expect(pinned.querySelector('.your-side')).toBeNull();
		// Moved, not dropped: each is still on the page, once.
		expect(container.querySelectorAll('.filter')).toHaveLength(1);
		expect(container.querySelectorAll('.your-side')).toHaveLength(1);
		// The level of detail takes the whole row it wraps onto.
		const filter = defined(container.querySelector<HTMLElement>('.filter'), 'the filter');
		const search = defined(container.querySelector<HTMLElement>('wa-input'), 'the search');
		expect(filter.getBoundingClientRect().width).toBeCloseTo(
			search.getBoundingClientRect().width,
			0
		);
	});
});

describe('quick fill triage', () => {
	it('leaves no gap under the level of detail, and fits every name in its tile', async () => {
		const { container } = render(KinkListHarness, { store: emptyStore(), triage: true });
		await waSettled(container);
		const filter = defined(container.querySelector<HTMLElement>('.filter'), 'the filter');
		// It used to take a 240px flex basis as its height in this column.
		expect(filter.getBoundingClientRect().height).toBeLessThan(100);
		for (const toggle of container.querySelectorAll<HTMLElement>('.toggle')) {
			expect(toggle.scrollHeight, toggle.textContent ?? '').toBeLessThanOrEqual(
				toggle.clientHeight
			);
		}
	});
});
