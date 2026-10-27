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
	await clickWaButton(page, 'New scene');
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
	await bo.page.getByRole('link', { name: 'Notebook' }).click();
	await bo.page.waitForURL(/\/partner\/[0-9a-f-]{36}\/notebook$/);
	return { ada, bo, url: bo.page.url() };
}

test.describe('a solo scene', () => {
	test('offers prompts beside the page, and keeps what was written, sealed', async ({
		browser
	}) => {
		const side = await newSide(browser, 'Ada');
		try {
			await newAccount(side.page, side.who);
			await side.page.goto('/home/notebook');
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
			await side.page.goto('/home/notebook');
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
			await side.page.goto('/home/notebook');
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
			await side.page.goto('/home/notebook');
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
			await side.page.goto('/home/notebook');
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
			await side.page.goto('/home/notebook');
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
			await side.page.goto('/home/notebook');
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
			await side.page.goto('/home/notebook');
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
