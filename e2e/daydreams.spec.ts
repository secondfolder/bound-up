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
 * `[fail]`. It names a daydream "The <scene title> story", and casts anyone
 * as "your stub boss", "stub-testing you".
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

/**
 * Makes a new character in the setup's dialog, with a dial and a chip, saved
 * to the library. `picker` is the button that opens the cast menu: "Add a
 * character" for a scene with no parts, "Cast <part>" for one of its parts.
 */
async function newCharacter(page: Page, name: string, picker = 'Add a character') {
	await clickWaButton(page, picker);
	await page.getByRole('menuitem', { name: 'New character' }).click();
	await dialog(page).locator('wa-input[name="name"] input').fill(name);
	// The dials are under "More detail", closed for a new character.
	await dialog(page).getByRole('button', { name: 'More detail', exact: true }).click();
	await dialog(page).getByRole('button', { name: 'Cold', exact: true }).click();
	await dialog(page).getByRole('button', { name: 'patient', exact: true }).click();
	await expect(dialog(page).getByRole('textbox', { name: /Personality/ })).toHaveValue('patient');
	await dialog(page).getByRole('button', { name: 'Add character' }).click();
	await expect(dialog(page)).toHaveCount(0);
	await expect(page.locator('form.panel').getByText(name, { exact: true })).toBeVisible();
}

/** Makes a new scene in the setup's dialog, with a part for each of `parts`. */
async function newScene(page: Page, title: string, premise: string, parts: string[] = []) {
	await clickWaButton(page, 'New scene');
	await dialog(page).locator('wa-input[name="title"] input').fill(title);
	await dialog(page)
		.getByRole('textbox', { name: /What’s going on/ })
		.fill(premise);
	for (const [index, part] of parts.entries()) {
		await dialog(page).getByRole('button', { name: 'Add a part' }).click();
		await dialog(page).locator('.part .part-name input').nth(index).fill(part);
	}
	await dialog(page).getByRole('button', { name: 'Use this scene' }).click();
	await expect(dialog(page)).toHaveCount(0);
}

/** Opens one of the setup form's disclosures, closed for a new daydream. */
async function openDisclosure(page: Page, summary: string) {
	await page.locator('form.panel').getByRole('button', { name: summary, exact: true }).click();
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

/**
 * A new daydream with a new scene and one new character, started; answers
 * its id. It is not named here: the stub names it "The After hours story"
 * after the opening.
 */
async function startDaydream(page: Page, character = 'Mara') {
	await openSetup(page);
	await newScene(page, 'After hours', 'The office has emptied out.');
	await newCharacter(page, character);
	await openDisclosure(page, 'More options');
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
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();
		// Named by the model once it has opened, never asked of the user.
		await expect(page.getByRole('heading', { name: 'The After hours story' })).toBeVisible();

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
		expect(JSON.stringify(setup.rows)).not.toContain('After hours');

		// Written again: a second take beside the first, not in its place.
		await passageMenu(page, 'Write again');
		await expect(page.getByText(`Mara heard: "${said}" (take 2)`)).toBeVisible();
		await passageSaved(page);
		await expect(page.locator('li.passage').last()).toContainText('2/2');

		// Back to the first take with the switcher, and still there after a reload.
		// The switch shows at once and is saved after, so the reload waits for
		// the save: one that went first came back on take 2 under load.
		const moved = page.waitForResponse(
			(response) => response.url().endsWith(`/api/daydreams/${id}/active`) && response.ok()
		);
		await page.getByRole('button', { name: 'Previous version' }).last().click();
		await moved;
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
		await expect(page.getByRole('link', { name: /The After hours story/ })).toBeVisible();
		await page.goto('/home');
		await expect(page.getByText('The After hours story')).toBeVisible();
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

		await clickWaButton(page, /^Stop$/);
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
		const first = await startDaydream(page);
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();

		// Picked from the library for a second daydream.
		await openSetup(page);
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
		await page.getByRole('button', { name: /^A story told to you/ }).click();
		await newScene(page, 'Quiet', 'Nothing has happened yet.');
		await clickWaButton(page, 'Start daydreaming');
		await page.waitForURL(/\/daydreams\/[0-9a-f-]{36}$/);
		await expect(page.getByText('The narrator looks up as you come in.')).toBeVisible();

		await openSetup(page);
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
		const id = await startDaydream(page);
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();
		// Waited for, so the name is saved before the setup is changed from under it.
		await expect(page.getByRole('heading', { name: 'The After hours story' })).toBeVisible();

		await page.getByRole('link', { name: 'Setup' }).click();
		await page.waitForURL(`**/daydreams/${id}/edit`);
		await waitForHydration(page);
		await expect(page.locator('wa-input[name="title"] input')).toHaveValue('The After hours story');
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

	test('until it has a name, a daydream goes by its scene’s, and the next visit names it', async ({
		page
	}) => {
		await signedUpDreamer(page);
		// The stub fails a naming request once when the scene's title says `[fail]`.
		const scene = `Quiet ${randomUUID().slice(0, 8)} [fail]`;
		await openSetup(page);
		await newScene(page, scene, 'Nothing has happened yet.');
		await newCharacter(page, 'Mara');
		await clickWaButton(page, 'Start daydreaming');
		// Waited for before the reload: the scene's title shows from the start,
		// so without this a reload could cut the naming request off before the
		// stub had failed it, and then fail the one after the reload instead.
		const failedNaming = page.waitForResponse(
			(response) => response.url().endsWith('/api/daydreams/suggest') && response.status() === 502
		);
		await page.waitForURL(/\/daydreams\/[0-9a-f-]{36}$/);
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();
		await failedNaming;
		await expect(page.getByRole('heading', { name: scene })).toBeVisible();
		await expect(page.getByText('No suggestions just now')).toHaveCount(0);

		await page.reload();
		await waitForHydration(page);
		await expect(page.getByRole('heading', { name: `The ${scene} story` })).toBeVisible();
	});

	test('a character cast from the library into a scene’s part has that part written for them', async ({
		page
	}) => {
		await signedUpDreamer(page);
		await startDaydream(page);
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();

		await openSetup(page);
		await newScene(page, 'The interview', 'It goes off script.', ['the interviewer']);
		await clickWaButton(page, 'Cast the interviewer');
		await page.getByRole('menuitem', { name: 'Mara' }).click();
		const row = page.locator('form.panel .part');
		await expect(row).toContainText('the interviewer');
		await expect(row).toContainText('your stub boss · stub-testing you');

		// Only this daydream's: the library's Mara is who she is anywhere.
		await clickWaButton(page, 'Edit Mara');
		await expect(dialog(page).getByText('In this story', { exact: true })).toBeVisible();
		await expect(dialog(page).getByRole('textbox', { name: /Who they are to you/ })).toHaveValue(
			'your stub boss'
		);
		await dialog(page).getByRole('button', { name: 'Cancel' }).click();
		await expect(dialog(page)).toHaveCount(0);

		await clickWaButton(page, 'Start daydreaming');
		await page.waitForURL(/\/daydreams\/[0-9a-f-]{36}$/);
		// The prompt introduces her by her part; the stub still knows her name.
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();

		await page.goto('/daydreams/characters');
		await clickWaButton(page, 'Edit Mara');
		await expect(dialog(page).getByText('In this story', { exact: true })).toHaveCount(0);
	});

	test('an account without the feature has no way in', async ({ page }) => {
		const who = account('Outsider');
		await signUp(page, who);
		await expect(page.getByRole('link', { name: 'Daydreams' })).toHaveCount(0);
		const response = await page.goto('/daydreams');
		expect(response?.status()).toBe(403);
	});
});
