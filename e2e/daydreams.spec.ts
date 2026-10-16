import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { sql } from './db';
import { test } from './fixtures';
import {
	account,
	clickWaButton,
	fillRichText,
	fillWaInput,
	reply,
	signUp,
	waitForHydration
} from './helpers';

/**
 * Daydreams, end to end, against the stand-in model provider
 * (`e2e/model-stub.mjs`): it writes "<character> heard: "<what you said>"",
 * ends every passage with a `<meta>` block offering "Slower", "Surprise me"
 * and two suggestions, proposes a roll for a turn containing `[roll]`,
 * checks in after Stop the scene, and fails once for a turn containing
 * `[fail]`.
 */

/** Unique per run: the stub counts takes per conversation for as long as it runs. */
const unique = (text: string) => `${text} ${randomUUID().slice(0, 8)}.`;

/**
 * Waits until the newest passage has been saved, not just shown. A passage is
 * on screen as it streams in, before it is sealed and saved, so a reload or a
 * database read before this would race the save.
 */
async function passageSaved(page: Page) {
	await expect(page.locator('li.streaming')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
}

async function grantDaydreams(email: string) {
	await sql(
		`insert into user_features (id, user_id, feature, source)
		 select ?, id, 'daydreams', 'grant' from user where email = ?`,
		[randomUUID(), email]
	);
}

const dialog = (page: Page) => page.locator('wa-dialog');

/** Makes a new character in the setup's dialog, with a dial and a chip, saved to the library. */
async function newCharacter(page: Page, name: string) {
	await clickWaButton(page, 'Add a character');
	await page.getByRole('menuitem', { name: 'New character' }).click();
	await dialog(page).locator('wa-input[name="name"] input').fill(name);
	await dialog(page).getByRole('button', { name: 'Cold', exact: true }).click();
	await dialog(page).getByRole('button', { name: 'patient', exact: true }).click();
	await expect(dialog(page).getByRole('textbox', { name: /Personality/ })).toHaveValue('patient');
	await dialog(page).getByRole('button', { name: 'Add character' }).click();
	await expect(dialog(page)).toHaveCount(0);
	await expect(page.locator('form.panel').getByText(name, { exact: true })).toBeVisible();
}

async function newScene(page: Page, title: string, premise: string) {
	await clickWaButton(page, 'New scene');
	await dialog(page).locator('wa-input[name="title"] input').fill(title);
	await dialog(page)
		.getByRole('textbox', { name: /What’s going on/ })
		.fill(premise);
	await dialog(page).getByRole('button', { name: 'Use this scene' }).click();
	await expect(dialog(page)).toHaveCount(0);
}

/** From the list to the setup page, through the disclosure the first time. */
async function openSetup(page: Page) {
	await page.goto('/daydreams');
	await waitForHydration(page);
	const understand = page.getByRole('button', { name: 'I understand' });
	const newLink = page.getByRole('link', { name: 'New daydream' });
	await expect(understand.or(newLink)).toBeVisible();
	if (await understand.isVisible()) {
		await clickWaButton(page, 'I understand');
	}
	await newLink.click();
	await page.waitForURL('**/daydreams/new');
	await waitForHydration(page);
}

/** A new daydream with one new character and a new scene, started; answers its id. */
async function startDaydream(page: Page, title = 'Late meeting', character = 'Mara') {
	await openSetup(page);
	await page.locator('form.panel wa-input[name="title"] input').fill(title);
	await newCharacter(page, character);
	await newScene(page, 'After hours', 'The office has emptied out.');
	// Typed key by key rather than filled: a space typed here once went
	// missing, which `fill()` cannot see because it never presses a key.
	const limits = page.locator('form.panel textarea');
	await limits.pressSequentially('Nothing public.', { delay: 10 });
	await expect(limits).toHaveValue('Nothing public.');
	await clickWaButton(page, 'Start daydreaming');
	await page.waitForURL(/\/daydreams\/[0-9a-f-]{36}$/);
	return new URL(page.url()).pathname.split('/').at(-1) ?? '';
}

async function signedUpDreamer(page: Page) {
	const who = account('Dreamer');
	await signUp(page, who);
	await grantDaydreams(who.email);
	return who;
}

/** Opens the menu on the newest passage and picks from it. */
async function passageMenu(page: Page, item: string) {
	await page
		.locator('li.passage')
		.last()
		.getByRole('button', { name: 'More for this passage' })
		.click();
	await page.getByRole('menuitem', { name: item }).click();
}

test.describe('daydreams', () => {
	test('a daydream opens, answers, keeps its story sealed, and branches when a passage is written again', async ({
		page
	}) => {
		await signedUpDreamer(page);
		const id = await startDaydream(page);
		await expect(page.getByRole('heading', { name: 'Late meeting' })).toBeVisible();
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();

		const said = unique('I close the door,');
		await reply(page, said);
		await expect(page.getByText(`Mara heard: "${said}"`)).toBeVisible();
		await passageSaved(page);

		// Stored sealed, as a tree: none of the words, in either direction, is in
		// the database, and each turn follows the one before.
		const { rows } = await sql(
			'select id, parent_id, role, ciphertext from daydream_turns where daydream_id = ? order by position',
			[id]
		);
		expect(rows.map((row) => row.role)).toEqual(['story', 'user', 'story']);
		expect(rows[1]?.parent_id).toBe(rows[0]?.id);
		expect(JSON.stringify(rows)).not.toContain(said);
		expect(JSON.stringify(rows)).not.toContain('Mara');
		const setup = await sql('select ciphertext from daydreams where id = ?', [id]);
		expect(JSON.stringify(setup.rows)).not.toContain('Late meeting');

		// Written again: a second take beside the first, not in its place.
		await passageMenu(page, 'Write again');
		await expect(page.getByText(`Mara heard: "${said}" (take 2)`)).toBeVisible();
		await passageSaved(page);
		await expect(page.locator('li.passage').last()).toContainText('2/2');

		// Back to the first take with the switcher, and still there after a reload.
		await page.getByRole('button', { name: 'Previous version' }).last().click();
		await expect(page.getByText(`Mara heard: "${said}"`, { exact: true })).toBeVisible();
		await expect(page.getByText('(take 2)')).toHaveCount(0);
		await page.reload();
		await waitForHydration(page);
		await expect(page.getByText(`Mara heard: "${said}"`, { exact: true })).toBeVisible();
		await expect(page.locator('li.passage').last()).toContainText('1/2');

		// And to the second through the branch map.
		await clickWaButton(page, 'Branches');
		await page
			.locator('wa-drawer')
			.getByRole('button', { name: /^Mara heard: .*\(take 2\)$/ })
			.click();
		await expect(
			page.locator('ol.turns').getByText(`Mara heard: "${said}" (take 2)`)
		).toBeVisible();

		// Listed, and on the home screen's card.
		await page.goto('/daydreams');
		await expect(page.getByRole('link', { name: /Late meeting/ })).toBeVisible();
		await page.goto('/home');
		await expect(page.getByText('Late meeting')).toBeVisible();
	});

	test('directions, suggestions and stepping out of the story', async ({ page }) => {
		await signedUpDreamer(page);
		await startDaydream(page);
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();
		await passageSaved(page);

		// A direction button is a turn of its own, and the model is told it.
		await clickWaButton(page, 'Slower');
		await expect(page.locator('li.marker')).toContainText('Slower');
		await expect(page.getByText('Mara heard: "(Direction: Slower.)"')).toBeVisible();
		await passageSaved(page);

		// A suggestion, sent with a tap.
		await page
			.locator('.suggestions')
			.getByRole('button', { name: 'I kneel.', exact: true })
			.click();
		await expect(page.getByText('Mara heard: "I kneel."')).toBeVisible();
		await passageSaved(page);

		// A suggestion, put in the composer to change first.
		await page.getByRole('button', { name: 'Change “Tell me what happens next.” first' }).click();
		await expect(page.locator('.richtext-editor .surface').first()).toHaveText(
			'Tell me what happens next.'
		);

		// Out of character, said the usual way, is labelled as such.
		await reply(page, unique('OOC: this is fun,'));
		await expect(page.locator('li.said').last()).toContainText('out of character');
	});

	test('stopping the scene checks in, and carrying on, or easing off, goes on', async ({
		page
	}) => {
		await signedUpDreamer(page);
		await startDaydream(page);
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();
		await passageSaved(page);

		await clickWaButton(page, 'Stop the scene');
		await expect(page.getByText('Are you all right?')).toBeVisible();
		await expect(page.getByText('The scene is stopped')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0);

		await clickWaButton(page, /^Carry on$/);
		await expect(page.getByText('The scene is stopped')).toHaveCount(0);
		await expect(page.getByText(/Mara heard: "\(The user is ready to carry on/)).toBeVisible();
		await passageSaved(page);

		// Ease off turns the intensity down a notch, and says so to the model.
		await clickWaButton(page, 'Ease off');
		await expect(page.getByText(/Mara heard: "\(Ease off/)).toBeVisible();
		await passageSaved(page);
		await clickWaButton(page, 'Dials');
		await expect(page.locator('wa-popover .reading').first()).toHaveText('Gentle');
	});

	test('a roll the story offers is rolled here, and the story goes on from it', async ({
		page
	}) => {
		await signedUpDreamer(page);
		await startDaydream(page);
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();

		await reply(page, unique('I try to keep still [roll],'));
		await expect(page.getByText('Roll to hold still')).toBeVisible();
		await clickWaButton(page, 'Roll a d6');
		await expect(page.locator('li.marker')).toContainText(/Rolled [1-6] — You (?:move|hold still)/);
		await expect(page.getByText(/Mara heard: "\(Roll: the user rolled [1-6]/)).toBeVisible();
	});

	test('reactions, bookmarked quotes and “not this”', async ({ page }) => {
		await signedUpDreamer(page);
		const id = await startDaydream(page);
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();
		await passageSaved(page);

		await page.getByRole('button', { name: 'Loved it' }).click();
		await expect(page.getByRole('button', { name: 'Loved it' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);

		// Select some words of the passage, and keep them.
		await page.evaluate(() => {
			const text = document.querySelector('[data-passage-text]');
			const walker = text && document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
			let node = walker?.nextNode() as Text | null;
			while (node && !node.data.includes('The door')) {
				node = walker?.nextNode() as Text | null;
			}
			if (!node) {
				throw new Error('no passage text');
			}
			const start = node.data.indexOf('The door');
			const range = document.createRange();
			range.setStart(node, start);
			range.setEnd(node, start + 'The door clicks shut'.length);
			document.getSelection()?.removeAllRanges();
			document.getSelection()?.addRange(range);
		});
		await clickWaButton(page, 'Keep this');
		await dialog(page).getByRole('button', { name: 'Save bookmark' }).click();
		await expect(dialog(page)).toHaveCount(0);
		await expect(page.locator('li.passage mark')).toHaveText('The door clicks shut');

		// Both still there after a reload, and the quote listed in the bookmarks.
		await page.reload();
		await waitForHydration(page);
		await expect(page.getByRole('button', { name: 'Loved it' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(page.locator('li.passage mark')).toHaveText('The door clicks shut');
		await clickWaButton(page, 'Bookmarks');
		await expect(page.locator('wa-drawer')).toContainText('The door clicks shut');
		await page.keyboard.press('Escape');

		// "Not this" becomes a limit.
		await page.evaluate(() => {
			const text = document.querySelector('[data-passage-text]');
			const walker = text && document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
			const node = walker?.nextNode() as Text | null;
			if (!node) {
				throw new Error('no passage text');
			}
			const range = document.createRange();
			range.setStart(node, 0);
			range.setEnd(node, 'Mara looks up'.length);
			document.getSelection()?.removeAllRanges();
			document.getSelection()?.addRange(range);
		});
		await clickWaButton(page, 'Not this');
		await dialog(page).getByRole('button', { name: 'Add to my limits' }).click();
		await expect(dialog(page)).toHaveCount(0);
		await page.goto(`/daydreams/${id}/edit`);
		await waitForHydration(page);
		await expect(page.locator('form.panel textarea')).toHaveValue(/Avoid: “Mara looks up”/);
	});

	test('a character made for one daydream is offered in the next, and edits there show as updated', async ({
		page
	}) => {
		await signedUpDreamer(page);
		const first = await startDaydream(page, 'First');
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();

		// Picked from the library for a second daydream.
		await openSetup(page);
		await page.locator('form.panel wa-input[name="title"] input').fill('Second');
		await clickWaButton(page, 'Add a character');
		await page.getByRole('menuitem', { name: 'Mara' }).click();
		await expect(page.locator('form.panel').getByText('Mara', { exact: true })).toBeVisible();
		await newScene(page, 'Elsewhere', 'Somewhere else entirely.');

		// Changed from here, which changes the library's too.
		await clickWaButton(page, 'Edit Mara');
		await dialog(page)
			.getByRole('textbox', { name: /Personality/ })
			.fill('patient, sardonic');
		await dialog(page).getByRole('button', { name: 'Save changes' }).click();
		await expect(dialog(page)).toHaveCount(0);
		await clickWaButton(page, 'Start daydreaming');
		await page.waitForURL(/\/daydreams\/[0-9a-f-]{36}$/);

		// The first daydream's copy is now behind, and can catch up.
		await page.goto(`/daydreams/${first}/edit`);
		await waitForHydration(page);
		await expect(page.getByText('Updated in your library since.')).toBeVisible();
		await clickWaButton(page, 'Use the latest');
		await expect(page.getByText('Updated in your library since.')).toHaveCount(0);
		await expect(page.locator('form.panel')).toContainText('sardonic');

		// And the library page lists it.
		await page.goto('/daydreams/characters');
		await expect(page.getByText('Mara', { exact: true })).toBeVisible();
	});

	test('Surprise me writes a scene to read and change before using it', async ({ page }) => {
		await signedUpDreamer(page);
		await openSetup(page);
		await clickWaButton(page, 'Surprise me');
		await expect(dialog(page).locator('wa-input[name="title"] input')).toHaveValue(
			'The stub surprise'
		);
		await dialog(page).getByRole('button', { name: 'Use this scene' }).click();
		await expect(page.locator('form.panel')).toContainText('The stub surprise');
	});

	test('a story told to you with no characters, and one watched with two, both open', async ({
		page
	}) => {
		await signedUpDreamer(page);

		await openSetup(page);
		await page.locator('form.panel wa-input[name="title"] input').fill('Told');
		await page.getByRole('button', { name: /^A story told to you/ }).click();
		await newScene(page, 'Quiet', 'Nothing has happened yet.');
		await clickWaButton(page, 'Start daydreaming');
		await page.waitForURL(/\/daydreams\/[0-9a-f-]{36}$/);
		await expect(page.getByText('The narrator looks up as you come in.')).toBeVisible();

		await openSetup(page);
		await page.locator('form.panel wa-input[name="title"] input').fill('Watched');
		await page.getByRole('button', { name: /^Watch a story unfold/ }).click();
		await newCharacter(page, 'Ash');
		await newCharacter(page, 'Bel');
		await newScene(page, 'Across the room', 'Two people meet.');
		await clickWaButton(page, 'Start daydreaming');
		await page.waitForURL(/\/daydreams\/[0-9a-f-]{36}$/);
		await expect(page.getByText('Ash looks up as you come in.')).toBeVisible();
	});

	test('a failed reply says so, and trying again answers', async ({ page }) => {
		await signedUpDreamer(page);
		await startDaydream(page);
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();

		// The marker at the end: a turn that starts with `[` is out of character.
		const said = unique('I knock [fail],');
		await reply(page, said);
		await expect(page.getByText('The reply could not be written just now')).toBeVisible();
		// What the user said is kept in the story, not lost with the reply.
		await expect(page.locator('ol.turns li.said')).toContainText(said);

		await clickWaButton(page, 'Try again');
		await expect(page.getByText(`Mara heard: "${said}"`)).toBeVisible();
	});

	test('what is being written survives a reload', async ({ page }) => {
		await signedUpDreamer(page);
		await startDaydream(page);
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();

		await fillRichText(page, 'I was about to say');
		// The draft is sealed before it is stored, which takes a moment.
		await expect
			.poll(() =>
				page.evaluate(() => Object.keys(localStorage).some((key) => key.includes(':daydream:')))
			)
			.toBe(true);
		await page.reload();
		await waitForHydration(page);
		await expect(page.locator('.richtext-editor .surface').first()).toHaveText(
			'I was about to say'
		);
	});

	test('the setup can be changed, and the daydream deleted', async ({ page }) => {
		await signedUpDreamer(page);
		const id = await startDaydream(page, 'First title');
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();

		await page.getByRole('link', { name: 'Setup' }).click();
		await page.waitForURL(`**/daydreams/${id}/edit`);
		await waitForHydration(page);
		await expect(page.locator('wa-input[name="title"] input')).toHaveValue('First title');
		await fillWaInput(page, 'title', 'Second title');
		await clickWaButton(page, 'Save setup');
		await page.waitForURL(`**/daydreams/${id}`);
		await expect(page.getByRole('heading', { name: 'Second title' })).toBeVisible();

		await page.goto(`/daydreams/${id}/edit`);
		await waitForHydration(page);
		page.once('dialog', (confirm) => void confirm.accept());
		await clickWaButton(page, 'Delete daydream');
		await page.waitForURL('**/daydreams');
		await expect(page.getByRole('link', { name: /Second title/ })).toHaveCount(0);
		const { rows } = await sql('select count(*) as n from daydream_turns where daydream_id = ?', [
			id
		]);
		expect(Number(rows[0]?.n)).toBe(0);
	});

	test('an account without the feature has no way in', async ({ page }) => {
		const who = account('Outsider');
		await signUp(page, who);
		await expect(page.getByRole('link', { name: 'Daydreams' })).toHaveCount(0);
		const response = await page.goto('/daydreams');
		expect(response?.status()).toBe(403);
	});
});
