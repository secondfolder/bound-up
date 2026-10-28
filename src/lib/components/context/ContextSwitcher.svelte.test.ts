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
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/navigation', () => ({ invalidate, invalidateAll: vi.fn() }));

const { default: ContextSwitcher } = await import('./ContextSwitcher.svelte');
const { HELD_ATTRIBUTE, holdWhileSwitching } = await import('$lib/context-client.svelte');
const { CLOSE_MS, OPTION_MS } = await import('$lib/context-fan');

const SOLO = '11111111-1111-4111-8111-111111111111';
const JUN = '22222222-2222-4222-8222-222222222222';

const solo: ContextSpaceView = { id: SOLO, kind: 'solo', colour: 'me', names: null };
const jun: ContextSpaceView = {
	id: JUN,
	kind: 'shared',
	colour: 'purple',
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

/** How many shadows a computed `box-shadow` has: commas outside parentheses part them. */
function shadows(boxShadow: string): number {
	return boxShadow === 'none' ? 0 : boxShadow.split(/,(?![^(]*\))/).length;
}

/**
 * Once the fan's options have sprung out to their places: they are measured
 * where they land. Until a few quiet frames, not one await: Svelte spends a
 * transition's delay on an animation of its own and only then starts the
 * real one, so the later options' are not there to await at first.
 */
async function fanSettled() {
	await vi.waitFor(() => {
		if (!document.querySelector('[data-fan-option]')) {
			throw new Error('The fan has no options yet');
		}
	});
	let quiet = 0;
	while (quiet < 3) {
		await new Promise((done) => requestAnimationFrame(done));
		const moving = document
			.getAnimations()
			.filter((animation) => animation.playState !== 'finished');
		quiet = moving.length === 0 ? quiet + 1 : 0;
		await Promise.all(moving.map((animation) => animation.finished.catch(() => undefined)));
	}
}

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

	it('opens on a tap, and closes on a tap anywhere off it', async () => {
		renderSwitcher();
		await userEvent.click(trigger());
		expect(trigger()).toHaveAttribute('aria-expanded', 'true');
		// The page's own corner, far from the fan.
		document.body.click();
		await vi.waitFor(() => expect(trigger()).toHaveAttribute('aria-expanded', 'false'));
	});

	it('closes on a click on something drawn above its backdrop, like the app-wide notice', async () => {
		const notice = document.createElement('button');
		notice.textContent = 'Dismiss';
		notice.style.cssText = 'position: fixed; bottom: 0; left: 0; z-index: 1000';
		const dismissed = vi.fn();
		notice.addEventListener('click', dismissed);
		document.body.append(notice);
		try {
			renderSwitcher();
			await userEvent.click(trigger());
			await userEvent.click(notice);
			await vi.waitFor(() => expect(trigger()).toHaveAttribute('aria-expanded', 'false'));
			// The notice still does what it is for.
			expect(dismissed).toHaveBeenCalled();
		} finally {
			notice.remove();
		}
	});

	it('keeps its hint above the backdrop: its text can be selected, and clicking it does not close', async () => {
		const { container } = renderSwitcher();
		await userEvent.click(trigger());
		await fanSettled();
		const hint = defined(container.querySelector<HTMLElement>('.hint'), 'the hint');
		const text = defined(hint.querySelector<HTMLElement>('.hint-centred'), 'its text');
		const box = text.getBoundingClientRect();
		// What a pointer there reaches is the hint, not the backdrop under it.
		expect(hint.contains(document.elementFromPoint(box.left + box.width / 2, box.top + 4))).toBe(
			true
		);
		await userEvent.tripleClick(hint);
		const selected = globalThis.getSelection()?.toString() ?? '';
		expect(selected).toContain('Tap one');
		// Once: the copy drawn for the other alignment is not selectable.
		expect(selected.split('Tap one')).toHaveLength(2);
		expect(trigger()).toHaveAttribute('aria-expanded', 'true');
	});

	it('dims the whole screen evenly, not a strip along the top', async () => {
		const { container } = renderSwitcher();
		await userEvent.click(trigger());
		const backdrop = defined(container.querySelector<HTMLElement>('.backdrop'), 'the backdrop');
		const box = backdrop.getBoundingClientRect();
		expect(box.width).toBe(document.documentElement.clientWidth);
		expect(box.height).toBe(window.innerHeight);
	});

	it('lets taps through to the page as soon as it closes, while the options are still flying back', async () => {
		const { container } = renderSwitcher();
		await userEvent.click(trigger());
		await fanSettled();
		await userEvent.keyboard('{Escape}');
		const backdrop = defined(
			container.querySelector<HTMLElement>('.backdrop'),
			'the leaving backdrop'
		);
		expect(getComputedStyle(backdrop).pointerEvents).toBe('none');
	});

	it('takes clicks again when opened while it is still closing', async () => {
		const { container } = renderSwitcher();
		await userEvent.click(trigger());
		await fanSettled();
		await userEvent.keyboard('{Escape}');
		trigger().focus();
		await userEvent.keyboard('{Enter}');
		expect(trigger()).toHaveAttribute('aria-expanded', 'true');
		const backdrops = [...container.querySelectorAll<HTMLElement>('.backdrop')];
		expect(backdrops.map((backdrop) => getComputedStyle(backdrop).pointerEvents)).toContain('auto');
		const live = backdrops.at(-1);
		expect(live && getComputedStyle(live).pointerEvents).toBe('auto');
	});

	it('stays open when the window is resized, and lays itself out again', async () => {
		renderSwitcher();
		await userEvent.click(trigger());
		globalThis.dispatchEvent(new Event('resize'));
		await new Promise((done) => requestAnimationFrame(() => done(null)));
		await new Promise((done) => requestAnimationFrame(() => done(null)));
		expect(trigger()).toHaveAttribute('aria-expanded', 'true');
		expect(screen.getByRole('button', { name: 'Show Jun' })).toBeInTheDocument();
	});

	it('shows the name of the one showing now under its place on the ring', async () => {
		renderSwitcher({ kind: 'space', spaceId: JUN });
		await userEvent.click(trigger());
		const current = await vi.waitFor(() => screen.getByRole('button', { name: 'Show Jun' }));
		await vi.waitFor(() =>
			expect(current.querySelector('.slot-name')?.textContent?.trim()).toBe('Jun')
		);
		await vi.waitFor(() => expect(getComputedStyle(current).opacity).toBe('1'));
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

	it('hands a picked avatar to the pill where it is: its own hides, the old one’s shows', async () => {
		// The switch stays under way, as it is while the pill flies home.
		// (Only the switch's: the icons fetch their pictures too.)
		const answer = Promise.withResolvers<Response>();
		fetchMock.mockImplementation((url: unknown) =>
			url === '/api/context' ? answer.promise : Promise.resolve(new Response(null, { status: 404 }))
		);
		const { container } = renderSwitcher({ kind: 'all' });
		try {
			await userEvent.click(trigger());
			await fanSettled();
			const junOption = screen.getByRole('button', { name: 'Show Jun' });
			const junAvatar = defined(
				junOption.querySelector<HTMLElement>('.slot-avatar'),
				'Jun’s avatar'
			);
			junOption.click();
			// The pick's own updates, and no frame yet: what the screen shows
			// next, before the pill starts home.
			await new Promise((done) => setTimeout(done, 0));
			expect(junAvatar).toHaveClass('standing-in');
			expect(trigger()).toHaveClass('landing');
			const everyone = defined(
				screen.getByRole('button', { name: 'Show Everyone' }).querySelector('.slot-avatar'),
				'Everyone’s avatar'
			);
			expect(everyone).not.toHaveClass('standing-in');
			// The pill is on Jun's place, at Jun's size, before it moves anywhere.
			const where = junAvatar.getBoundingClientRect();
			const pill = defined(
				container.querySelector('.control-avatar'),
				'the pill'
			).getBoundingClientRect();
			expect(Math.abs(pill.left + pill.width / 2 - (where.left + where.width / 2))).toBeLessThan(
				1.5
			);
			expect(Math.abs(pill.top + pill.height / 2 - (where.top + where.height / 2))).toBeLessThan(
				1.5
			);
			expect(Math.abs(pill.width - where.width)).toBeLessThan(1.5);
		} finally {
			answer.resolve(new Response(null, { status: 204 }));
		}
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
		await fanSettled();
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

	it('picks by the wedge the finger is in, not only on the avatar', async () => {
		const { container } = renderSwitcher({ kind: 'all' });
		const control = trigger();
		const box = control.getBoundingClientRect();
		const pointer = (type: string, point: { clientX: number; clientY: number }) =>
			control.dispatchEvent(
				new PointerEvent(type, { bubbles: true, button: 0, pointerId: 11, ...point })
			);
		pointer('pointerdown', { clientX: box.left + 10, clientY: box.top + 10 });
		await vi.waitFor(() => expect(control).toHaveAttribute('aria-expanded', 'true'));
		await fanSettled();
		const disk = defined(
			container.querySelector('[data-fan-disk]'),
			'the disk'
		).getBoundingClientRect();
		const centre = { x: disk.left + disk.width / 2, y: disk.top + disk.height / 2 };
		const target = screen.getByRole('button', { name: 'Show Jun' });
		const avatar = defined(
			target.querySelector('.slot-avatar'),
			'Jun’s avatar'
		).getBoundingClientRect();
		const on = { x: avatar.left + avatar.width / 2, y: avatar.top + avatar.height / 2 };
		// Halfway in from the avatar to the centre: in Jun's wedge, well off the avatar.
		const inWedge = {
			clientX: centre.x + (on.x - centre.x) * 0.5,
			clientY: centre.y + (on.y - centre.y) * 0.5
		};
		expect(Math.hypot(inWedge.clientX - on.x, inWedge.clientY - on.y)).toBeGreaterThan(
			avatar.width
		);
		pointer('pointermove', inWedge);
		await vi.waitFor(() => expect(target).toHaveClass('hovered'));
		expect(container.querySelector('.wedge')).toHaveAttribute('data-fan-wedge', JUN);
		pointer('pointerup', inWedge);
		await vi.waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith(
				'/api/context',
				expect.objectContaining({ body: JSON.stringify({ context: JUN }) })
			)
		);
	});

	it('lights the option a mouse is over, opened by a tap, and a click in its wedge picks it', async () => {
		const { container } = renderSwitcher({ kind: 'all' });
		await userEvent.click(trigger());
		await fanSettled();
		const wedge = () => container.querySelector('.wedge')?.getAttribute('data-fan-wedge');
		const hint = () => container.querySelector('.hint-centred')?.textContent?.trim();
		const disk = defined(
			container.querySelector('[data-fan-disk]'),
			'the disk'
		).getBoundingClientRect();
		const centre = { x: disk.left + disk.width / 2, y: disk.top + disk.height / 2 };
		const junOption = screen.getByRole('button', { name: 'Show Jun' });
		const avatar = defined(
			junOption.querySelector('.slot-avatar'),
			'Jun’s avatar'
		).getBoundingClientRect();
		// Half way in from Jun's avatar: in its wedge, off the avatar.
		const inWedge = {
			clientX: centre.x + (avatar.left + avatar.width / 2 - centre.x) * 0.5,
			clientY: centre.y + (avatar.top + avatar.height / 2 - centre.y) * 0.5
		};
		const move = (point: { clientX: number; clientY: number }) =>
			document.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', ...point }));

		move(inWedge);
		await vi.waitFor(() => expect(junOption).toHaveClass('hovered'));
		expect(wedge()).toBe(JUN);
		expect(hint()).toBe('Click to show Jun');
		const backdrop = defined(container.querySelector<HTMLElement>('.backdrop'), 'the backdrop');
		// The pointer anywhere in the sector, since a click there picks.
		expect(getComputedStyle(backdrop).cursor).toBe('pointer');
		// Lit: grown, with no ring round it, and its name moved down clear of it.
		await fanSettled();
		const litAvatar = defined(junOption.querySelector<HTMLElement>('.slot-avatar'), 'Jun’s avatar');
		// One keyline at most (it keeps the avatar off its own colour on the
		// wedge), never the two-part amber ring there used to be.
		expect(shadows(getComputedStyle(litAvatar).boxShadow)).toBeLessThanOrEqual(1);
		const nameElement = defined(junOption.querySelector('.slot-name'), 'Jun’s name');
		expect(nameElement.getBoundingClientRect().top).toBeGreaterThanOrEqual(
			litAvatar.getBoundingClientRect().bottom
		);
		// Bold, but the same colour as a name not lit.
		const meName = defined(
			screen.getByRole('button', { name: 'Show Me' }).querySelector('.slot-name'),
			'Me’s name'
		);
		expect(getComputedStyle(nameElement).fontWeight).toBe('800');
		expect(getComputedStyle(nameElement).color).toBe(getComputedStyle(meName).color);

		// Off the disk: back to the one showing.
		move({ clientX: disk.right + 200, clientY: disk.bottom + 200 });
		await vi.waitFor(() => expect(junOption).not.toHaveClass('hovered'));
		expect(wedge()).toBe('all');
		expect(getComputedStyle(backdrop).cursor).not.toBe('pointer');

		// A touch has no hover: it leaves the one showing lit.
		document.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'touch', ...inWedge }));
		await new Promise((done) => requestAnimationFrame(done));
		expect(wedge()).toBe('all');

		// Back over Jun's wedge, and a click there (on what is under the fan) picks Jun.
		move(inWedge);
		await vi.waitFor(() => expect(wedge()).toBe(JUN));
		backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, ...inWedge }));
		await vi.waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith(
				'/api/context',
				expect.objectContaining({ body: JSON.stringify({ context: JUN }) })
			)
		);
	});

	it('draws no ring round the pill standing in on the ring', async () => {
		const { container } = renderSwitcher();
		await userEvent.click(trigger());
		await fanSettled();
		const avatar = defined(
			container.querySelector<HTMLElement>('.control-avatar'),
			'the pill’s avatar'
		);
		expect(shadows(getComputedStyle(avatar).boxShadow)).toBeLessThanOrEqual(1);
	});

	it('flies the pill home in the fan’s closing time, the options’ and the disk’s', async () => {
		renderSwitcher();
		await userEvent.click(trigger());
		expect(trigger().style.getPropertyValue('--flight-ms')).toBe(`${OPTION_MS}ms`);
		await fanSettled();
		await userEvent.keyboard('{Escape}');
		expect(trigger().style.getPropertyValue('--flight-ms')).toBe(`${CLOSE_MS}ms`);
	});

	it('lights Everyone with a pale spectrum of its members, you first, and a partner in theirs', async () => {
		const { container } = renderSwitcher({ kind: 'all' });
		await userEvent.click(trigger());
		await fanSettled();
		const wedge = defined(container.querySelector<HTMLElement>('.wedge'), 'the wedge');
		const everyone = wedge.style.background;
		const you = everyone.indexOf('var(--space-colour-me)');
		const partner = everyone.indexOf('var(--space-colour-purple)');
		expect(you).toBeGreaterThan(-1);
		expect(partner).toBeGreaterThan(you);
		// Washed towards the cream, not the colours themselves.
		expect(everyone).toContain('var(--wa-color-text-normal)');

		// Lit on Jun instead, the wedge is Jun's colour alone.
		screen.getByRole('button', { name: 'Show Jun' }).focus();
		await vi.waitFor(() => expect(wedge).toHaveAttribute('data-fan-wedge', JUN));
		expect(wedge.style.background).toContain('var(--space-colour-purple)');
		expect(wedge.style.background).not.toContain('var(--space-colour-me)');
	});

	it('lights the option keyboard focus is on', async () => {
		const { container } = renderSwitcher({ kind: 'all' });
		trigger().focus();
		await userEvent.keyboard('{Enter}');
		await fanSettled();
		await userEvent.keyboard('{Tab}');
		const me = screen.getByRole('button', { name: 'Show Me' });
		await vi.waitFor(() => expect(me).toHaveFocus());
		expect(me).toHaveClass('hovered');
		expect(container.querySelector('.wedge')).toHaveAttribute('data-fan-wedge', SOLO);
		// Keyboard focus shows, as a thin outline round the avatar.
		const outline = getComputedStyle(defined(me.querySelector('.slot-avatar'), 'Me’s avatar'));
		expect(outline.outlineStyle).toBe('solid');
		expect(outline.outlineWidth).toBe('2px');
		expect(container.querySelector('.hint-centred')?.textContent?.trim()).toBe('Click to show Me');
	});

	it('highlights Add partner while sliding over it, and opens it on letting go', async () => {
		const { container } = renderSwitcher({ kind: 'all' });
		const control = trigger();
		const box = control.getBoundingClientRect();
		const pointer = (type: string, point: { clientX: number; clientY: number }) =>
			control.dispatchEvent(
				new PointerEvent(type, { bubbles: true, button: 0, pointerId: 9, ...point })
			);
		pointer('pointerdown', { clientX: box.left + 10, clientY: box.top + 10 });
		await vi.waitFor(() => expect(control).toHaveAttribute('aria-expanded', 'true'));
		await fanSettled();
		const add = screen.getByRole('link', { name: 'Add partner' });
		// Followed, but not out of the test's frame.
		const followed = vi.fn((event: Event) => event.preventDefault());
		add.addEventListener('click', followed);
		const avatar = defined(add.querySelector('.slot-avatar'), 'Add partner’s avatar');
		const centre = avatar.getBoundingClientRect();
		const over = {
			clientX: centre.left + centre.width / 2,
			clientY: centre.top + centre.height / 2
		};
		pointer('pointermove', over);
		await vi.waitFor(() => expect(add).toHaveClass('hovered'));
		// It glows rather than taking the wedge, which fades out under it, and
		// the hint says what letting go does.
		const wedge = defined(container.querySelector<HTMLElement>('.wedge'), 'the wedge');
		expect(wedge).toHaveAttribute('data-fan-wedge', 'add');
		expect(wedge).toHaveClass('hidden');
		const glow = defined(add.querySelector('.slot-avatar'), 'Add partner’s avatar');
		await vi.waitFor(() => expect(getComputedStyle(glow, '::before').opacity).toBe('1'));
		expect(container.querySelector('.hint-centred')?.textContent?.trim()).toBe(
			'Let go to add a partner'
		);
		pointer('pointerup', over);
		expect(followed).toHaveBeenCalled();
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

	it('shows its hint last on opening and takes it away first on closing', async () => {
		const { container } = renderSwitcher();
		await userEvent.click(trigger());
		await new Promise((done) => requestAnimationFrame(() => done(null)));
		const hint = defined(container.querySelector<HTMLElement>('.hint'), 'the hint');
		// The options are on their way; the hint waits for them.
		expect(container.querySelector('[data-fan-option]')).not.toBeNull();
		expect(Number(getComputedStyle(hint).opacity)).toBeLessThan(0.1);
		await fanSettled();
		expect(Number(getComputedStyle(hint).opacity)).toBe(1);

		await userEvent.keyboard('{Escape}');
		// Frame by frame until the hint has faded out (it stays in the page
		// until the options are back), then Me's option must still be on its
		// way: the hint went first. Measured against each other rather than
		// the clock, so a slow machine cannot fail it.
		let hintOpacity = 1;
		let meOpacity = 0;
		while (hintOpacity >= 0.05 && container.querySelector('.hint')) {
			await new Promise((done) => requestAnimationFrame(done));
			hintOpacity = Number(getComputedStyle(hint).opacity);
			const me = screen.queryByRole('button', { name: 'Show Me' });
			meOpacity = me ? Number(getComputedStyle(me).opacity) : 0;
		}
		expect(hintOpacity).toBeLessThan(0.05);
		expect(meOpacity).toBeGreaterThan(0.2);
	});

	it('tells assistive tech what letting go will do while sliding, politely', async () => {
		const { container } = renderSwitcher({ kind: 'all' });
		const live = defined(container.querySelector('[aria-live="polite"]'), 'the live region');
		expect(live.textContent).toBe('');
		const control = trigger();
		const box = control.getBoundingClientRect();
		control.dispatchEvent(
			new PointerEvent('pointerdown', {
				bubbles: true,
				button: 0,
				pointerId: 5,
				clientX: box.left + 10,
				clientY: box.top + 10
			})
		);
		await vi.waitFor(() => expect(live.textContent).toBe('Slide onto one, then let go'));
		control.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 5 }));
		await vi.waitFor(() => expect(live.textContent).toBe(''));
	});

	it('keeps every option inside the disk as it grows and as it shrinks back', async () => {
		const { container } = renderSwitcher();
		/** Options whose avatar reaches outside the disk, frame by frame until the fan is gone. */
		const strays = async (until: () => boolean) => {
			const found: string[] = [];
			while (!until()) {
				await new Promise((done) => requestAnimationFrame(done));
				const disk = container.querySelector('[data-fan-disk]')?.getBoundingClientRect();
				if (!disk) {
					continue;
				}
				const centre = { x: disk.left + disk.width / 2, y: disk.top + disk.height / 2 };
				// Not the one showing now: the pill stands in for it, flying from
				// the control rather than the centre.
				for (const option of container.querySelectorAll<HTMLElement>(
					'[data-fan-option]:not([aria-current])'
				)) {
					const avatar = option.querySelector('[data-fan-avatar]')?.getBoundingClientRect();
					if (!avatar || Number(getComputedStyle(option).opacity) < 0.05) {
						continue;
					}
					const far =
						Math.hypot(
							avatar.left + avatar.width / 2 - centre.x,
							avatar.top + avatar.height / 2 - centre.y
						) +
						avatar.width / 2;
					if (far > disk.width / 2 + 0.5) {
						found.push(
							`${option.getAttribute('aria-label') ?? 'Add partner'} ${far.toFixed(1)} > ${(disk.width / 2).toFixed(1)}`
						);
					}
				}
			}
			return found;
		};
		await userEvent.click(trigger());
		let opened = false;
		const growing = strays(() => opened);
		await fanSettled();
		opened = true;
		expect(await growing).toEqual([]);
		await userEvent.keyboard('{Escape}');
		expect(await strays(() => container.querySelector('[data-fan-disk]') === null)).toEqual([]);
	});

	it('shrinks the disk with the options as they fall back, neither behind nor ahead', async () => {
		const { container } = renderSwitcher();
		await userEvent.click(trigger());
		await fanSettled();
		const diskRadius = () =>
			(container.querySelector('[data-fan-disk]')?.getBoundingClientRect().width ?? 0) / 2;
		const disk = defined(
			container.querySelector('[data-fan-disk]'),
			'the disk'
		).getBoundingClientRect();
		const centre = { x: disk.left + disk.width / 2, y: disk.top + disk.height / 2 };
		const meDistance = () => {
			const avatar = screen
				.queryByRole('button', { name: 'Show Me' })
				?.querySelector('[data-fan-avatar]')
				?.getBoundingClientRect();
			return avatar
				? Math.hypot(
						avatar.left + avatar.width / 2 - centre.x,
						avatar.top + avatar.height / 2 - centre.y
					)
				: 0;
		};
		const restDisk = diskRadius();
		const restMe = meDistance();
		await userEvent.keyboard('{Escape}');
		const gaps: number[] = [];
		while (container.querySelector('[data-fan-disk]')) {
			await new Promise((done) => requestAnimationFrame(done));
			const share = meDistance() / restMe;
			if (share > 0.05 && container.querySelector('[data-fan-disk]')) {
				gaps.push(Math.abs(diskRadius() / restDisk - share));
			}
		}
		expect(gaps.length).toBeGreaterThan(3);
		// One clock and one curve: the same share of the way at every frame.
		expect(Math.max(...gaps)).toBeLessThan(0.03);
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

describe('the page while a switch is under way', () => {
	/**
	 * The app shell's `<main>`, held as the layout holds it, with the switcher
	 * in its page's header beside the title and a card below.
	 */
	function renderInPage() {
		const main = document.createElement('main');
		main.innerHTML = `
			<header><h1>Today</h1><div class="corner"></div></header>
			<section><a href="/tasks">Tasks</a></section>
			<p inert>Already held by the page</p>`;
		document.body.append(main);
		const corner = defined(main.querySelector<HTMLElement>('.corner'), 'the corner');
		render(ContextSwitcher, {
			target: corner,
			props: { spaces: [solo, jun], context: { kind: 'all' }, you: 'Ada Lovelace' }
		});
		const stop = $effect.root(() => {
			$effect(() => holdWhileSwitching(main));
		});
		const part = (selector: string) => defined(main.querySelector<HTMLElement>(selector), selector);
		return {
			main,
			title: part('h1'),
			card: part('section'),
			alreadyInert: part('p'),
			done: () => {
				stop();
				main.remove();
			}
		};
	}

	async function pickWithKeyboard(name: string) {
		trigger().focus();
		await userEvent.keyboard('{Enter}');
		const slot = await vi.waitFor(() => screen.getByRole('button', { name: `Show ${name}` }));
		slot.focus();
		await userEvent.keyboard('{Enter}');
	}

	it('holds everything but the switcher until the new context’s data is in, and keeps focus on the pill', async () => {
		const arrival = Promise.withResolvers<void>();
		invalidate.mockImplementationOnce(() => arrival.promise);
		const shell = renderInPage();
		try {
			expect(shell.main).not.toHaveAttribute('aria-busy');
			await pickWithKeyboard('Me');

			await vi.waitFor(() => expect(invalidate).toHaveBeenCalledWith('app:context'));
			expect(shell.main).toHaveAttribute('aria-busy', 'true');
			expect(shell.card.inert).toBe(true);
			expect(shell.card).toHaveAttribute(HELD_ATTRIBUTE);
			expect(shell.title.inert).toBe(true);
			// The pill, and the header around it, stay live: the pill names the
			// new context already, and its close hands focus back to it.
			expect(trigger().closest('[inert]')).toBeNull();
			expect(trigger()).toHaveAccessibleName(/^Showing Me/);
			await vi.waitFor(() => expect(trigger()).toHaveAttribute('aria-expanded', 'false'));
			await vi.waitFor(() => expect(trigger()).toHaveFocus());
			expect(shell.main).toHaveAttribute('aria-busy', 'true');

			arrival.resolve();
			await vi.waitFor(() => expect(shell.main).not.toHaveAttribute('aria-busy'));
			expect(shell.card.inert).toBe(false);
			expect(shell.card).not.toHaveAttribute(HELD_ATTRIBUTE);
			expect(shell.title.inert).toBe(false);
			// What the page had made inert itself, it still has.
			expect(shell.alreadyInert.inert).toBe(true);
		} finally {
			shell.done();
		}
	});

	it('lets go when the server refuses the switch', async () => {
		const response = Promise.withResolvers<Response>();
		fetchMock.mockImplementationOnce(() => response.promise);
		const shell = renderInPage();
		try {
			await pickWithKeyboard('Jun');
			await vi.waitFor(() => expect(shell.main).toHaveAttribute('aria-busy', 'true'));
			expect(shell.card.inert).toBe(true);

			response.resolve(new Response(null, { status: 500 }));
			await vi.waitFor(() => expect(shell.main).not.toHaveAttribute('aria-busy'));
			expect(shell.card.inert).toBe(false);
			expect(invalidate).not.toHaveBeenCalled();
			// And the pill goes back to what the page's data says.
			await vi.waitFor(() => expect(trigger()).toHaveAccessibleName(/^Showing Everyone/));
		} finally {
			shell.done();
		}
	});
});
