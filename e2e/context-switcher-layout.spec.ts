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
};

/** Ada, with `count` partners linked, on Today. The partners' own browsers are closed again. */
async function adaWithPartners(browser: Browser, count: number): Promise<Side> {
	const ada = await newSide(browser, 'Ada');
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
			wedge: document.querySelector('[data-fan-wedge]')?.getAttribute('data-fan-wedge') ?? null
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
		await page.setViewportSize({ width: 1280, height: 800 });
		await openFan(page);
		expectGoodFan(await readFan(page), 2, 'Everyone', 'laptop');

		for (const viewport of [VIEWPORTS[0], VIEWPORTS[3], VIEWPORTS[1]]) {
			if (!viewport) {
				continue;
			}
			await page.setViewportSize(viewport);
			await settled(page);
			await expect(control(page)).toHaveAttribute('aria-expanded', 'true');
			const where = `resized to ${viewport.width}×${viewport.height}`;
			expectGoodFan(await readFan(page), 2, 'Everyone', where);
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

		// Over the disk, between its centre and the options.
		await openFan(page);
		const open = await readFan(page);
		const towards = open.options.reduce(
			(sum, option) => ({
				x: sum.x + (option.avatar.left + option.avatar.right) / 2 / open.options.length,
				y: sum.y + (option.avatar.top + option.avatar.bottom) / 2 / open.options.length
			}),
			{ x: 0, y: 0 }
		);
		await page.mouse.click(
			open.centre.x + (towards.x - open.centre.x) * 0.35,
			Math.max(open.centre.y + (towards.y - open.centre.y) * 0.35, 4)
		);
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
		for (const viewport of [PHONE, { width: 1920, height: 1080 }]) {
			await page.setViewportSize(viewport);
			const size = `${viewport.width}x${viewport.height}`;
			await devtools.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
			await control(page).click();
			// biome-ignore lint/nursery/noPlaywrightWaitForTimeout: a frame at a moment in a slowed animation, which nothing on the page signals.
			await page.waitForTimeout(2500);
			await shot(page, `${size}-opening`);
			// biome-ignore lint/nursery/noPlaywrightWaitForTimeout: as above, once the hint has come in.
			await page.waitForTimeout(6000);
			await shot(page, `${size}-opened-hint`);
			await page.keyboard.press('Escape');
			// biome-ignore lint/nursery/noPlaywrightWaitForTimeout: as above, part way back.
			await page.waitForTimeout(2000);
			await shot(page, `${size}-closing`);
			await devtools.send('Animation.setPlaybackRate', { playbackRate: 1 });
			await expect(page.locator('[data-fan-option]')).toHaveCount(0);
		}
		await devtools.detach();
	} finally {
		await ada.close();
	}
});
