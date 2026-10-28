import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { userEvent } from 'vitest/browser';
import { defined } from '$lib/testing/defined';
import { testNamesSource } from '$lib/testing/names';
import type { ContextSpaceView } from '$lib/types';

// Partner names are sealed; these open them by record id (sealed-refs.ts).
vi.mock('$lib/crypto/sealed', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/crypto/sealed')>()),
	openRecord: (await import('$lib/testing/sealed-refs')).openTestRecord
}));
vi.mock('$lib/crypto/vaults.svelte', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/crypto/vaults.svelte')>()),
	vaultById: (id: string) => ({ id })
}));
vi.mock('$app/paths', () => import('$lib/testing/app-paths'));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/navigation', () => ({ invalidate: vi.fn(), invalidateAll: vi.fn() }));

const { default: AddButton } = await import('./AddButton.svelte');

const SOLO = '11111111-1111-4111-8111-111111111111';
const JUN = '22222222-2222-4222-8222-222222222222';
const MO = '33333333-3333-4333-8333-333333333333';

const solo: ContextSpaceView = { id: SOLO, kind: 'solo', colour: 'me', names: null };
const jun: ContextSpaceView = {
	id: JUN,
	kind: 'shared',
	colour: 'purple',
	names: testNamesSource(JUN, { partnerName: 'Jun' })
};
const mo: ContextSpaceView = {
	id: MO,
	kind: 'shared',
	colour: 'teal',
	names: testNamesSource(MO, { partnerName: 'Mo' })
};

beforeEach(() => {
	// The fan at once, so a test reads where it ends up rather than racing it.
	const realMatchMedia = globalThis.matchMedia.bind(globalThis);
	vi.stubGlobal('matchMedia', (query: string) =>
		query.includes('prefers-reduced-motion')
			? ({ matches: true, media: query } as MediaQueryList)
			: realMatchMedia(query)
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function renderButton(targets: string[], onadd = vi.fn()) {
	const result = render(AddButton, {
		props: {
			label: 'Add a task',
			lead: 'New task for',
			targets,
			spaces: [solo, jun, mo],
			you: 'Ada Lovelace',
			onadd
		}
	});
	return { ...result, onadd };
}

describe('the add button', () => {
	it('is not there when there is nowhere to add', () => {
		const { container } = renderButton([]);
		expect(container.querySelector('.add-button')).toBeNull();
	});

	it('adds straight away where there is one place to add, with no fan', async () => {
		const { onadd } = renderButton([JUN]);
		const button = screen.getByRole('button', { name: 'Add a task' });
		expect(button).not.toHaveAttribute('aria-expanded');
		await userEvent.click(button);
		// With where the button is, for whatever opens to grow out of it.
		expect(onadd).toHaveBeenCalledWith(JUN, expect.any(DOMRect));
		expect(document.querySelector('[data-fan-option]')).toBeNull();
	});

	it('asks whose it is with a fan of avatars where there are several, and adds for the one picked', async () => {
		const { onadd } = renderButton([SOLO, JUN, MO]);
		const button = screen.getByRole('button', { name: /^Add a task: choose whose/ });
		expect(button).toHaveAttribute('aria-expanded', 'false');
		await userEvent.click(button);
		expect(button).toHaveAttribute('aria-expanded', 'true');
		// An avatar per place it can go, named for what picking it does, and
		// nothing for Everyone or adding a partner: those are not places.
		const options = [...document.querySelectorAll('[data-fan-option]')].map((option) =>
			option.getAttribute('aria-label')
		);
		expect(options).toEqual(['Add a task for me', 'Add a task for Jun', 'Add a task for Mo']);
		// Nothing is selected yet: there is no "showing now" to start on.
		expect(document.querySelector('.wedge')).toBeNull();
		// Lit, the wedge appears already in its own sector, rather than
		// swinging round from the first option's as it fades in.
		screen.getByRole('button', { name: 'Add a task for Jun' }).focus();
		await vi.waitFor(() =>
			expect(document.querySelector('.wedge')).toHaveAttribute('data-fan-wedge', JUN)
		);
		await userEvent.click(screen.getByRole('button', { name: 'Add a task for Jun' }));
		// With where the button is, for whatever opens to grow out of it.
		expect(onadd).toHaveBeenCalledWith(JUN, expect.any(DOMRect));
		await vi.waitFor(() => expect(button).toHaveAttribute('aria-expanded', 'false'));
	});

	it('offers only the places it is given, in the switcher’s order', async () => {
		renderButton([MO, SOLO]);
		await userEvent.click(screen.getByRole('button', { name: /^Add a task: choose whose/ }));
		const options = [...document.querySelectorAll('[data-fan-option]')].map((option) =>
			option.getAttribute('aria-label')
		);
		expect(options).toEqual(['Add a task for me', 'Add a task for Mo']);
	});

	it('names the lit avatar where the hint is, under what picking it does, and closes on Escape without adding', async () => {
		const { onadd } = renderButton([SOLO, JUN]);
		await userEvent.click(screen.getByRole('button', { name: /^Add a task: choose whose/ }));
		const hint = () => document.querySelector('.hint-right .text')?.textContent?.trim();
		const lead = () => document.querySelector('.hint-right .lead')?.textContent?.trim();
		expect(hint()).toMatch(/^Tap whose it’s for/);
		expect(lead()).toBeUndefined();
		screen.getByRole('button', { name: 'Add a task for Jun' }).focus();
		// The name, with what picking it does over it.
		await vi.waitFor(() => expect(hint()).toBe('Jun'));
		expect(lead()).toBe('New task for');
		// Above the disk, at the bottom of its box, next to the disk.
		const copy = defined(document.querySelector<HTMLElement>('.hint-right'), 'the hint');
		expect(getComputedStyle(copy).justifyContent).toBe('flex-end');
		await userEvent.keyboard('{Escape}');
		await vi.waitFor(() => expect(document.querySelector('[data-fan-option]')).toBeNull());
		expect(onadd).not.toHaveBeenCalled();
	});

	it('lights an avatar from anywhere on its disk above the nav, and nothing from the nav over it', async () => {
		// Inside an app shell with its bottom nav, the button just above it,
		// as on a list page.
		const shell = document.createElement('div');
		shell.setAttribute('data-app-shell', '');
		shell.style.cssText = 'position: fixed; inset: 0; display: flex; flex-direction: column;';
		const page = document.createElement('div');
		page.style.cssText = 'flex: 1 1 auto; display: flex; flex-direction: column;';
		const nav = document.createElement('nav');
		nav.style.cssText = 'flex: none; block-size: 60px;';
		shell.append(page, nav);
		document.body.append(shell);
		try {
			const onadd = vi.fn();
			render(AddButton, {
				target: page,
				props: {
					label: 'Add a task',
					lead: 'New task for',
					targets: [SOLO, JUN],
					spaces: [solo, jun, mo],
					you: 'Ada',
					onadd
				}
			});
			const button = screen.getByRole('button', { name: /^Add a task: choose whose/ });
			await userEvent.click(button);
			const box = button.getBoundingClientRect();
			const centre = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
			const navTop = nav.getBoundingClientRect().top;
			const move = (x: number, y: number) =>
				document.dispatchEvent(
					new PointerEvent('pointermove', { pointerType: 'mouse', clientX: x, clientY: y })
				);
			const lit = () =>
				document.querySelector('[data-fan-option].hovered')?.getAttribute('aria-label');
			// Left of the button and a little above the nav, past the run of
			// edge the avatars are spread along: the end option nearest it.
			move(centre.x - 70, navTop - 4);
			await vi.waitFor(() => expect(lit()).toBe('Add a task for Jun'));
			// The same, a little lower, over the nav: nothing.
			move(centre.x - 70, navTop + 4);
			await vi.waitFor(() => expect(lit()).toBeUndefined());
			// And a click there picks nothing.
			document.elementFromPoint(centre.x - 70, navTop + 4)?.dispatchEvent(
				new MouseEvent('click', {
					bubbles: true,
					detail: 1,
					clientX: centre.x - 70,
					clientY: navTop + 4
				})
			);
			expect(onadd).not.toHaveBeenCalled();
		} finally {
			shell.remove();
		}
	});

	it('swaps any icon but a + for a × while its fan is open, and names avatars as asked', async () => {
		render(AddButton, {
			props: {
				label: 'Write something',
				lead: 'Write to',
				icon: 'pen-to-square',
				forName: (name: string) => `Write to ${name}`,
				targets: [JUN, MO],
				spaces: [solo, jun, mo],
				you: 'Ada',
				onadd: vi.fn()
			}
		});
		const button = screen.getByRole('button', { name: /^Write something: choose whose/ });
		// A property once upgraded, which Svelte sets rather than the attribute.
		const icon = () => button.querySelector<HTMLElement & { name?: string }>('wa-icon')?.name;
		expect(icon()).toBe('pen-to-square');
		await userEvent.click(button);
		await vi.waitFor(() => expect(icon()).toBe('xmark'));
		expect(screen.getByRole('button', { name: 'Write to Jun' })).toBeVisible();
		await userEvent.keyboard('{Escape}');
		await vi.waitFor(() => expect(icon()).toBe('pen-to-square'));
	});

	it('waits while an add is under way', () => {
		render(AddButton, {
			props: {
				label: 'Add a task',
				lead: 'New task for',
				targets: [JUN],
				spaces: [solo, jun],
				you: 'Ada',
				onadd: vi.fn(),
				busy: true
			}
		});
		expect(screen.getByRole('button', { name: 'Add a task' })).toBeDisabled();
	});
});
