import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { userEvent } from 'vitest/browser';
import type { AppContext } from '$lib/context';
import { defined } from '$lib/testing/defined';
import { testNamesSource } from '$lib/testing/names';
import { waProp } from '$lib/testing/web-awesome';
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
const invalidate = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidate }));

const { default: ContextSwitcher } = await import('./ContextSwitcher.svelte');

const SOLO = '11111111-1111-4111-8111-111111111111';
const JUN = '22222222-2222-4222-8222-222222222222';

const solo: ContextSpaceView = { id: SOLO, kind: 'solo', colour: 'me', names: null };
const jun: ContextSpaceView = {
	id: JUN,
	kind: 'shared',
	colour: 'violet',
	names: testNamesSource(JUN, { partnerName: 'Jun' })
};

let fetchMock: ReturnType<typeof vi.fn>;
let reducedMotion = false;

beforeEach(() => {
	invalidate.mockClear();
	fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
	vi.stubGlobal('fetch', fetchMock);
	reducedMotion = false;
	const realMatchMedia = globalThis.matchMedia.bind(globalThis);
	vi.stubGlobal('matchMedia', (query: string) =>
		query.includes('prefers-reduced-motion')
			? ({ matches: reducedMotion, media: query } as MediaQueryList)
			: realMatchMedia(query)
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function renderSwitcher(
	context: AppContext = { kind: 'all' },
	spaces: ContextSpaceView[] = [solo, jun]
) {
	return render(ContextSwitcher, { props: { spaces, context, you: 'Ada Lovelace' } });
}

const trigger = () => screen.getByRole('button', { name: /^Showing / });

describe('the control', () => {
	it('is not there for someone with no partner: Everyone would just be them', () => {
		const { container } = renderSwitcher({ kind: 'all' }, [solo]);
		expect(container.querySelector('button')).toBeNull();
	});

	it('shows Everyone as a pie, a slice per person with their initials, you first', async () => {
		const { container } = renderSwitcher({ kind: 'all' });
		expect(trigger()).toHaveAccessibleName(/^Showing Everyone/);
		const pie = defined(container.querySelector('.avatar.all'), 'the pie');
		await vi.waitFor(() => {
			const labels = [...pie.querySelectorAll('.slice-label')].map((label) => label.textContent);
			expect(labels).toEqual(['AL', 'J']);
		});
	});

	it('shows Me as the person glyph, and a partner as their initials', async () => {
		const me = renderSwitcher({ kind: 'space', spaceId: SOLO });
		expect(waProp(me.container.querySelector('.avatar.solo wa-icon'), 'name')).toBe('user');
		expect(trigger()).toHaveAccessibleName(/^Showing Me/);
		me.unmount();

		const partner = renderSwitcher({ kind: 'space', spaceId: JUN });
		await vi.waitFor(() => {
			expect(trigger()).toHaveAccessibleName(/^Showing Jun/);
			expect(partner.container.querySelector('.avatar.shared')?.textContent?.trim()).toBe('J');
		});
	});

	it('is a disclosure button, collapsed until opened', () => {
		renderSwitcher();
		expect(trigger().tagName).toBe('BUTTON');
		expect(trigger()).toHaveAttribute('aria-expanded', 'false');
		expect(trigger()).toHaveAttribute('aria-haspopup', 'true');
	});
});

describe('the fan', () => {
	it('opens from the keyboard onto the one showing, and Escape closes it back onto the control', async () => {
		renderSwitcher({ kind: 'space', spaceId: SOLO });
		trigger().focus();
		await userEvent.keyboard('{Enter}');

		expect(trigger()).toHaveAttribute('aria-expanded', 'true');
		const current = screen.getByRole('button', { name: 'Show Me' });
		expect(current).toHaveAttribute('aria-current', 'true');
		expect(screen.getByRole('button', { name: 'Show Everyone' })).not.toHaveAttribute(
			'aria-current'
		);
		await vi.waitFor(() => expect(current).toHaveFocus());
		expect(screen.getByRole('link', { name: 'Add partner' })).toBeInTheDocument();

		await userEvent.keyboard('{Escape}');
		expect(trigger()).toHaveAttribute('aria-expanded', 'false');
		await vi.waitFor(() => expect(trigger()).toHaveFocus());
	});

	it('toggles with Space too', async () => {
		renderSwitcher();
		trigger().focus();
		await userEvent.keyboard(' ');
		expect(trigger()).toHaveAttribute('aria-expanded', 'true');
	});

	it('opens on a tap, and closes on a tap on what is behind it', async () => {
		renderSwitcher();
		await userEvent.click(trigger());
		expect(trigger()).toHaveAttribute('aria-expanded', 'true');
		// The backdrop, under the fan: a click anywhere off it.
		screen.getByRole('button', { name: 'Close' }).click();
		await vi.waitFor(() => expect(trigger()).toHaveAttribute('aria-expanded', 'false'));
	});

	it('picks a context: tells the server, then refreshes what depends on it', async () => {
		renderSwitcher({ kind: 'all' });
		await userEvent.click(trigger());
		const juns = await vi.waitFor(() => screen.getByRole('button', { name: 'Show Jun' }));
		juns.click();

		await vi.waitFor(() => expect(invalidate).toHaveBeenCalledWith('app:context'));
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/context',
			expect.objectContaining({ method: 'POST', body: JSON.stringify({ context: JUN }) })
		);
		await vi.waitFor(() => expect(trigger()).toHaveAttribute('aria-expanded', 'false'));
	});

	it('picks by holding the control and sliding onto an avatar', async () => {
		renderSwitcher({ kind: 'all' });
		const control = trigger();
		const box = control.getBoundingClientRect();
		const at = { clientX: box.left + 10, clientY: box.top + 10 };
		const pointer = (type: string, point: { clientX: number; clientY: number }) =>
			control.dispatchEvent(
				new PointerEvent(type, { bubbles: true, button: 0, pointerId: 7, ...point })
			);

		pointer('pointerdown', at);
		// Held: the fan opens to slide in, without letting go.
		await vi.waitFor(() => expect(control).toHaveAttribute('aria-expanded', 'true'));
		const target = screen.getByRole('button', { name: 'Show Me' });
		const avatar = defined(target.querySelector('.slot-avatar'), 'Me’s avatar');
		const centre = avatar.getBoundingClientRect();
		const over = {
			clientX: centre.left + centre.width / 2,
			clientY: centre.top + centre.height / 2
		};
		pointer('pointermove', over);
		await vi.waitFor(() => expect(target).toHaveClass('hovered'));
		pointer('pointerup', over);

		await vi.waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith(
				'/api/context',
				expect.objectContaining({ body: JSON.stringify({ context: SOLO }) })
			)
		);
	});

	it('stays open, for tapping, when a slide is let go over nothing', async () => {
		renderSwitcher();
		const control = trigger();
		const box = control.getBoundingClientRect();
		const start = { clientX: box.left + 10, clientY: box.top + 10 };
		control.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 3, ...start })
		);
		// Moving opens it at once, without waiting for the hold.
		const away = { clientX: start.clientX + 30, clientY: start.clientY + 30 };
		control.dispatchEvent(
			new PointerEvent('pointermove', { bubbles: true, pointerId: 3, ...away })
		);
		await vi.waitFor(() => expect(control).toHaveAttribute('aria-expanded', 'true'));
		control.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 3, ...away }));
		await new Promise((done) => setTimeout(done, 50));
		expect(control).toHaveAttribute('aria-expanded', 'true');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('does not move when asked for reduced motion: the fan goes at once', async () => {
		reducedMotion = true;
		renderSwitcher();
		await userEvent.click(trigger());
		expect(screen.getByRole('button', { name: 'Show Me' })).toBeInTheDocument();
		await userEvent.keyboard('{Escape}');
		// No transition out to wait for: gone by the next frame.
		await new Promise((done) => requestAnimationFrame(() => done(null)));
		await new Promise((done) => requestAnimationFrame(() => done(null)));
		expect(screen.queryByRole('button', { name: 'Show Me' })).toBeNull();
	});
});
