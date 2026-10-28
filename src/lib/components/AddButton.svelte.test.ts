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
		expect(onadd).toHaveBeenCalledWith(JUN);
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
		expect(document.querySelector('.wedge')?.classList.contains('hidden')).toBe(true);
		await userEvent.click(screen.getByRole('button', { name: 'Add a task for Jun' }));
		expect(onadd).toHaveBeenCalledWith(JUN);
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
