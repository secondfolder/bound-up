import type { Browser, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { defined } from '../src/lib/testing/defined';
import { sql } from './db';
import { test } from './fixtures';
import {
	clickWaButton,
	linkAccounts,
	newAccount,
	newAccounts,
	newSide,
	type Side,
	settle,
	startAdding,
	switchTo,
	typeRichText,
	waitForHydration
} from './helpers';

/**
 * The scene designer end to end: a scene is a notebook entry with a prompt
 * column beside it. See docs/scenes.md.
 *
 * Live updates are asserted with a retrying `expect` and never a reload: a
 * reload would pass whether or not the live path works at all.
 */

const surface = (page: Page) =>
	page.locator('.richtext-editor .surface[contenteditable="true"]').first();

const column = (page: Page) => page.getByRole('complementary', { name: 'Ideas and prompts' });

const prompt = (page: Page, id: string) => column(page).locator(`[data-prompt="${id}"]`);

/** Starts a scene from a notebook list and waits until it can be written in. */
async function startScene(page: Page): Promise<string> {
	await waitForHydration(page);
	await page.getByRole('tab', { name: 'Scenes' }).click();
	await startAdding(page, 'New scene');
	await page.waitForURL(/\/notebook\/[0-9a-f-]{36}$/);
	await expect(page.getByText('Saved')).toBeVisible();
	return page.url();
}

/** Both accounts linked with control shared, both on the shared notebook. */
async function sharedNotebook(browser: Browser): Promise<{ ada: Side; bo: Side; url: string }> {
	const ada = await newSide(browser, 'Ada');
	const bo = await newSide(browser, 'Bo');
	await newAccounts(ada, bo);
	await linkAccounts(ada, bo, 'mix');
	// Today in the partnership's context, whose notebook card sets that
	// context on the way to /notebook (docs/contexts.md).
	await bo.page.goto('/today');
	// After hydration: before it the card is a plain link, which goes to
	// /notebook without setting the context.
	await waitForHydration(bo.page);
	await switchTo(bo.page, 'Ada');
	await expect(bo.page.getByRole('heading', { level: 2, name: 'Ada', exact: true })).toBeVisible();
	// The card, not the nav's tab of the same name.
	await bo.page.getByRole('main').getByRole('link', { name: 'Notebook', exact: true }).click();
	await bo.page.waitForURL(/\/notebook$/);
	return { ada, bo, url: bo.page.url() };
}

test.describe('a solo scene', () => {
	test('offers prompts beside the page, and keeps what was written, sealed', async ({
		browser
	}) => {
		const side = await newSide(browser, 'Ada');
		try {
			await newAccount(side.page, side.who);
			await side.page.goto('/notebook');
			const url = await startScene(side.page);

			// The essentials are there from the start; one about speaking waits
			// until the page mentions something that would stop it.
			await expect(prompt(side.page, 'how-will-you-stop')).toBeVisible();
			await expect(prompt(side.page, 'without-words')).toHaveCount(0);
			const sentinel = `sentinel-${crypto.randomUUID().slice(0, 8)}`;
			await typeRichText(side.page, `Slow, with a gag. ${sentinel}`);
			await expect(prompt(side.page, 'without-words')).toBeVisible();

			// An answer goes onto the page, and the prompt goes from the column.
			await prompt(side.page, 'how-will-you-stop')
				.getByRole('button', { name: 'Red / yellow / green' })
				.click();
			await expect(surface(side.page)).toContainText('To stop: Red / yellow / green');
			await expect(prompt(side.page, 'how-will-you-stop')).toHaveCount(0);
			await expect(side.page.getByText('Saved')).toBeVisible();

			// The page and what was dealt with both survive a reload.
			await side.page.goto(url);
			await expect(surface(side.page)).toContainText(sentinel);
			await expect(prompt(side.page, 'what-are-you-craving')).toBeVisible();
			await expect(prompt(side.page, 'how-will-you-stop')).toHaveCount(0);

			const { rows } = await sql(
				`SELECT e.ciphertext AS header, u.ciphertext AS edit
				   FROM notebook_entries e JOIN notebook_updates u ON u.entry_id = e.id
				  WHERE e.id = ?`,
				[url.split('/').at(-1) ?? '']
			);
			expect(rows.length).toBeGreaterThan(0);
			expect(JSON.stringify(rows)).not.toContain(sentinel);
		} finally {
			await side.close();
		}
	});

	test('remembers Fewer and More, and folds away for focus', async ({ browser }) => {
		const side = await newSide(browser, 'Ada');
		try {
			await newAccount(side.page, side.who);
			await side.page.goto('/notebook');
			const url = await startScene(side.page);

			await expect(prompt(side.page, 'next-day')).toHaveCount(0);
			await column(side.page).getByRole('button', { name: 'More things to think about' }).click();
			await expect(prompt(side.page, 'next-day')).toBeVisible();
			// Saved a moment after the change, sealed, to this person's settings.
			await expect
				.poll(async () => {
					const { rows } = await sql(
						`SELECT s.revision FROM scene_preferences s JOIN user u ON u.id = s.user_id
						  WHERE u.email = ?`,
						[side.who.email]
					);
					return rows.length;
				})
				.toBe(1);

			await side.page.goto(url);
			await expect(prompt(side.page, 'next-day')).toBeVisible();

			await column(side.page).getByRole('button', { name: 'Hide ideas and prompts' }).click();
			await expect(prompt(side.page, 'how-will-you-stop')).toHaveCount(0);
			await side.page.goto(url);
			await waitForHydration(side.page);
			// Its button is in the title's row, not the column, which is away.
			await expect(side.page.getByRole('button', { name: 'Show ideas and prompts' })).toBeVisible();
			await expect(column(side.page)).toBeHidden();
		} finally {
			await side.close();
		}
	});
});

test.describe('below a menu', () => {
	test('a press below a menu that ends the page adds one line to write on, and only one', async ({
		browser
	}) => {
		const side = await newSide(browser, 'Ada');
		try {
			await newAccount(side.page, side.who);
			await side.page.goto('/notebook');
			await startScene(side.page);
			await column(side.page).getByRole('button', { name: 'Menu', exact: true }).click();
			const menu = side.page.locator('.scene-menu').first();
			const box = defined(await menu.boundingBox(), 'the menu');
			const blocks = surface(side.page).locator(':scope > *');
			const before = await blocks.count();

			await side.page.mouse.click(box.x + 50, box.y + box.height + 40);
			await expect(blocks).toHaveCount(before + 1);
			// Back into the menu, and below it again: the line is already there.
			await side.page.mouse.click(box.x + 50, box.y + 40);
			await side.page.mouse.click(box.x + 50, box.y + box.height + 40);
			await side.page.keyboard.type('After the menu');
			await expect(blocks).toHaveCount(before + 1);
			await expect(blocks.last()).toHaveText('After the menu');
		} finally {
			await side.close();
		}
	});
});

test.describe('the column on a phone', () => {
	test('slides over the page from the title’s row, and goes when the page is pressed', async ({
		browser
	}) => {
		const side = await newSide(browser, 'Ada');
		try {
			await side.page.setViewportSize({ width: 390, height: 800 });
			await newAccount(side.page, side.who);
			await side.page.goto('/notebook');
			await startScene(side.page);

			// Away to start with, so the page has the whole width.
			await expect(column(side.page)).toBeHidden();
			const editor = await surface(side.page).boundingBox();
			expect(editor?.width ?? 0).toBeGreaterThan(300);

			await side.page.getByRole('button', { name: 'Show ideas and prompts' }).click();
			await expect(column(side.page)).toBeVisible();
			const panel = await column(side.page).boundingBox();
			// Never all of it: a strip of the page stays to press.
			expect(panel?.x ?? 0).toBeGreaterThanOrEqual(40);

			await side.page.mouse.click(10, (panel?.y ?? 0) + 100);
			await expect(column(side.page)).toBeHidden();
		} finally {
			await side.close();
		}
	});
});

test.describe('story ideas and what you’re into', () => {
	test('a chip writes a story line, and tapping it again takes it out', async ({ browser }) => {
		const side = await newSide(browser, 'Ada');
		try {
			await newAccount(side.page, side.who);
			await side.page.goto('/notebook');
			await startScene(side.page);

			// No kink list yet: the column says how to get chips, not nothing.
			await expect(column(side.page).getByRole('link', { name: 'kink list' })).toBeVisible();

			const chip = column(side.page).getByRole('button', {
				name: 'the bedroom with the lights low'
			});
			await chip.click();
			await expect(surface(side.page)).toContainText('Where: the bedroom with the lights low');
			await expect(
				surface(side.page).locator('.scene-section[data-section="story"]')
			).toBeVisible();
			await expect(chip).toHaveAttribute('aria-pressed', 'true');

			await chip.click();
			await expect(surface(side.page)).not.toContainText('the bedroom with the lights low');
		} finally {
			await side.close();
		}
	});
});

test.describe('help from the model', () => {
	test('asks only when pressed, and only once the person has agreed', async ({ browser }) => {
		const side = await newSide(browser, 'Ada');
		try {
			await newAccount(side.page, side.who);
			await side.page.goto('/notebook');
			const url = await startScene(side.page);

			await column(side.page).getByRole('button', { name: 'What might we have missed?' }).click();
			const consent = side.page
				.getByRole('dialog')
				.filter({ has: side.page.getByRole('heading', { name: 'Before the model helps' }) });
			await expect(consent).toBeVisible();
			// Not inside `consent`: the footer's buttons are slotted into the
			// dialog's host, not descendants of the native <dialog> in its shadow root.
			await side.page.getByRole('button', { name: 'I understand, ask it' }).click();

			const idea = column(side.page).getByRole('heading', { name: 'Stub: water within reach?' });
			await expect(idea).toBeVisible();
			await column(side.page).locator('.idea').getByRole('button', { name: 'Add a note' }).click();
			await expect(surface(side.page).locator('.scene-section[data-section="prep"]')).toContainText(
				'Stub: water within reach?'
			);

			// Agreed once, for good: the next ask goes straight through.
			await side.page.goto(url);
			await column(side.page).getByRole('button', { name: 'Suggest a menu' }).click();
			await expect(side.page.getByRole('heading', { name: 'Before the model helps' })).toHaveCount(
				0
			);
			await expect(surface(side.page).locator('.scene-menu')).toContainText('stub massage');
		} finally {
			await side.close();
		}
	});
});

test.describe('a shared scene', () => {
	test('shows both partners what was dealt with, live, and leaves access to its creator', async ({
		browser
	}) => {
		const { ada, bo, url } = await sharedNotebook(browser);
		try {
			const sceneUrl = await startScene(bo.page);
			await ada.page.goto(sceneUrl);
			await expect(surface(ada.page)).toBeVisible();
			await expect(prompt(ada.page, 'how-will-you-stop')).toBeVisible();

			await prompt(bo.page, 'how-will-you-stop')
				.getByRole('button', { name: 'A safeword of our own' })
				.click();
			await expect(surface(ada.page)).toContainText('To stop: A safeword of our own');
			await expect(prompt(ada.page, 'how-will-you-stop')).toHaveCount(0);

			// Control is shared, so only Bo, who started it, decides who sees it.
			await clickWaButton(bo.page, 'Settings');
			await expect(bo.page.locator('wa-select[name="access"]')).toBeVisible();
			await expect(ada.page.getByRole('button', { name: 'Settings' })).toHaveCount(0);
			await expect(ada.page.locator('wa-select[name="access"]')).toHaveCount(0);
			expect(url).toContain('/notebook');
		} finally {
			await ada.close();
			await bo.close();
		}
	});
});

test.describe('menu designs', () => {
	test('a design chosen in the menu’s options is what both partners see', async ({ browser }) => {
		const { ada, bo } = await sharedNotebook(browser);
		try {
			const sceneUrl = await startScene(bo.page);
			await ada.page.goto(sceneUrl);
			await expect(surface(ada.page)).toBeVisible();

			await column(bo.page).getByRole('button', { name: 'Menu', exact: true }).click();
			await bo.page.keyboard.type('Slow oil massage');
			const options = bo.page.getByRole('complementary', { name: 'Menu options' });
			await options.getByRole('button', { name: 'Dungeon board', exact: true }).click();
			await expect(
				options.getByRole('button', { name: 'Dungeon board', exact: true })
			).toHaveAttribute('aria-pressed', 'true');

			await expect(surface(ada.page).locator('.scene-menu.design-dungeon')).toBeVisible();
			// Its Reset shows only while rewritten copy is edited: Web Awesome's
			// button styles once showed it under every menu.
			await expect(surface(ada.page).locator('.menu-copy-reset')).toBeHidden();
			await expect(surface(ada.page).locator('.scene-menu-course')).toHaveCount(4);
			await options.getByRole('button', { name: 'Bimbo', exact: true }).click();
			await expect(surface(ada.page).locator('.scene-menu.design-bimbo')).toBeVisible();

			// A toy chest's toys are picked by tapping them.
			await options.getByRole('button', { name: 'Toy chest', exact: true }).click();
			const second = surface(bo.page).locator('.menu-course-art').nth(1);
			await expect(second).toHaveAttribute('data-art', 'cuffs');
			await second.click();
			await bo.page.locator('wa-popover.art-picker').getByRole('button', { name: 'Rope' }).click();
			await expect(surface(ada.page).locator('.menu-course-art').nth(1)).toHaveAttribute(
				'data-art',
				'rope'
			);

			// So is the pet design's pet, and its title follows.
			await options.getByRole('button', { name: 'Pet play', exact: true }).click();
			await surface(bo.page).locator('.menu-mascot').click();
			await bo.page.locator('wa-popover.art-picker').getByRole('button', { name: 'Kitty' }).click();
			await expect(surface(ada.page).locator('.scene-menu.design-pet')).toHaveAttribute(
				'data-mascot',
				'kitty'
			);
			await expect(surface(ada.page).locator('.menu-title')).toHaveText('Good Kitty');

			// And the sampler's stitched pictures, one at a time.
			await options.getByRole('button', { name: 'Cross-stitch sampler', exact: true }).click();
			await surface(bo.page).locator('.menu-picture').nth(1).click();
			await bo.page.locator('wa-popover.art-picker').getByRole('button', { name: 'Heart' }).click();
			await expect
				.poll(() =>
					surface(ada.page)
						.locator('.menu-picture')
						.evaluateAll((pictures) => pictures.map((picture) => picture.getAttribute('data-art')))
				)
				.toEqual(['bunny', 'heart', 'fox']);
		} finally {
			await ada.close();
			await bo.close();
		}
	});

	test('a menu’s own title and subtitle take the design’s place, and clear back to it', async ({
		browser
	}) => {
		const { ada, bo } = await sharedNotebook(browser);
		try {
			const sceneUrl = await startScene(bo.page);
			await ada.page.goto(sceneUrl);
			await expect(surface(ada.page)).toBeVisible();

			await column(bo.page).getByRole('button', { name: 'Menu', exact: true }).click();
			const options = bo.page.getByRole('complementary', { name: 'Menu options' });
			const title = options.getByLabel('Title', { exact: true });
			await expect(title).toHaveAttribute('placeholder', 'Menu');
			await title.pressSequentially('Our night');
			await options.getByLabel('Subtitle').pressSequentially('For two');

			const seen = surface(ada.page).locator('.scene-menu');
			await expect(seen.locator('.menu-title')).toHaveText('Our night');
			await expect(seen.locator('.menu-subtitle')).toHaveText('For two');

			// The title is the first field; its clear button is Web Awesome's.
			await options
				.locator('wa-input')
				.first()
				.getByRole('button', { name: 'Clear entry' })
				.click();
			await expect(seen.locator('.menu-title')).toHaveText('Menu');

			// Written on the menu itself: the field follows, and so does the partner.
			const onMenu = surface(bo.page).locator('.scene-menu .menu-title');
			await onMenu.click();
			await bo.page.keyboard.press('ControlOrMeta+a');
			await bo.page.keyboard.type('Late show');
			await expect(title).toHaveValue('Late show');
			await expect(seen.locator('.menu-title')).toHaveText('Late show');

			// A design's own words too, kept with that design.
			await options.getByRole('button', { name: 'Office after hours', exact: true }).click();
			// The memo's lines are one copy: Enter adds another.
			const memo = surface(bo.page).locator('.menu-copy[data-copy="memo"]');
			const labels = surface(ada.page).locator('.menu-copy[data-copy="memo"] .copy-label');
			await memo.click();
			await bo.page.keyboard.press('ControlOrMeta+a');
			await bo.page.keyboard.type('TO: Whoever reads this');
			await bo.page.keyboard.press('Enter');
			await bo.page.keyboard.type('CC: The night shift');
			await expect(labels).toHaveText(['TO:', 'CC:']);
			await expect(
				surface(ada.page).locator('.menu-copy[data-copy="memo"] .copy-value').last()
			).toHaveText(' The night shift');
			await bo.page.getByRole('button', { name: 'Reset' }).click();
			await expect(labels).toHaveText(['TO:', 'RE:', 'FROM:']);

			// Decora strings its subtitle as a kandi bracelet, a word at a time.
			// It sways while pointed at, which Playwright would wait out as
			// never stable.
			await bo.page.emulateMedia({ reducedMotion: 'reduce' });
			await options.getByRole('button', { name: 'Decora', exact: true }).click();
			// Its confetti is drawn after the menu is, which Lexical once took
			// out again as not its own.
			await expect(surface(ada.page).locator('.menu-confetti > i').first()).toBeAttached();
			await surface(bo.page).locator('.menu-subtitle').click();
			await bo.page.keyboard.press('ControlOrMeta+a');
			await bo.page.keyboard.type('Bo picks');
			await expect(surface(ada.page).locator('.menu-subtitle .bead-word')).toHaveText([
				'Bo',
				'picks'
			]);

			// Its stickers either side of the title are picked as a course's are.
			await surface(bo.page).locator('.menu-picture').first().click();
			await bo.page
				.locator('wa-popover.art-picker')
				.getByRole('button', { name: 'Rainbow' })
				.click();
			await expect(surface(ada.page).locator('.menu-picture').first()).toHaveAttribute(
				'data-art',
				'rainbow'
			);
		} finally {
			await ada.close();
			await bo.close();
		}
	});

	test('items are rated and numbered by tapping them, once the menu has a scale and a number', async ({
		browser
	}) => {
		const { ada, bo } = await sharedNotebook(browser);
		try {
			const sceneUrl = await startScene(bo.page);
			await ada.page.goto(sceneUrl);
			await expect(surface(ada.page)).toBeVisible();

			await column(bo.page).getByRole('button', { name: 'Menu', exact: true }).click();
			await bo.page.keyboard.type('Slow oil massage');
			const item = surface(bo.page).locator('.scene-menu-line.item', {
				hasText: 'Slow oil massage'
			});
			// Nothing to rate or number until the menu has them.
			await expect(item.getByRole('button')).toHaveCount(0);

			const options = bo.page.getByRole('complementary', { name: 'Menu options' });
			await options.locator('wa-switch', { hasText: 'Enable menu item ratings' }).click();
			// Typed a key at a time: each one changes the menu, which once took
			// the focus back to the page after the first.
			await options.getByLabel('What the rating means').pressSequentially('Intensity');
			await options.locator('wa-switch', { hasText: 'Enable menu item values' }).click();
			await options.getByLabel('What the number means').pressSequentially('Price');
			await expect(options.getByLabel('What the number means')).toHaveValue('Price');

			// Every item shows the whole scale; a tap asks for a rating beside it,
			// on a slider, set as it moves.
			await item.getByRole('button', { name: 'Rate this' }).click();
			const asked = bo.page.locator('wa-popover.item-extras');
			await asked.locator('wa-slider').evaluate((slider: HTMLElement & { value: number }) => {
				slider.value = 3;
				slider.dispatchEvent(new Event('change'));
			});
			await expect(item).toHaveAttribute('data-rating', '3');
			await item.getByRole('button', { name: 'Set a number' }).click();
			// Something that is not a number is said to be wrong, and changes nothing.
			const number = asked.locator('wa-input input');
			await number.pressSequentially('twelve');
			await expect(asked.locator('wa-input')).toHaveAttribute('aria-invalid', 'true');
			await expect(asked.getByRole('alert')).toHaveText('Enter a number, like 12 or 4.5');
			await number.fill('');
			await number.pressSequentially('12');
			await expect(asked.getByRole('alert')).toHaveCount(0);

			const seen = surface(ada.page).locator('.scene-menu-line.item', {
				hasText: 'Slow oil massage'
			});
			await expect(seen).toHaveAttribute('data-rating', '3');
			await expect(seen).toHaveAttribute('data-value', '12');
			await expect(seen.locator('.menu-value')).toHaveText('12');
			await expect(surface(ada.page).locator('.menu-key')).toContainText('Intensity');
			await expect(surface(ada.page).locator('.menu-key')).toContainText('Price');
		} finally {
			await ada.close();
			await bo.close();
		}
	});
});

test.describe('blocks', () => {
	test('headings made from the toolbar become a menu’s courses', async ({ browser }) => {
		const side = await newSide(browser, 'Ada');
		try {
			await newAccount(side.page, side.who);
			await side.page.goto('/notebook');
			await startScene(side.page);
			await typeRichText(side.page, 'Mains');
			await side.page.keyboard.press('Enter');
			await side.page.keyboard.type('Rope');
			await side.page.keyboard.press('Enter');
			await side.page.keyboard.type('Afterwards');
			await side.page.keyboard.press('Enter');
			await side.page.keyboard.type('Tea');

			const toolbar = side.page.getByRole('toolbar', { name: 'Text formatting' });
			for (const heading of ['Mains', 'Afterwards']) {
				await surface(side.page).getByText(heading, { exact: true }).dblclick();
				await toolbar.getByRole('button', { name: /^Text style/ }).click();
				await toolbar.getByRole('menuitemradio', { name: 'Heading', exact: true }).click();
				await expect(surface(side.page).locator('h2', { hasText: heading })).toBeVisible();
			}

			await surface(side.page).click();
			await side.page.keyboard.press('ControlOrMeta+a');
			await toolbar.getByRole('button', { name: 'Make a menu' }).click();
			const courses = surface(side.page).locator('.scene-menu .scene-menu-course');
			await expect(courses).toHaveCount(2);
			await expect(courses.first().locator('.scene-menu-line.heading')).toHaveText('Mains');
			await expect(courses.last().locator('.scene-menu-line.item')).toHaveText('Tea');
		} finally {
			await side.close();
		}
	});

	test('selected lines become a menu from the selection’s toolbar', async ({ browser }) => {
		const side = await newSide(browser, 'Ada');
		try {
			await newAccount(side.page, side.who);
			await side.page.goto('/notebook');
			await startScene(side.page);
			await typeRichText(side.page, 'Massage');
			await side.page.keyboard.press('Enter');
			await side.page.keyboard.type('Blindfold');
			await side.page.keyboard.press('ControlOrMeta+a');
			await side.page
				.getByRole('toolbar', { name: 'Text formatting' })
				.getByRole('button', { name: 'Make a menu' })
				.click();
			await expect(surface(side.page).locator('.scene-menu .scene-menu-line.item')).toHaveCount(2);
			// The caret is in the menu now, so the sidebar is its options.
			await expect(side.page.getByRole('complementary', { name: 'Menu options' })).toBeVisible();
		} finally {
			await side.close();
		}
	});

	test('a menu built together, with a surprise in it the partner cannot read or delete', async ({
		browser
	}) => {
		const { ada, bo } = await sharedNotebook(browser);
		try {
			const sceneUrl = await startScene(bo.page);
			await ada.page.goto(sceneUrl);
			await expect(surface(ada.page)).toBeVisible();

			// Bo adds a menu from the column and writes the first item.
			await column(bo.page).getByRole('button', { name: 'Menu', exact: true }).click();
			await expect(surface(bo.page).locator('.scene-menu')).toBeVisible();
			await bo.page.keyboard.type('Massage');
			await bo.page.keyboard.press('Enter');
			const secret = `blindfold-${crypto.randomUUID().slice(0, 6)}`;
			await bo.page.keyboard.type(secret);

			// …and makes that second item a surprise for Ada, by selecting it
			// and choosing so from the selection's toolbar.
			await surface(bo.page).getByText(secret).click({ clickCount: 3 });
			const toolbar = bo.page.getByRole('toolbar', { name: 'Text formatting' });
			await toolbar.getByRole('button', { name: 'Make a surprise' }).click();
			await expect(toolbar.getByRole('button', { name: 'Not a surprise' })).toBeVisible();

			await expect(surface(ada.page)).toContainText('Massage');
			await expect(surface(ada.page).locator('.scene-menu-line.surprise')).toHaveCount(1);
			// Still in the page's DOM (both partners can decrypt it), but not on screen.
			await expect(surface(ada.page)).not.toContainText(secret, { useInnerText: true });

			// Select everything on Ada's side and press Backspace: refused, so the
			// surprise survives on Bo's.
			await surface(ada.page).click();
			await ada.page.keyboard.press('ControlOrMeta+a');
			await ada.page.keyboard.press('Backspace');
			await expect(surface(bo.page)).toContainText(secret);
		} finally {
			await ada.close();
			await bo.close();
		}
	});
});

test.describe('a scene moved out of its shared space', () => {
	test('keeps the partner’s surprise a surprise, there and back', async ({ browser }) => {
		const { ada, bo } = await sharedNotebook(browser);
		try {
			// Bo starts it, so with control shared it is Bo's to move.
			const sceneUrl = await startScene(bo.page);
			await typeRichText(bo.page, 'Candles first.');
			await expect(bo.page.getByText('Saved')).toBeVisible();
			await ada.page.goto(sceneUrl);
			await expect(surface(ada.page)).toContainText('Candles first.');

			// Ada adds a menu whose second item is a surprise for Bo.
			await surface(ada.page).press('End');
			await column(ada.page).getByRole('button', { name: 'Menu', exact: true }).click();
			await expect(surface(ada.page).locator('.scene-menu')).toBeVisible();
			await ada.page.keyboard.type('Massage');
			await ada.page.keyboard.press('Enter');
			const secret = `blindfold-${crypto.randomUUID().slice(0, 6)}`;
			await ada.page.keyboard.type(secret);
			await surface(ada.page).getByText(secret).click({ clickCount: 3 });
			const toolbar = ada.page.getByRole('toolbar', { name: 'Text formatting' });
			await toolbar.getByRole('button', { name: 'Make a surprise' }).click();
			await expect(ada.page.getByText('Saved')).toBeVisible();
			await expect(surface(bo.page).locator('.scene-menu-line.surprise')).toHaveCount(1, {
				timeout: 15_000
			});

			await clickWaButton(bo.page, /^Move$/);
			const dialog = bo.page.locator('wa-dialog').filter({
				has: bo.page.locator('wa-select[name="spaceId"]')
			});
			// Bo's own space is the only other place it could go, so it is
			// already chosen. Where it is and where it would go each carry
			// their space's dot.
			await expect(dialog.locator('wa-select[name="spaceId"]')).not.toHaveJSProperty('value', '');
			await expect(dialog.locator('.current')).toHaveText(
				/This scene is currently shared with\s+Ada\./
			);
			await expect(dialog.locator('.current .dot')).toHaveCount(1);
			await expect(dialog.locator('wa-select[name="spaceId"] > .dot[slot="start"]')).toHaveCount(1);
			await expect(dialog).not.toContainText('surprise');
			await dialog.locator('wa-button', { hasText: 'Move' }).click();
			await expect(dialog).toHaveCount(0, { timeout: 15_000 });

			// Ada's page leaves. Bo's has everything, Ada's surprise included,
			// and it is still a surprise for Bo in Bo's own space.
			await ada.page.waitForURL(/\/notebook$/, { timeout: 15_000 });
			await expect(surface(bo.page)).toContainText('Candles first.');
			await expect(surface(bo.page)).toContainText('Massage');
			await expect(surface(bo.page).locator('.scene-menu-line.surprise')).toHaveCount(1);
			await expect(surface(bo.page)).not.toContainText(secret, { useInnerText: true });

			// Back to the shared space: still Bo's surprise, and still Ada's to read.
			await clickWaButton(bo.page, /^Move$/);
			await dialog.locator('wa-button', { hasText: 'Move' }).click();
			await expect(dialog).toHaveCount(0, { timeout: 15_000 });
			await expect(surface(bo.page).locator('.scene-menu-line.surprise')).toHaveCount(1, {
				timeout: 15_000
			});
			await ada.page.goto(sceneUrl);
			await expect(surface(ada.page)).toContainText(secret, { useInnerText: true });
			await expect(surface(ada.page).locator('.scene-menu-line.surprise')).toHaveCount(0);
		} finally {
			await ada.close();
			await bo.close();
		}
	});
});

test.describe('a menu’s own page', () => {
	/** A menu with one to-do in it, and a line after it, so the caret can leave it. */
	async function menuWithToDo(page: Page) {
		await column(page).getByRole('button', { name: 'Menu', exact: true }).click();
		const menu = surface(page).locator('.scene-menu').first();
		await expect(menu).toBeVisible();
		await page.keyboard.type('[ ] Massage');
		await expect(menu.locator('.scene-menu-line.item .menu-line-check').first()).toBeVisible();
		// Rated, so its items have a rating to tap (or not).
		await page
			.getByRole('complementary', { name: 'Menu options' })
			.getByText('Enable menu item ratings')
			.click();
		await expect(menu.locator('button.menu-rates').first()).toBeVisible();
		const box = defined(await menu.boundingBox(), 'the menu');
		await page.mouse.click(box.x + 50, box.y + box.height + 40);
		await page.keyboard.type('After the menu');
		await expect(page.getByText('Saved')).toBeVisible();
		return menu;
	}

	const toDo = (page: Page) =>
		page.locator('.scene-menu .scene-menu-line.item').filter({ hasText: 'Massage' }).first();

	test('is linked from the menu’s corner, copied, and opened on a page of its own', async ({
		browser
	}) => {
		const side = await newSide(browser, 'Ada');
		try {
			await newAccount(side.page, side.who);
			await side.page.goto('/notebook');
			const sceneUrl = await startScene(side.page);
			const menu = await menuWithToDo(side.page);

			// The caret is after the menu, so its corner shows only while it is
			// pointed at.
			const link = menu.locator('.menu-link');
			await expect(link).toBeHidden();
			await menu.hover();
			await expect(link).toBeVisible();
			await expect(menu.locator('.menu-delete')).toBeVisible();

			await link.click();
			const popover = side.page.locator('wa-popover.menu-link-popover');
			await expect(popover.getByText('Link copied to your clipboard.')).toBeVisible();
			const menuId = defined(await menu.getAttribute('data-menu-id'), 'the menu’s id');
			const expected = `${sceneUrl}/menus/${menuId}`;
			await expect(popover.locator('wa-input input')).toHaveValue(expected);
			expect(await side.page.evaluate(() => navigator.clipboard.readText())).toBe(expected);

			const [menuPage] = await Promise.all([
				side.page.context().waitForEvent('page'),
				popover.getByRole('link', { name: 'Open' }).click()
			]);
			await waitForHydration(menuPage);
			expect(menuPage.url()).toBe(expected);
			const shown = menuPage.locator('.richtext-editor .surface');
			await expect(shown.locator('.scene-menu')).toBeVisible();
			// The menu alone: none of the rest of the scene, and none of the app.
			await expect(shown.getByText('After the menu')).toBeHidden();
			await expect(menuPage.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
			await expect(shown.locator('.menu-tools')).toBeHidden();
			// The menu is the page, edge to edge: no column, gutter or margin
			// around it. (A scrollbar may take a little of the width.)
			const viewport = defined(menuPage.viewportSize(), 'the window');
			const filled = defined(await shown.locator('.scene-menu').boundingBox(), 'the menu');
			expect([filled.x, filled.y]).toEqual([0, 0]);
			expect(filled.width).toBeGreaterThan(viewport.width - 20);
			expect(filled.height).toBeGreaterThanOrEqual(viewport.height);
			await expect(shown).toHaveAttribute('contenteditable', 'false');

			// Nothing for writing shows while it is read only, even where it
			// is clicked into; in edit mode it all shows, wherever the caret.
			await toDo(menuPage).locator('.menu-line-words').click();
			await expect(shown.locator('.menu-add-course')).toBeHidden();
			// Nothing that only changes in edit mode looks pressable.
			const cursorOf = (selector: string) =>
				shown
					.locator(selector)
					.first()
					.evaluate((element) => getComputedStyle(element).cursor);
			expect(await cursorOf('button.menu-rates')).not.toBe('pointer');
			expect(await cursorOf('button.menu-line-check')).toBe('pointer');
			// Its title is not to be rewritten here, but it can be selected.
			await expect(shown.locator('.menu-title')).toHaveAttribute('contenteditable', 'false');
			await shown.locator('.menu-title').dblclick();
			expect(await menuPage.evaluate(() => globalThis.getSelection()?.toString().trim())).not.toBe(
				''
			);

			// Read only, but its to-dos tick, for the scene too.
			await toDo(menuPage).locator('.menu-line-check').click();
			await expect(toDo(menuPage)).toHaveClass(/\bchecked\b/);
			await expect(toDo(side.page)).toHaveClass(/\bchecked\b/);

			// Editable from its corner, and back.
			await clickWaButton(menuPage, 'Edit');
			await expect(shown).toHaveAttribute('contenteditable', 'true');
			await expect(shown.locator('.menu-add-course')).toBeVisible();
			// At the end of its words: a rated line ends in its rating, past
			// which End does not take the caret.
			const words = toDo(menuPage).locator('.menu-line-words');
			const wordsBox = defined(await words.boundingBox(), 'the item’s words');
			await words.click({ position: { x: wordsBox.width - 1, y: wordsBox.height / 2 } });
			await menuPage.keyboard.type(' with oil');
			await expect(toDo(side.page)).toContainText('Massage with oil');
			// A title being written in is left by a press anywhere else on the
			// menu, which the menu otherwise takes for itself.
			await shown.locator('.menu-title').click();
			await expect(shown.locator('.menu-title')).toBeFocused();
			await menuPage.mouse.click(4, 300);
			await expect(shown.locator('.menu-title')).not.toBeFocused();

			// Selected words get the formatting toolbar, as on the scene's page.
			await toDo(menuPage).locator('.menu-line-words').dblclick();
			await expect(menuPage.getByRole('toolbar', { name: 'Text formatting' })).toBeVisible();
			// Its options, in a drawer, only in edit mode: the same as the
			// scene's column, less turning it back into text.
			await clickWaButton(menuPage, 'Options');
			const options = menuPage.locator('wa-drawer.menu-options-drawer');
			await options.getByRole('button', { name: 'Dungeon board', exact: true }).click();
			await expect(shown.locator('.scene-menu.design-dungeon')).toBeVisible();
			await expect(side.page.locator('.scene-menu.design-dungeon')).toBeVisible();
			await expect(options.getByText('Convert menu to plain text')).toHaveCount(0);
			await menuPage.keyboard.press('Escape');
			await expect(options).toHaveCount(0);

			await clickWaButton(menuPage, 'Done');
			await expect(shown).toHaveAttribute('contenteditable', 'false');
			await expect(menuPage.getByRole('button', { name: 'Options' })).toHaveCount(0);
		} finally {
			await side.close();
		}
	});

	test('is read only for a partner who may only read the scene', async ({ browser }) => {
		const { ada, bo } = await sharedNotebook(browser);
		try {
			const sceneUrl = await startScene(bo.page);
			const menu = await menuWithToDo(bo.page);
			const menuId = defined(await menu.getAttribute('data-menu-id'), 'the menu’s id');

			// Bo started it, so Bo decides who may change it.
			await clickWaButton(bo.page, 'Settings');
			await bo.page.locator('wa-select[name="access"]').click();
			await bo.page.getByRole('option', { name: 'Ada can only read it' }).click();
			await clickWaButton(bo.page, 'Save');
			await expect(bo.page.getByText('Ada can only read this')).toBeVisible();
			await expect(toDo(bo.page)).toBeVisible();

			await ada.page.goto(`${sceneUrl}/menus/${menuId}`);
			await waitForHydration(ada.page);
			await expect(ada.page.locator('.surface .scene-menu')).toBeVisible();
			await expect(ada.page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
			await toDo(ada.page).locator('.menu-line-check').click();
			// Bo's open scene would show a tick live; give it the chance to.
			await settle(ada.page);
			await expect(toDo(bo.page)).not.toHaveClass(/\bchecked\b/);
			await expect(toDo(ada.page)).not.toHaveClass(/\bchecked\b/);
		} finally {
			await ada.close();
			await bo.close();
		}
	});

	test('says so when the menu is not in the scene any more', async ({ browser }) => {
		const side = await newSide(browser, 'Ada');
		try {
			await newAccount(side.page, side.who);
			await side.page.goto('/notebook');
			const sceneUrl = await startScene(side.page);
			await typeRichText(side.page, 'No menus here');
			await expect(side.page.getByText('Saved')).toBeVisible();

			await side.page.goto(`${sceneUrl}/menus/${crypto.randomUUID()}`);
			await expect(side.page.getByText("This menu isn't in the scene any more.")).toBeVisible();
			await side.page.getByRole('link', { name: 'Open the scene' }).click();
			await side.page.waitForURL(sceneUrl);
		} finally {
			await side.close();
		}
	});
});
