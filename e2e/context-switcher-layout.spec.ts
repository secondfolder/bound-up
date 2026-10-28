import { type Browser, expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import {
	linkAccounts,
	newAccounts,
	newSide,
	type Side,
	switchTo,
	waitForHydration
} from './helpers';

/**
 * The context switcher's fan, measured in a real browser (docs/contexts.md,
 * "The fan"): for a phone, a tablet, a laptop and a wide desktop, with one to
 * six partners and each kind of context showing, every option is the same
 * angle from its neighbours, no name runs into another name or another
 * avatar, nothing is off the screen or under the nav, and the one showing now
 * has its name too. The layout maths has unit tests of its own
 * (`src/lib/context-fan.test.ts`); this is the check that the page draws what
 * they promise, at the sizes the page really has.
 *
 * With `SWITCHER_SHOTS` set to a directory, it also saves screenshots there:
 * each layout, and (a test of its own, skipped otherwise) frames part way
 * through opening and closing. For looking at, not for asserting on.
 */

const SHOTS = process.env.SWITCHER_SHOTS;

const PHONE = { width: 390, height: 844 };
const VIEWPORTS = [
	PHONE,
	{ width: 768, height: 1024 },
	{ width: 1280, height: 800 },
	{ width: 1920, height: 1080 }
];

const JUN = 'Jun';
/** A long name, to be cut short with "…". */
const LONG_NAME = 'Bartholomew Fitzgerald-Hughes';
/** Long names among them, to be cut short. */
const PARTNER_NAMES = [JUN, LONG_NAME, 'Mo', 'Seraphina Montgomery-Clarke', 'Kit', 'Alexandria'];

type Rect = { left: number; top: number; right: number; bottom: number };
type Option = {
	name: string;
	current: boolean;
	avatar: Rect;
	label: Rect;
	labelText: string;
	labelOpacity: number;
	truncated: boolean;
};
type Fan = {
	options: Option[];
	centre: { x: number; y: number };
	pill: Rect;
	navTop: number;
	viewport: { width: number; height: number };
	wedge: string | null;
	disk: Rect;
	hint: { side: string | null; box: Rect };
};

/** Ada, with `count` partners linked, on Today. The partners' own browsers are closed again. */
async function adaWithPartners(
	browser: Browser,
	count: number,
	options: Parameters<typeof newSide>[2] = {}
): Promise<Side> {
	const ada = await newSide(browser, 'Ada', options);
	const partners: Side[] = [];
	for (const name of PARTNER_NAMES.slice(0, count)) {
		const side = await newSide(browser, 'Partner');
		side.who = { ...side.who, name };
		partners.push(side);
	}
	try {
		await newAccounts(ada, ...partners);
		for (const partner of partners) {
			await linkAccounts(ada, partner);
		}
	} finally {
		await Promise.all(partners.map((partner) => partner.close()));
	}
	await ada.page.goto('/today');
	await waitForHydration(ada.page);
	return ada;
}

const control = (page: Page) => page.getByRole('button', { name: /^Showing / });

/**
 * Until nothing of the switcher is moving: its options, its disk, the pill.
 * Checked until a quiet frame, not just awaited once: Svelte runs a
 * transition's delay as an animation of its own and only starts the real
 * one when that ends, so the options still to come are not there to await.
 */
async function settled(page: Page) {
	await page.evaluate(async () => {
		const frame = () => new Promise((done) => requestAnimationFrame(done));
		const moving = () =>
			document.getAnimations().filter((animation) => {
				const target = (animation.effect as KeyframeEffect | null)?.target;
				return (
					animation.playState !== 'finished' &&
					target instanceof Element &&
					target.closest('[data-context-switcher]') !== null
				);
			});
		let quiet = 0;
		while (quiet < 3) {
			await frame();
			const now = moving();
			quiet = now.length === 0 ? quiet + 1 : 0;
			await Promise.all(now.map((animation) => animation.finished.catch(() => undefined)));
		}
	});
}

async function openFan(page: Page) {
	await expect(control(page)).not.toHaveAccessibleName(/…/);
	await control(page).click();
	await expect(control(page)).toHaveAttribute('aria-expanded', 'true');
	await settled(page);
}

async function closeFan(page: Page) {
	await page.keyboard.press('Escape');
	await expect(control(page)).toHaveAttribute('aria-expanded', 'false');
	await expect(page.locator('[data-fan-option]')).toHaveCount(0);
}

function readFan(page: Page): Promise<Fan> {
	return page.evaluate(() => {
		const rect = (element: Element | null): Rect => {
			const box = element?.getBoundingClientRect();
			return box
				? { left: box.left, top: box.top, right: box.right, bottom: box.bottom }
				: { left: 0, top: 0, right: 0, bottom: 0 };
		};
		const options = [...document.querySelectorAll('[data-fan-option]')].map((option) => {
			const label = option.querySelector<HTMLElement>('[data-fan-label]');
			return {
				name: option.getAttribute('aria-label') ?? option.textContent?.trim() ?? '',
				current: option.getAttribute('aria-current') === 'true',
				avatar: rect(option.querySelector('[data-fan-avatar]')),
				label: rect(label),
				labelText: label?.textContent?.trim() ?? '',
				labelOpacity: Number(getComputedStyle(option).opacity),
				truncated: label ? label.scrollWidth > label.clientWidth : false
			};
		});
		const disk = rect(document.querySelector('[data-fan-disk]'));
		const pill = document.querySelector('[data-context-switcher] .control-avatar');
		return {
			options,
			centre: { x: (disk.left + disk.right) / 2, y: (disk.top + disk.bottom) / 2 },
			pill: rect(pill),
			navTop: rect(document.querySelector('nav[aria-label="Primary"]')).top,
			viewport: { width: window.innerWidth, height: window.innerHeight },
			wedge: document.querySelector('[data-fan-wedge]')?.getAttribute('data-fan-wedge') ?? null,
			disk,
			hint: {
				side: document.querySelector('[data-fan-hint]')?.getAttribute('data-fan-hint') ?? null,
				box: rect(document.querySelector('[data-fan-hint]'))
			}
		};
	});
}

const overlap = (a: Rect, b: Rect) =>
	a.left < b.right - 0.5 &&
	b.left < a.right - 0.5 &&
	a.top < b.bottom - 0.5 &&
	b.top < a.bottom - 0.5;

/** Everything the fan promises, for one layout. `where` names it in a failure. */
function expectGoodFan(fan: Fan, count: number, current: string, where: string) {
	expect(fan.options, where).toHaveLength(count + 3);
	for (const [i, a] of fan.options.entries()) {
		for (const [j, b] of fan.options.entries()) {
			if (i === j) {
				continue;
			}
			expect(overlap(a.label, b.label), `${where}: ${a.name} and ${b.name}’s names`).toBe(false);
			expect(overlap(a.label, b.avatar), `${where}: ${a.name}’s name on ${b.name}`).toBe(false);
		}
		for (const box of [a.avatar, a.label]) {
			const inside =
				box.left >= 0 &&
				box.top >= 0 &&
				box.right <= fan.viewport.width &&
				box.bottom <= fan.navTop;
			expect(inside, `${where}: ${a.name} is off the screen or under the nav`).toBe(true);
		}
		expect(a.labelText, `${where}: ${a.name} has a name`).not.toBe('');
		expect(a.labelOpacity, `${where}: ${a.name} has faded in`).toBeGreaterThan(0.99);
	}

	// Evenly spread: the same angle between every pair of neighbours.
	const angles = fan.options.map((option) =>
		Math.atan2(
			(option.avatar.top + option.avatar.bottom) / 2 - fan.centre.y,
			(option.avatar.left + option.avatar.right) / 2 - fan.centre.x
		)
	);
	const gaps = angles.slice(1).map((angle, index) => {
		const turn = (angles[index] ?? 0) - angle;
		return (((turn * 180) / Math.PI + 540) % 360) - 180;
	});
	const spread = Math.max(...gaps) - Math.min(...gaps);
	expect(
		spread,
		`${where}: the gaps between options are ${gaps.map((gap) => gap.toFixed(2))}`
	).toBeLessThan(0.5);

	// The one showing now has its name under it, and the pill on its place.
	const shown = fan.options.find((option) => option.current);
	expect(shown?.name, where).toBe(`Show ${current}`);
	expect(shown?.labelText, where).not.toBe('');
	const pillCentre = {
		x: (fan.pill.left + fan.pill.right) / 2,
		y: (fan.pill.top + fan.pill.bottom) / 2
	};
	const slotCentre = {
		x: ((shown?.avatar.left ?? 0) + (shown?.avatar.right ?? 0)) / 2,
		y: ((shown?.avatar.top ?? 0) + (shown?.avatar.bottom ?? 0)) / 2
	};
	expect(Math.hypot(pillCentre.x - slotCentre.x, pillCentre.y - slotCentre.y), where).toBeLessThan(
		2
	);
	expect(shown && overlap(fan.pill, shown.label), `${where}: the pill covers its own name`).toBe(
		false
	);

	// The hint: at the top of the page, inside it, over nothing. Against the
	// right edge when more than a third of the disk's radius is cut off
	// there, centred over the disk otherwise (HINT_RIGHT_CUT).
	const radius = (fan.disk.right - fan.disk.left) / 2;
	const cut = Math.max(0, fan.disk.right - fan.viewport.width) / radius;
	expect(
		fan.hint.side,
		`${where}: the hint's side, with ${cut.toFixed(2)} of the disk cut off`
	).toBe(cut > 1 / 3 ? 'right' : 'centre');
	const { box } = fan.hint;
	expect(box.top, `${where}: the hint is at the top`).toBeLessThan(fan.navTop / 3);
	expect(
		box.left >= 0 && box.top >= 0 && box.right <= fan.viewport.width && box.bottom <= fan.navTop,
		`${where}: the hint is on the page`
	).toBe(true);
	const covered = fan.options
		.filter((option) => overlap(box, option.avatar) || overlap(box, option.label))
		.map((option) => option.name);
	expect(covered, `${where}: what the hint covers`).toEqual([]);
	expect(overlap(box, fan.pill), `${where}: the hint covers the pill`).toBe(false);
	// Right: 12px in from the edge. Centred: over the disk's centre.
	const misplaced =
		fan.hint.side === 'right'
			? fan.viewport.width - box.right - 12
			: (box.left + box.right) / 2 - (fan.disk.left + fan.disk.right) / 2;
	expect(Math.abs(misplaced), `${where}: the hint is off its place by`).toBeLessThan(1);

	// Only a partner's name is ever cut short, and it is still whole in the
	// option's accessible name.
	const cutShort = fan.options
		.filter((option) => option.truncated)
		.filter((option) => !PARTNER_NAMES.some((name) => option.name === `Show ${name}`))
		.map((option) => option.name);
	expect(cutShort, `${where}: names cut short`).toEqual([]);
}

async function shot(page: Page, name: string) {
	if (SHOTS) {
		await page.screenshot({ path: `${SHOTS}/${name}.png` });
	}
}

for (const count of [1, 2, 4, 6]) {
	test(`the fan with ${count} partner${count === 1 ? '' : 's'} is even and legible at every size`, async ({
		browser
	}) => {
		test.setTimeout(240_000);
		const ada = await adaWithPartners(browser, count);
		const { page } = ada;

		try {
			// A long name when there is one, to be cut short.
			const partner = count > 1 ? LONG_NAME : JUN;
			for (const current of ['Everyone', 'Me', partner]) {
				await page.setViewportSize(PHONE);
				await switchTo(page, current);
				for (const viewport of VIEWPORTS) {
					await page.setViewportSize(viewport);
					await openFan(page);
					const where = `${viewport.width}×${viewport.height}, ${count} partners, showing ${current}`;
					const kind = current === partner ? 'partner' : current.toLowerCase();
					await shot(page, `${viewport.width}x${viewport.height}-${count}p-${kind}`);
					const fan = await readFan(page);
					// Everyone, Me, each partner and "Add partner".
					expect(fan.options, where).toHaveLength(count + 3);
					expectGoodFan(fan, count, current, where);
					await closeFan(page);
				}
			}
		} finally {
			await ada.close();
		}
	});
}

test('the fan stays open through a resize, laid out again, and closes on a click anywhere off it', async ({
	browser
}) => {
	test.setTimeout(180_000);
	const ada = await adaWithPartners(browser, 2);
	const { page } = ada;
	const partner = LONG_NAME;
	try {
		await page.setViewportSize({ width: 1920, height: 1080 });
		await openFan(page);
		const wide = await readFan(page);
		expectGoodFan(wide, 2, 'Everyone', 'desktop');
		expect(wide.hint.side).toBe('centre');

		// The hint is part of the fan, above the backdrop: what a pointer on
		// it reaches is the hint, its words can be selected, and doing so
		// leaves the fan open.
		const hint = page.locator('[data-fan-hint]');
		const onHint = await hint.evaluate((element) => {
			const box = element.getBoundingClientRect();
			return element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + 6));
		});
		expect(onHint).toBe(true);
		await hint.click({ clickCount: 3 });
		expect(await page.evaluate(() => getSelection()?.toString() ?? '')).toContain('Tap one');
		await expect(control(page)).toHaveAttribute('aria-expanded', 'true');

		for (const viewport of [VIEWPORTS[0], VIEWPORTS[3], VIEWPORTS[1]]) {
			if (!viewport) {
				continue;
			}
			await page.setViewportSize(viewport);
			await settled(page);
			await expect(control(page)).toHaveAttribute('aria-expanded', 'true');
			const where = `resized to ${viewport.width}×${viewport.height}`;
			const resized = await readFan(page);
			expectGoodFan(resized, 2, 'Everyone', where);
			// Across the threshold and back: the phone's disk is cut off by
			// half, the desktop's not at all.
			expect(resized.hint.side, where).toBe(viewport.width < 1000 ? 'right' : 'centre');
		}

		// Off the fan, over the page: the bottom-left of the screen, clear of every option.
		const fan = await readFan(page);
		await page.mouse.click(12, fan.navTop - 12);
		await expect(control(page)).toHaveAttribute('aria-expanded', 'false');

		// Over the nav: closes, and the tap does not go through to a tab.
		await openFan(page);
		const nav = page.getByRole('navigation', { name: 'Primary' });
		const navBox = await nav.boundingBox();
		await page.mouse.click(
			(navBox?.x ?? 0) + (navBox?.width ?? 0) / 2,
			(navBox?.y ?? 0) + (navBox?.height ?? 0) / 2
		);
		await expect(control(page)).toHaveAttribute('aria-expanded', 'false');
		expect(new URL(page.url()).pathname).toBe('/today');

		// A mouse over a partner's wedge, well off their avatar, lights them and
		// says a click will show them; off the disk, the one showing is lit
		// again. Then a click in the middle of the disk, where no option's
		// sector reaches, closes the fan.
		await openFan(page);
		const open = await readFan(page);
		const target = open.options.find((option) => option.name === 'Show Jun');
		const targetCentre = {
			x: ((target?.avatar.left ?? 0) + (target?.avatar.right ?? 0)) / 2,
			y: ((target?.avatar.top ?? 0) + (target?.avatar.bottom ?? 0)) / 2
		};
		await page.mouse.move(
			open.centre.x + (targetCentre.x - open.centre.x) * 0.55,
			open.centre.y + (targetCentre.y - open.centre.y) * 0.55,
			{ steps: 4 }
		);
		await expect(page.getByRole('button', { name: 'Show Jun', exact: true })).toHaveClass(
			/hovered/
		);
		await expect(page.locator('[data-fan-hint]')).toContainText('Click to show Jun');
		// Lit, Jun's avatar grows and its name moves down out of its way:
		// nothing overlaps, its own avatar included.
		await settled(page);
		const lit = await readFan(page);
		const jun = lit.options.find((option) => option.name === 'Show Jun');
		expect(jun && overlap(jun.label, jun.avatar), 'Jun’s name under its grown avatar').toBe(false);
		expectGoodFan(lit, 2, 'Everyone', 'Jun lit');
		expect(
			await page.locator('.backdrop').evaluate((element) => getComputedStyle(element).cursor)
		).toBe('pointer');
		await page.mouse.move(4, open.navTop - 4, { steps: 4 });
		await expect(page.getByRole('button', { name: 'Show Jun', exact: true })).not.toHaveClass(
			/hovered/
		);
		// Near the centre, inside the disk but in no option's sector, and clear
		// of the hint (which is part of the fan, so a click on it keeps it open).
		const inside = (box: Rect, x: number, y: number) =>
			x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
		const quiet = [20, 30, 40]
			.flatMap((distance) =>
				Array.from({ length: 24 }, (_, step) => ({
					x: open.centre.x + distance * Math.cos((step * Math.PI) / 12),
					y: open.centre.y + distance * Math.sin((step * Math.PI) / 12)
				}))
			)
			.find(
				(point) =>
					point.x > 1 &&
					point.y > 1 &&
					point.x < open.viewport.width - 1 &&
					!inside(open.hint.box, point.x, point.y) &&
					!inside(open.pill, point.x, point.y)
			);
		expect(quiet, 'somewhere near the disk’s centre to click').toBeDefined();
		await page.mouse.click(quiet?.x ?? 0, quiet?.y ?? 0);
		await expect(control(page)).toHaveAttribute('aria-expanded', 'false');

		// The morphed pill closes it too.
		await openFan(page);
		await control(page).click();
		await expect(control(page)).toHaveAttribute('aria-expanded', 'false');

		// And a pick still works after a resize.
		await openFan(page);
		await page.setViewportSize({ width: 390, height: 844 });
		await settled(page);
		await page.getByRole('button', { name: `Show ${partner}`, exact: true }).click();
		await expect(control(page)).toHaveAccessibleName(new RegExp(`^Showing ${partner}\\.`));
		await expect(page.locator('main')).not.toHaveAttribute('aria-busy', 'true');
		await expect(page.getByRole('heading', { level: 2, name: partner })).toBeVisible();

		// Pressing and sliding picks by wedge: a point in Me's slice of the
		// disk, well off Me's avatar, lights Me and picks it on letting go.
		await expect(control(page)).not.toHaveAccessibleName(/…/);
		await expect(page.locator('[data-fan-option]')).toHaveCount(0);
		await settled(page);
		const pill = await control(page).boundingBox();
		const start = { x: (pill?.x ?? 0) + 20, y: (pill?.y ?? 0) + 20 };
		await page.mouse.move(start.x, start.y);
		await page.mouse.down();
		await page.mouse.move(start.x - 30, start.y + 30, { steps: 3 });
		await expect(control(page)).toHaveAttribute('aria-expanded', 'true');
		await settled(page);
		const sliding = await readFan(page);
		const me = sliding.options.find((option) => option.name === 'Show Me');
		const meCentre = {
			x: ((me?.avatar.left ?? 0) + (me?.avatar.right ?? 0)) / 2,
			y: ((me?.avatar.top ?? 0) + (me?.avatar.bottom ?? 0)) / 2
		};
		const inWedge = {
			x: sliding.centre.x + (meCentre.x - sliding.centre.x) * 0.55,
			y: sliding.centre.y + (meCentre.y - sliding.centre.y) * 0.55
		};
		await page.mouse.move(inWedge.x, inWedge.y, { steps: 5 });
		await expect(page.getByRole('button', { name: 'Show Me', exact: true })).toHaveClass(/hovered/);
		await expect(page.locator('[data-fan-wedge]')).not.toHaveAttribute('data-fan-wedge', 'add');
		await page.mouse.up();
		await expect(control(page)).toHaveAccessibleName(/^Showing Me\./);
	} finally {
		await ada.close();
	}
});

test('the pointer shows wherever a click picks, even over the hint, and the hint can still be selected', async ({
	browser
}) => {
	test.setTimeout(180_000);
	// The hint lies over part of some sectors (Add partner's, at the top of the
	// disk, most often), and used to show the text cursor there, though a click
	// there picks: every lit point must show the pointer, whatever is under it.
	const ada = await adaWithPartners(browser, 3);
	const { page } = ada;
	try {
		for (const size of [PHONE, { width: 1920, height: 1080 }]) {
			await page.setViewportSize(size);
			await openFan(page);
			const fan = await readFan(page);
			const radius = Math.max(
				...fan.options.map((option) =>
					Math.hypot(
						(option.avatar.left + option.avatar.right) / 2 - fan.centre.x,
						(option.avatar.top + option.avatar.bottom) / 2 - fan.centre.y
					)
				)
			);
			const misses: string[] = [];
			let lit = 0;
			for (let angle = 0; angle < 360; angle += 3) {
				for (let share = 0.2; share <= 1.2; share += 0.1) {
					const x = fan.centre.x + Math.cos((angle * Math.PI) / 180) * radius * share;
					const y = fan.centre.y + Math.sin((angle * Math.PI) / 180) * radius * share;
					if (x < 1 || y < 1 || x > size.width - 1 || y > size.height - 1) {
						continue;
					}
					await page.mouse.move(x, y);
					const under = await page.evaluate(
						([px, py]) => {
							const element = document.elementFromPoint(px, py);
							return {
								lit: document.querySelector('[data-fan-option].hovered') !== null,
								cursor: element ? getComputedStyle(element).cursor : null,
								what: element
									? `${element.tagName.toLowerCase()}.${[...element.classList].join('.')}`
									: null
							};
						},
						[x, y]
					);
					if (under.lit) {
						lit += 1;
						if (under.cursor !== 'pointer') {
							misses.push(`${Math.round(x)},${Math.round(y)} over ${under.what}: ${under.cursor}`);
						}
					}
				}
			}
			expect(lit, 'points that light an option').toBeGreaterThan(20);
			expect(misses, `${size.width}px: lit points without the pointer`).toEqual([]);

			// Dragging across the hint's words selects them, and neither picks
			// nor closes, wherever the hint lies.
			const hint = page.locator('[data-fan-hint] span').filter({ visible: true }).first();
			const box = await hint.boundingBox();
			if (box === null) {
				throw new Error('The hint has no box to drag across');
			}
			const before = await control(page).getAttribute('aria-label');
			await page.mouse.move(box.x + 2, box.y + box.height / 2);
			await page.mouse.down();
			await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 8 });
			await page.mouse.up();
			expect(await page.evaluate(() => document.getSelection()?.toString() ?? '')).not.toBe('');
			await expect(control(page)).toHaveAttribute('aria-expanded', 'true');
			expect(await control(page).getAttribute('aria-label')).toBe(before);
			await page.evaluate(() => document.getSelection()?.removeAllRanges());
			// Closed by a click off the fan: pressing on the hint took focus out
			// of the switcher, so Escape (heard by the switcher) is not the way.
			await page.mouse.click(5, size.height / 2);
			await expect(control(page)).toHaveAttribute('aria-expanded', 'false');
			await expect(page.locator('[data-fan-option]')).toHaveCount(0);
		}
	} finally {
		await ada.close();
	}
});

test('frames part way through opening and closing, to look at', async ({ browser }) => {
	// biome-ignore lint/suspicious/noSkippedTests: it only takes screenshots, for a person to look at; it asserts nothing a run needs.
	test.skip(!SHOTS, 'Screenshots only: set SWITCHER_SHOTS to a directory.');
	test.setTimeout(180_000);
	const ada = await adaWithPartners(browser, 4);
	const { page } = ada;
	try {
		// Every animation slowed tenfold, so a frame lands part way: the
		// options leaving the disk's centre, the pill leaving its place.
		const devtools = await page.context().newCDPSession(page);
		await devtools.send('Animation.enable');
		await page.setViewportSize(PHONE);
		await switchTo(page, LONG_NAME);
		for (const viewport of [PHONE, { width: 1920, height: 1080 }]) {
			await page.setViewportSize(viewport);
			const size = `${viewport.width}x${viewport.height}`;
			await devtools.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
			await control(page).click();
			for (const [at, name] of [
				[1000, 'opening-1'],
				[1000, 'opening-2'],
				[1500, 'opening-3']
			] as const) {
				// biome-ignore lint/nursery/noPlaywrightWaitForTimeout: frames at moments in a slowed animation, which nothing on the page signals.
				await page.waitForTimeout(at);
				await shot(page, `${size}-${name}`);
			}
			await devtools.send('Animation.setPlaybackRate', { playbackRate: 1 });
			await settled(page);
			// The wedge at rest under a partner, the one showing.
			await shot(page, `${size}-wedge-partner`);
			await devtools.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
			await page.keyboard.press('Escape');
			for (const [at, name] of [
				[1000, 'closing-1'],
				[1000, 'closing-2'],
				[1000, 'closing-3']
			] as const) {
				// biome-ignore lint/nursery/noPlaywrightWaitForTimeout: as above, on the way back.
				await page.waitForTimeout(at);
				await shot(page, `${size}-${name}`);
			}
			await devtools.send('Animation.setPlaybackRate', { playbackRate: 1 });
			await expect(page.locator('[data-fan-option]')).toHaveCount(0);

			// Slid onto "Add partner": the wedge under it in the accent.
			await settled(page);
			const pill = await control(page).boundingBox();
			const start = { x: (pill?.x ?? 0) + 20, y: (pill?.y ?? 0) + 20 };
			await page.mouse.move(start.x, start.y);
			await page.mouse.down();
			await page.mouse.move(start.x - 20, start.y + 20, { steps: 3 });
			await settled(page);
			const add = await page
				.getByRole('link', { name: 'Add partner' })
				.locator('[data-fan-avatar]')
				.boundingBox();
			await page.mouse.move(
				(add?.x ?? 0) + (add?.width ?? 0) / 2,
				(add?.y ?? 0) + (add?.height ?? 0) / 2,
				{
					steps: 5
				}
			);
			await settled(page);
			await shot(page, `${size}-wedge-add`);
			// Let go over nothing, then close.
			await page.mouse.move(2, (pill?.y ?? 0) + 400, { steps: 3 });
			await page.mouse.up();
			await closeFan(page);
		}
		// The hint gliding from centred over the disk to the right edge, as a
		// resize crosses the threshold.
		await page.setViewportSize({ width: 1920, height: 1080 });
		await openFan(page);
		await shot(page, '1920x1080-hint-centred');
		await devtools.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
		await page.setViewportSize({ width: 900, height: 1080 });
		// biome-ignore lint/nursery/noPlaywrightWaitForTimeout: a frame part way through a slowed glide, which nothing on the page signals.
		await page.waitForTimeout(1500);
		await shot(page, '900x1080-hint-moving');
		await devtools.send('Animation.setPlaybackRate', { playbackRate: 1 });
		await settled(page);
		await shot(page, '900x1080-hint-right');
		await devtools.detach();
	} finally {
		await ada.close();
	}
});

test('a pick flies the picked avatar straight from its place on the ring into the control', async ({
	browser
}) => {
	test.setTimeout(180_000);
	const ada = await adaWithPartners(browser, 2);
	const { page } = ada;
	try {
		for (const viewport of [PHONE, { width: 1920, height: 1080 }]) {
			await page.setViewportSize(viewport);
			const size = `${viewport.width}x${viewport.height}`;
			// From whatever shows now to the other partner, each time.
			const now = await control(page).getAttribute('aria-label');
			const picked = now?.startsWith(`Showing ${JUN}.`) ? LONG_NAME : JUN;
			await openFan(page);
			const option = page.getByRole('button', { name: `Show ${picked}`, exact: true });
			const start = await option.locator('[data-fan-avatar]').boundingBox();

			// Record where the pill's avatar is, every frame, from the pick until
			// it is home and still.
			await page.evaluate(() => {
				const frames: { x: number; y: number; width: number }[] = [];
				(globalThis as unknown as { pillFrames: typeof frames }).pillFrames = frames;
				const avatar = document.querySelector('[data-context-switcher] .control-avatar');
				const record = () => {
					const box = avatar?.getBoundingClientRect();
					if (box) {
						frames.push({
							x: box.left + box.width / 2,
							y: box.top + box.height / 2,
							width: box.width
						});
					}
					if (frames.length < 120) {
						requestAnimationFrame(record);
					}
				};
				requestAnimationFrame(record);
			});
			if (SHOTS) {
				const devtools = await page.context().newCDPSession(page);
				await devtools.send('Animation.enable');
				await devtools.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
				await option.click();
				for (let frame = 0; frame < 8; frame += 1) {
					await shot(page, `${size}-pick-${frame}`);
					// biome-ignore lint/nursery/noPlaywrightWaitForTimeout: frames 40ms apart in a slowed animation, which nothing on the page signals.
					await page.waitForTimeout(400);
				}
				await devtools.send('Animation.setPlaybackRate', { playbackRate: 1 });
				await devtools.detach();
			} else {
				await option.click();
			}
			await expect(control(page)).toHaveAccessibleName(new RegExp(`^Showing ${picked}\\.`));
			await expect(page.locator('[data-fan-option]')).toHaveCount(0);
			await settled(page);
			const frames = await page.evaluate(
				() =>
					(globalThis as unknown as { pillFrames: { x: number; y: number; width: number }[] })
						.pillFrames
			);
			const home = frames.at(-1) ?? { x: 0, y: 0, width: 0 };
			const distances = frames.map((frame) => Math.hypot(frame.x - home.x, frame.y - home.y));
			// The pill steps into the picked avatar's place in one frame, as that
			// avatar hides and the old one's shows again, so nothing on screen
			// moves; from there it only flies home. It used to jump 46px out of
			// the old one's place (its anchor resized a frame late for the new
			// name), glide to the picked one, and only then fly home.
			const startCentre = {
				x: (start?.x ?? 0) + (start?.width ?? 0) / 2,
				y: (start?.y ?? 0) + (start?.height ?? 0) / 2
			};
			const leaving = frames.findIndex(
				(frame) => Math.hypot(frame.x - startCentre.x, frame.y - startCentre.y) < 3
			);
			expect(leaving, `${size}: the pill starts on the picked avatar`).toBeGreaterThan(-1);
			const flight = distances.slice(leaving);
			// Only ever closer to home: no jump away, no doubling back.
			const away = flight
				.slice(1)
				.map((distance, index) => distance - (flight[index] ?? 0))
				.filter((step) => step > 2);
			expect(away, `${size}: steps away from home, px`).toEqual([]);
			// And nothing before it, out of the fan's current place, jumped far.
			const before = distances.slice(0, Math.max(leaving, 0));
			const jumps = before.filter((distance) => distance > (distances[0] ?? 0) + 3);
			expect(jumps, `${size}: jumps before the flight`).toEqual([]);
		}
	} finally {
		await ada.close();
	}
});

test('the wedge’s sides are sharp and anti-aliased, to look at', async ({ browser }) => {
	// biome-ignore lint/suspicious/noSkippedTests: it only takes screenshots, for a person to look at; it asserts nothing a run needs.
	test.skip(!SHOTS, 'Screenshots only: set SWITCHER_SHOTS to a directory.');
	test.setTimeout(240_000);
	for (const scale of [1, 2]) {
		const ada = await adaWithPartners(browser, 4, { deviceScaleFactor: scale });
		const { page } = ada;
		try {
			for (const viewport of [PHONE, { width: 1920, height: 1080 }]) {
				await page.setViewportSize(viewport);
				for (const name of ['Me', LONG_NAME, 'Mo']) {
					await switchTo(page, name);
					await openFan(page);
					const fan = await readFan(page);
					const shown = fan.options.find((option) => option.current);
					expect(shown?.name).toBe(`Show ${name}`);
					const at = {
						x: ((shown?.avatar.left ?? 0) + (shown?.avatar.right ?? 0)) / 2,
						y: ((shown?.avatar.top ?? 0) + (shown?.avatar.bottom ?? 0)) / 2
					};
					// The wedge's two sides, half a step either side of the option,
					// part way out where the wedge is solid.
					const angle = Math.atan2(at.y - fan.centre.y, at.x - fan.centre.x);
					const neighbours = fan.options
						.map((option) =>
							Math.atan2(
								(option.avatar.top + option.avatar.bottom) / 2 - fan.centre.y,
								(option.avatar.left + option.avatar.right) / 2 - fan.centre.x
							)
						)
						.map((other) => Math.abs(other - angle))
						.filter((gap) => gap > 0.001);
					const half = Math.min(...neighbours) / 2;
					const distance = Math.hypot(at.x - fan.centre.x, at.y - fan.centre.y) * 0.85;
					for (const [side, turn] of [
						['start', -half],
						['end', half]
					] as const) {
						const x = fan.centre.x + distance * Math.cos(angle + turn);
						const y = fan.centre.y + distance * Math.sin(angle + turn);
						if (x < 12 || y < 12 || x > viewport.width - 12 || y > fan.navTop - 12) {
							continue;
						}
						const degrees = Math.round((((angle + turn) * 180) / Math.PI + 360) % 180);
						await page.screenshot({
							path: `${SHOTS}/aa/app-dpr${scale}-${viewport.width}-${name.split(' ')[0]}-${side}-${degrees}deg.png`,
							clip: { x: x - 12, y: y - 12, width: 24, height: 24 }
						});
					}
					await closeFan(page);
				}
			}
		} finally {
			await ada.close();
		}
	}
});
