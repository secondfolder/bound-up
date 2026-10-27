import { randomUUID } from 'node:crypto';
import { expect, type Locator, type Page } from '@playwright/test';
import { sql } from './db';
import { test } from './fixtures';
import {
	account,
	clickWaButton,
	expectComposerAtBottom,
	fillRichText,
	fillWaInput,
	grantFeature,
	newAccount,
	reply,
	scrollShellTo,
	settle,
	shellScroll,
	switchOnDebugCookie,
	waitForHydration
} from './helpers';

/**
 * Daydreams, end to end, against the stand-in model provider
 * (`e2e/model-stub.mjs`): it writes "<character> heard: "<what you said>"",
 * ends every passage with a `<meta>` block offering "Slower", "Surprise me"
 * and two suggestions, proposes a roll for a turn containing `[roll]`,
 * checks in after Stop the scene, fails once for a turn containing
 * `[fail]`, writes a turn containing `[write out]` out as
 * "Written out: <the turn>" before answering it, and reads one containing
 * `[direction]` as a direction. It names a daydream "The <idea title> story", and casts anyone
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
 * The setup summary's text as a selection of it reads, which is what a copy
 * of it takes: each blank's words in, its closed menu's items out. Not
 * `innerText`, which breaks the line at every blank's invisible control.
 */
function selectedText(summary: Locator) {
	return summary.evaluate((element) => {
		const range = document.createRange();
		range.selectNodeContents(element);
		const selection = document.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		return selection?.toString() ?? '';
	});
}

/**
 * Makes a new character in the setup's dialog, with a dial and a chip, saved
 * to the library. `picker` is the button that opens the cast menu: "Add a
 * character" for an idea with no parts, "Cast <part>" for one of its parts.
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
	// The card's title, not its Edit button, which also carries the name, as
	// visually hidden text, so the button's accessible name says what it edits.
	await expect(page.locator('form.panel strong').getByText(name, { exact: true })).toBeVisible();
}

/** Makes a new idea in the setup's dialog, with a part for each of `parts`. */
async function newIdea(page: Page, title: string, premise: string, parts: string[] = []) {
	await clickWaButton(page, 'New idea');
	await dialog(page).locator('wa-input[name="title"] input').fill(title);
	await dialog(page)
		.getByRole('textbox', { name: /What’s going on/ })
		.fill(premise);
	for (const [index, part] of parts.entries()) {
		await dialog(page).getByRole('button', { name: 'Add a part' }).click();
		await dialog(page).locator('.part .part-name input').nth(index).fill(part);
	}
	await dialog(page).getByRole('button', { name: 'Use this idea' }).click();
	await expect(dialog(page)).toHaveCount(0);
}

/** Opens one of the setup form's disclosures, closed for a new daydream. */
async function openDisclosure(page: Page, summary: string) {
	await page.locator('form.panel').getByRole('button', { name: summary, exact: true }).click();
}

/** From the list to the new-daydream page's ways in, through the disclosure the first time. */
async function openStart(page: Page) {
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

/** On to the full setup form, empty, through "Build it yourself". */
async function openSetup(page: Page) {
	await openStart(page);
	await clickWaButton(page, 'Build it yourself');
	await expect(page.locator('form.panel')).toBeVisible();
}

/**
 * A new daydream with a new idea and one new character, started; answers
 * its id. It is not named here: the stub names it "The After hours story"
 * after the opening.
 */
async function startDaydream(page: Page, character = 'Mara') {
	await openSetup(page);
	await newIdea(page, 'After hours', 'The office has emptied out.');
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
	await newAccount(page, who);
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
	test('a short story keeps its composer at the bottom of the screen, above the nav', async ({
		page
	}) => {
		await signedUpDreamer(page);
		await startDaydream(page);
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();
		await passageSaved(page);
		await expectComposerAtBottom(page, page.locator('.compose'));
	});

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
		await page.goto('/today');
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

	test('an instruction for the user’s own turn is written out, and what was sent is a press away', async ({
		page
	}) => {
		await signedUpDreamer(page);
		await startDaydream(page);
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();
		await passageSaved(page);

		const instruction = unique('Tell Mara the fox is safe [write out],');
		await reply(page, instruction);
		const said = page.locator('li.said').last();
		await expect(said.locator('.text')).toHaveText(`Written out: ${instruction}`);
		await expect(said).toContainText('written out for you');
		await passageSaved(page);

		await said.getByRole('button', { name: 'Show what you sent' }).click();
		await expect(said.locator('.text')).toHaveText(instruction);
		await said.getByRole('button', { name: 'Show it written out' }).click();
		await expect(said.locator('.text')).toHaveText(`Written out: ${instruction}`);

		// Sealed with the passage, so it is still written out on the next visit.
		await page.reload();
		await waitForHydration(page);
		await expect(page.locator('li.said').last().locator('.text')).toHaveText(
			`Written out: ${instruction}`
		);
	});

	test('words read one way can be read another, which forks the story there', async ({ page }) => {
		await signedUpDreamer(page);
		await startDaydream(page);
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();
		await passageSaved(page);

		// Read as a direction by the model, it is drawn as one, as soon as the
		// reply says so.
		const direction = unique('Make the story super steamy [direction],');
		await reply(page, direction);
		await expect(page.locator('li.marker').last()).toContainText(direction);
		await passageSaved(page);
		await expect(page.locator('li.said')).toHaveCount(0);

		// The stub reads every plain turn as an action: a bubble.
		const steamy = unique('Make the story super steamy,');
		await reply(page, steamy);
		await expect(page.getByText(`Mara heard: "${steamy}"`)).toBeVisible();
		await passageSaved(page);
		await expect(page.locator('li.said').last()).toContainText(steamy);

		await page
			.locator('li.said')
			.last()
			.getByRole('button', { name: 'Read it differently' })
			.click();
		await page.getByRole('menuitem', { name: 'A direction for the story' }).click();

		// Sent exactly as a direction button is, and drawn as one.
		await expect(page.getByText(`Mara heard: "(Direction: ${steamy})"`)).toBeVisible();
		await passageSaved(page);
		const marker = page.locator('li.marker').last();
		await expect(marker).toContainText(steamy);
		await expect(marker).toContainText('read as a direction, as you asked');
		// The first reading's passage is still there, a branch beside this one.
		await expect(page.locator('li.passage').last()).toContainText('2/2');

		// Kept: the next visit still reads it as the user chose.
		await page.reload();
		await waitForHydration(page);
		await expect(page.locator('li.marker').last()).toContainText(
			'read as a direction, as you asked'
		);
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
		// The passage's Markdown is drawn, not shown: the quote below is
		// selected inside the italics, so its offsets skip the hidden `*`.
		await expect(page.locator('li.passage em')).toHaveText('The door clicks shut behind you.');
		await expect(page.locator('[data-passage-text]')).not.toContainText('*');

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
		await expect(
			page.locator('form.panel strong').getByText('Mara', { exact: true })
		).toBeVisible();
		await newIdea(page, 'Elsewhere', 'Somewhere else entirely.');

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
		// The card's title: its Edit button carries the name too, visually hidden.
		await expect(page.locator('li strong').getByText('Mara', { exact: true })).toBeVisible();
	});

	test('Surprise me writes an idea to read and change before using it', async ({ page }) => {
		await signedUpDreamer(page);
		await openSetup(page);
		await clickWaButton(page, 'Surprise me');
		await expect(dialog(page).locator('wa-input[name="title"] input')).toHaveValue(
			'The stub surprise'
		);
		await dialog(page).getByRole('button', { name: 'Use this idea' }).click();
		await expect(page.locator('form.panel')).toContainText('The stub surprise');
	});

	test('a story told to you with no characters, and one watched with two, both open', async ({
		page
	}) => {
		await signedUpDreamer(page);

		// With nobody in it, it is told to you without being asked.
		await openSetup(page);
		await newIdea(page, 'Quiet', 'Nothing has happened yet.');
		await expect(page.locator('fieldset.told')).toContainText('A story told to you');
		await clickWaButton(page, 'Start daydreaming');
		await page.waitForURL(/\/daydreams\/[0-9a-f-]{36}$/);
		await expect(page.getByText('The narrator looks up as you come in.')).toBeVisible();

		await openSetup(page);
		await newCharacter(page, 'Ash');
		await newCharacter(page, 'Bel');
		// Asked last, and only when the guess is not what is wanted.
		await clickWaButton(page, 'Change');
		await page.getByRole('radio', { name: 'Watch a story unfold' }).check();
		await expect(page.locator('.about')).toContainText('You are not in it');
		await newIdea(page, 'Across the room', 'Two people meet.');
		await clickWaButton(page, 'Start daydreaming');
		await page.waitForURL(/\/daydreams\/[0-9a-f-]{36}$/);
		await expect(page.getByText('Ash looks up as you come in.')).toBeVisible();
	});

	test('a ready-made monologue opens with its statement drawn as a standout line', async ({
		page
	}) => {
		await signedUpDreamer(page);
		await openStart(page);
		await clickWaButton(page, 'More ideas');
		await page.getByRole('button', { name: /^Owned/ }).click();
		await expect
			.poll(() => selectedText(page.locator('.setup-summary')))
			.toContain('It’s told as a monologue, one voice speaking its mind.');

		await clickWaButton(page, 'Start daydreaming');
		await page.waitForURL(/\/daydreams\/[0-9a-f-]{36}$/);
		await expect(page.locator('.prose p.standout')).toHaveText('The stub voice says its piece.');
		await expect(page.getByText('And then a little more.')).toBeVisible();
	});

	test('a ready-made daydream starts from its summary, which can be changed or opened up', async ({
		page
	}) => {
		await signedUpDreamer(page);
		await openStart(page);
		// Shuffled, and only a few shown until asked for the rest.
		await clickWaButton(page, 'More ideas');
		await page.getByRole('button', { name: /^After hours/ }).click();
		// Read as rendered: the blanks' menus are in the summary, closed. A
		// ready-made daydream's summary is written with every blank in it.
		const summary = page.locator('.setup-summary');
		const reads = (text: string) => expect.poll(() => selectedText(summary)).toContain(text);
		const whole =
			'Kept late in the empty office after you botched the pitch. Lady Vale, your boss, has a steamy way for you to make it up before the client calls back at nine. It starts from the beginning. It’s told in the characters’ own words, with no narrator.';
		await reads(whole);
		// And copied for real, exactly: the blanks' words used to be left out,
		// as the text of buttons, and then each menu's blank broke the line.
		await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
		await page.keyboard.press('ControlOrMeta+C');
		expect((await page.evaluate(() => navigator.clipboard.readText())).trim()).toBe(whole);

		// A blank is a menu: turned down to SFW here.
		// Pressed by its words, as a person would; the control assistive tech
		// reaches is the button over them, named for what it changes.
		await expect(page.getByRole('button', { name: 'How sexual: steamy' })).toBeAttached();
		await summary.getByText('steamy', { exact: true }).click();
		await page.getByRole('menuitem', { name: 'SFW' }).click();
		await reads('has a SFW way for you to make it up');

		// Every control, with nothing lost, and how it's told last.
		await clickWaButton(page, 'Customise everything');
		await expect(page.locator('form.panel')).toContainText('Lady Vale');
		await expect(page.locator('fieldset.told')).toContainText('Talk with a character');

		await clickWaButton(page, 'Start daydreaming');
		await page.waitForURL(/\/daydreams\/[0-9a-f-]{36}$/);
		await expect(page.getByText('Lady Vale looks up as you come in. (Heat: SFW.)')).toBeVisible();
	});

	test('a daydream described in a sentence is put together, can be tried again, and opens', async ({
		page
	}) => {
		await signedUpDreamer(page);
		await openStart(page);
		await page.getByRole('textbox').fill('a stranger on a night train');
		// The side chosen under "You as" goes with it.
		await page.locator('label.side', { hasText: 'Sub' }).click();
		const asked = page.waitForRequest('**/api/daydreams/suggest');
		await clickWaButton(page, 'Write this daydream');
		expect((await asked).postDataJSON()).toMatchObject({
			task: 'daydream',
			brief: 'a stranger on a night train',
			side: 'sub'
		});
		// The model's summary with its blanks, then how it is told, which it
		// left out, with Vesper by name since the summary already has them.
		const summary = page.locator('.setup-summary');
		await expect
			.poll(() => selectedText(summary))
			.toContain(
				'A stranger on the stub night train. A watchful stranger called Vesper takes the seat across from you, and the journey turns slow-burning.'
			);
		await expect
			.poll(() => selectedText(summary))
			.toContain('It’s told in the characters’ own words, with no narrator.');
		await expect(
			page.getByRole('button', { name: 'a watchful stranger called Vesper' })
		).toBeVisible();

		// The idea keeps what was asked for as typed, and the notes behind it.
		await summary.getByText('A stranger on the stub night train').click();
		await expect(dialog(page).getByLabel('What you asked for')).toHaveValue(
			'a stranger on a night train'
		);
		await expect(dialog(page).getByLabel('Background')).toHaveValue(
			'Stub notes: night trains, and the strangers who share them.'
		);
		await dialog(page).getByRole('button', { name: 'Cancel' }).click();

		await clickWaButton(page, 'Try another');
		// The stub's second draft is its first again, so the summary alone
		// proves nothing has landed; the button's label is back once it has.
		await expect(page.getByRole('button', { name: 'Try another' })).toBeVisible();
		await expect(summary).toContainText('Vesper');

		// Back to the ways in, with what was written still there.
		await clickWaButton(page, 'Other ways to start');
		await expect(page.getByRole('textbox')).toHaveValue('a stranger on a night train');
		await clickWaButton(page, 'Write this daydream');
		await clickWaButton(page, 'Start daydreaming');
		await page.waitForURL(/\/daydreams\/[0-9a-f-]{36}$/);
		await expect(page.getByText('Vesper looks up as you come in.')).toBeVisible();
	});

	test('a brief that wants sayings said is set up as a monologue, sayings and all', async ({
		page
	}) => {
		await signedUpDreamer(page);
		await openStart(page);
		await page.getByRole('textbox').fill('the sayings people into this repeat, built on');
		await clickWaButton(page, 'Write this daydream');
		const summary = page.locator('.setup-summary');
		await expect
			.poll(() => selectedText(summary))
			.toContain(
				'A voice that knows exactly what a stub is for, and tells you so. It’s told as a monologue, one voice speaking its mind.'
			);

		// Its idea is a monologue's: what it says, and the sayings it builds on, up front.
		await page.getByText('A voice that knows exactly what a stub is for').click();
		// The text box, not the field's "Remove Sayings to build on" button.
		const sayings = dialog(page).getByRole('textbox', { name: /^Sayings to build on/ });
		await expect(sayings).toHaveValue('Good stubs say thank you.\nAsking is the point.');
		await dialog(page).getByRole('button', { name: 'Cancel' }).click();

		await clickWaButton(page, 'Start daydreaming');
		await page.waitForURL(/\/daydreams\/[0-9a-f-]{36}$/);
		await expect(page.locator('.prose p.standout')).toHaveText('The stub voice says its piece.');
	});

	test('an idea suggested as a monologue is written out as one', async ({ page }) => {
		await signedUpDreamer(page);
		await openStart(page);
		await page.getByRole('textbox').fill('something to be told');
		await clickWaButton(page, 'Suggest daydreams for this');
		const card = page.locator('.generated .card', { hasText: 'Stub idea for nobody' }).first();
		await expect(card).toContainText('A monologue');

		const asked = page.waitForRequest(
			(request) =>
				request.url().includes('/api/daydreams/suggest') &&
				request.postDataJSON()?.task === 'daydream'
		);
		await card.click();
		expect((await asked).postDataJSON()).toMatchObject({ voice: 'monologue' });
		await expect
			.poll(() => selectedText(page.locator('.setup-summary')))
			.toContain('It’s told as a monologue, one voice speaking its mind.');
	});

	/**
	 * A regression test: a "Try another" answering after the user had gone back
	 * to the start used to land anyway, pulling them into the new draft.
	 */
	test('a draft asked for and then walked away from does not come back', async ({ page }) => {
		await signedUpDreamer(page);
		await openStart(page);
		await page.getByRole('textbox').fill('a stranger on a night train');
		await clickWaButton(page, 'Write this daydream');
		await expect(page.locator('.setup-summary')).toContainText('Vesper');

		// Hold the next draft back until the user has left.
		let release: () => void = () => undefined;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		await page.route('**/api/daydreams/suggest', async (route) => {
			await held;
			await route.continue();
		});
		await clickWaButton(page, 'Try another');
		await expect(page.getByRole('button', { name: 'Writing another…' })).toBeVisible();
		await clickWaButton(page, 'Other ways to start');
		const answered = page.waitForEvent('requestfinished', (request) =>
			request.url().includes('/api/daydreams/suggest')
		);
		release();
		await answered;
		// Until the page has read the answer and acted on it.
		await settle(page);
		await settle(page);

		await expect(page.getByRole('button', { name: 'Write this daydream' })).toBeVisible();
		await expect(page.locator('.setup-summary')).toHaveCount(0);
	});

	test('a draft says how it is going while it is written, and debug mode shows the chat live', async ({
		page
	}) => {
		const who = await signedUpDreamer(page);
		await openStart(page);
		// The stub writes a `[slow]` brief's answer slowly enough to watch.
		await page.getByRole('textbox').fill('a slow night train [slow]');
		await clickWaButton(page, 'Write this daydream');
		const progress = page.locator('.model-progress');
		// Over the box it was asked from, and only there.
		await expect(page.locator('.describe .box .over-box .stage')).toContainText(
			/Writing… \d+ characters/
		);
		await expect(page.locator('.describe .stage')).toHaveCount(1);
		// Without debug mode, how much and never what.
		await expect(progress.locator('wa-details.live')).toHaveCount(0);
		await expect(progress).not.toContainText('Vesper');
		await expect(page.locator('.setup-summary')).toContainText('Vesper');
		await expect(progress).toHaveCount(0);

		await grantFeature(who.email, 'debugMode');
		await switchOnDebugCookie(page);
		await page.reload();
		await waitForHydration(page);
		await page.getByRole('textbox').fill('a slow night train [slow]');
		await clickWaButton(page, 'Write this daydream');
		const live = progress.locator('wa-details.live');
		// The chat goes under the buttons, and how it is going still only on the box.
		await expect(page.locator('.describe .over-box wa-details.live')).toHaveCount(0);
		await expect(page.locator('.describe .stage')).toHaveCount(1);
		// What was sent, then the reasoning and the answer as they come.
		await expect(live).toContainText('a slow night train [slow]');
		await expect(live).toContainText('The stub weighs the brief.');
		await expect(live).toContainText('"voice"');
		await expect(page.locator('.setup-summary')).toContainText('Vesper');
	});

	test('stories like the one described are suggested for your side, and one opens as a daydream', async ({
		page
	}) => {
		await signedUpDreamer(page);
		await openStart(page);
		const readyMade = page.locator('.ready-made > .cards .card');
		await expect(readyMade.first()).toBeVisible();

		await page.locator('label.side', { hasText: 'Sub' }).click();
		await page.getByRole('textbox').fill('something on a train');
		await clickWaButton(page, 'Suggest daydreams for this');

		// The side reached the model. An idea on the other side is the brief's
		// own word on it, so it shows too, saying which side it puts you on.
		// Only the suggested ones show, not the ready-made ones.
		const generated = page.locator('.generated');
		await expect(generated).toContainText('For “something on a train”');
		await expect(generated.locator('.card .title')).toHaveText([
			'Stub idea for the sub',
			'Stub idea for the dom',
			'Stub idea for nobody'
		]);
		await expect(generated.locator('.card', { hasText: 'Stub idea for the dom' })).toContainText(
			'You’re the dom'
		);
		await expect(
			generated.locator('.card', { hasText: 'Stub idea for the sub' })
		).not.toContainText('You’re the');
		await expect(readyMade).toHaveCount(0);

		// More are added after them, told what was already offered.
		await clickWaButton(page, 'More ideas');
		await expect(generated.locator('.card .title')).toHaveText([
			'Stub idea for the sub',
			'Stub idea for the dom',
			'Stub idea for nobody',
			'Stub idea for the sub, again',
			'Stub idea for the dom, again',
			'Stub idea for nobody, again'
		]);

		// Written out from the brief as typed, the idea picked, and the
		// research its round was written with, rather than reading again.
		const writing = page.waitForRequest(
			(request) =>
				request.url().includes('/api/daydreams/suggest') &&
				request.postDataJSON()?.task === 'daydream'
		);
		await generated.getByRole('button', { name: /^Stub idea for the sub A stub/ }).click();
		expect((await writing).postDataJSON()).toMatchObject({
			brief: 'something on a train',
			chosen: { title: 'Stub idea for the sub', premise: 'A stub premise.' },
			research: 'Stub notes on what was asked for.'
		});
		await expect
			.poll(() => selectedText(page.locator('.setup-summary')))
			.toContain('It’s told in the characters’ own words, with no narrator.');

		// Back to the ways in, with the ideas still there, until cleared.
		await clickWaButton(page, 'Other ways to start');
		await expect(generated.locator('.card .title')).toHaveCount(6);
		await clickWaButton(page, /^Clear$/);
		await expect(generated).toHaveCount(0);
		await expect(readyMade.first()).toBeVisible();
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

	test('a passage comes with its picture, kept encrypted and opened again later', async ({
		page
	}) => {
		await signedUpDreamer(page);
		await startDaydream(page);
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();

		// The stub describes a picture only when asked to (`[picture]`).
		const said = unique('[picture] I look at her.');
		await reply(page, said);
		await passageSaved(page);
		const newest = page.locator('li.passage').last();
		await expect(newest.locator('.picture img')).toBeVisible();
		// Stored before the reload: one still being kept would not be there after.
		await expect(newest.locator('.picture[data-kept="kept"]')).toBeAttached();

		// Stored, then opened again from storage after a reload: downloaded
		// and decrypted, since the page no longer has the one it made.
		await page.reload();
		await waitForHydration(page);
		await passageSaved(page);
		await expect(page.locator('li.passage').last().locator('.picture img')).toBeVisible();
		await expect(page.locator('li.passage').last().locator('.picture img')).toHaveJSProperty(
			'complete',
			true
		);
	});

	test('a daydream opens on its newest passage, and follows only a reader at the end', async ({
		page
	}) => {
		// Short, so a few turns overflow it.
		await page.setViewportSize({ width: 400, height: 700 });
		await signedUpDreamer(page);
		await startDaydream(page);
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();
		const long = 'I say something long enough to wrap over several lines of the story, '.repeat(3);
		for (let turn = 0; turn < 4; turn += 1) {
			await reply(page, unique(long));
			await passageSaved(page);
			// Followed as it arrived: polled, because following glides there.
			await expect.poll(async () => (await shellScroll(page)).fromEnd).toBeLessThan(2);
		}

		// Opened on the newest, not part-way down: the earlier turns opening one
		// by one used to leave it wherever the browser's scroll anchoring put it.
		await page.reload();
		await waitForHydration(page);
		await passageSaved(page);
		await expect.poll(async () => (await shellScroll(page)).fromEnd).toBeLessThan(2);

		// A reader who has scrolled up to read is left there as the story goes on.
		await scrollShellTo(page, 100);
		const said = unique('Go on.');
		await reply(page, said);
		await expect(page.getByText(`Mara heard: "${said}"`)).toBeAttached();
		await passageSaved(page);
		expect((await shellScroll(page)).top).toBe(100);
	});

	test('the setup can be changed, and the daydream deleted', async ({ page }) => {
		await signedUpDreamer(page);
		const id = await startDaydream(page);
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();
		// Waited for, so the name is saved before the setup is changed from under it.
		await expect(page.getByRole('heading', { name: 'The After hours story' })).toBeVisible();

		await page.getByRole('link', { name: 'Settings for this daydream' }).click();
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

	test('until it has a name, a daydream goes by its idea’s, and the next visit names it', async ({
		page
	}) => {
		await signedUpDreamer(page);
		// The stub fails a naming request once when the idea's title says `[fail]`.
		const idea = `Quiet ${randomUUID().slice(0, 8)} [fail]`;
		await openSetup(page);
		await newIdea(page, idea, 'Nothing has happened yet.');
		await newCharacter(page, 'Mara');
		await clickWaButton(page, 'Start daydreaming');
		// Waited for before the reload: the idea's title shows from the start,
		// so without this a reload could cut the naming request off before the
		// stub had failed it, and then fail the one after the reload instead.
		const failedNaming = page.waitForResponse(
			(response) => response.url().endsWith('/api/daydreams/suggest') && response.status() === 502
		);
		await page.waitForURL(/\/daydreams\/[0-9a-f-]{36}$/);
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();
		await failedNaming;
		await expect(page.getByRole('heading', { name: idea })).toBeVisible();
		await expect(page.getByText('No suggestions just now')).toHaveCount(0);

		await page.reload();
		await waitForHydration(page);
		await expect(page.getByRole('heading', { name: `The ${idea} story` })).toBeVisible();
	});

	test('a character cast from the library into an idea’s part has that part written for them', async ({
		page
	}) => {
		await signedUpDreamer(page);
		await startDaydream(page);
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();

		await openSetup(page);
		await newIdea(page, 'The interview', 'It goes off script.', ['the interviewer']);
		await clickWaButton(page, 'Cast the interviewer');
		await page.getByRole('menuitem', { name: 'Mara' }).click();
		const row = page.locator('form.panel .part');
		await expect(row).toContainText('the interviewer');
		await expect(row).toContainText('your stub boss · stub-testing you');

		// Only this daydream's: the library's Mara is who she is anywhere.
		await clickWaButton(page, 'Edit Mara');
		await expect(dialog(page).getByText('In this daydream', { exact: true })).toBeVisible();
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
		await expect(dialog(page).getByText('In this daydream', { exact: true })).toHaveCount(0);
	});

	test('debug mode keeps each exchange with the model verbatim, and rebuilds an older passage’s prompt', async ({
		page
	}) => {
		const who = await signedUpDreamer(page);
		// Written before the grant: no raw reply is kept for it.
		await startDaydream(page);
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();
		await passageSaved(page);

		await grantFeature(who.email, 'debugMode');
		await page.reload();
		await waitForHydration(page);
		// Granted but switched off on this device: no raw log on offer.
		await expect(page.locator('wa-switch.raw-log')).toHaveCount(0);
		await page
			.getByRole('navigation', { name: 'Primary' })
			.getByRole('button', { name: 'Debug mode' })
			.click();
		await expect(page.locator('wa-switch.raw-log')).toBeVisible();

		// Written with the grant: its exchange is kept, beside it.
		const said = unique('I close the door,');
		const kept = page.waitForResponse(
			(response) => response.url().endsWith('/exchanges') && response.status() === 201
		);
		await reply(page, said);
		await expect(page.getByText(`Mara heard: "${said}"`)).toBeVisible();
		await passageSaved(page);
		await kept;

		// After a reload, so what is shown is what was kept, not this visit's copy.
		await page.reload();
		await waitForHydration(page);
		await page.locator('wa-switch.raw-log').click();
		const raw = page.locator('li.raw');
		await expect(raw).toHaveCount(3);
		// The opening, from before the grant: nothing kept, so its prompt is rebuilt.
		await expect(raw.first()).toContainText('Raw reply not recorded.');
		await raw.first().getByRole('button', { name: 'Show prompt' }).click();
		await expect(raw.first()).toContainText('# The characters');

		// The reply: the request exactly as sent, the reasoning, and how it ended.
		const exchange = page.locator('li.exchange');
		await expect(exchange).toHaveCount(1);
		await expect(exchange).toContainText('The stub thinks it over.');
		await expect(exchange).toContainText(`Mara heard: "${said}"`);
		// Its heading is the disclosure's `summary`, drawn in its shadow root.
		await expect(exchange.getByText(/How it ended: stopped: stop · .* · via Stub/)).toBeVisible();
		// The request and response exactly as they went, the usage it asked for included.
		await expect(exchange).toContainText('"usage":{"include":true}');
		await expect(exchange).toContainText('"total_tokens":120');
		await expect(raw.last()).not.toContainText('Raw reply not recorded.');
	});

	test('debug mode keeps how a daydream was set up with it: the ideas round, then the draft', async ({
		page
	}) => {
		const who = await signedUpDreamer(page);
		await grantFeature(who.email, 'debugMode');
		await openStart(page);
		await switchOnDebugCookie(page);
		await page.reload();
		await waitForHydration(page);

		await page.getByRole('textbox').fill('something on a train');
		await clickWaButton(page, 'Suggest daydreams for this');
		const generated = page.locator('.generated');
		await expect(generated.locator('.card .title').first()).toBeVisible();
		await generated
			.getByRole('button', { name: /^Stub idea for nobody/ })
			.first()
			.click();
		await expect(page.locator('.setup-summary')).toBeVisible();
		// The draft's chat log, shown here as it was before any of this was kept.
		await expect(page.locator('wa-details.log')).toHaveCount(1);

		await clickWaButton(page, 'Start daydreaming');
		await page.waitForURL(/\/daydreams\/[0-9a-f-]{36}$/);
		await waitForHydration(page);
		await page.locator('wa-switch.raw-log').click();
		const setup = page.locator('[data-setup-exchanges]');
		await expect(setup).toContainText('How this daydream was set up');
		await expect(setup.locator('wa-details.log')).toHaveCount(2);
		await expect(setup).toContainText(/Ideas round[\s\S]*Draft/);
		// The brief as typed, in what was sent.
		await expect(setup).toContainText('something on a train');
		const { rows } = await sql(
			'select count(*) as count from daydream_setup_exchanges where daydream_id = ?',
			[new URL(page.url()).pathname.split('/').at(-1) ?? '']
		);
		expect(Number(rows[0]?.count)).toBe(2);
	});

	test('an idea’s place to start, a spoiler of its own and what it keeps track of all play', async ({
		page
	}) => {
		await signedUpDreamer(page);
		await openSetup(page);
		await clickWaButton(page, 'New idea');
		const idea = dialog(page);
		await idea.locator('wa-input[name="title"] input').fill('Kept');
		await idea.getByRole('textbox', { name: /What’s going on/ }).fill('She keeps you.');
		// A field of its own, made a spoiler.
		await idea.getByRole('button', { name: 'Add a field' }).click();
		await page.getByRole('menuitem', { name: 'Your own…' }).click();
		await idea.getByRole('textbox', { name: 'Name this field' }).fill('Secret');
		await idea.getByRole('textbox', { name: /^Secret/ }).fill('She owns the building.');
		await idea.getByRole('button', { name: 'Spoiler: Secret' }).click();
		// A place to start, and something to keep track of.
		await idea.getByRole('button', { name: 'Add a place to start' }).click();
		await idea.locator('.opening wa-input input').fill('Three weeks in');
		await idea.locator('.opening wa-textarea textarea').fill('The door is locked.');
		await idea.getByRole('button', { name: 'Add something to keep track of' }).click();
		await idea.locator('.tracker wa-input input').first().fill('Submission');
		await idea.locator('.tracker wa-input input').nth(1).fill('10');
		await idea.getByRole('button', { name: 'Use this idea' }).click();
		await expect(idea).toHaveCount(0);
		await newCharacter(page, 'Mara');
		// The spoiler is kept off the setup.
		await expect(page.getByText('She owns the building.')).toHaveCount(0);
		await page.getByRole('combobox', { name: 'Where it starts' }).click();
		await page.getByRole('option', { name: 'Three weeks in' }).click();
		await clickWaButton(page, 'Start daydreaming');
		await page.waitForURL(/\/daydreams\/[0-9a-f-]{36}$/);

		// It opens where it was asked to, and says so.
		await expect(page.getByText('Mara picks it up at: Three weeks in.')).toBeVisible();
		await expect(page.locator('li.passage').first()).toContainText('From “Three weeks in”');
		await passageSaved(page);

		// What it keeps track of, moved by the story and said under the passage.
		const kept = page.getByRole('list', { name: 'What the story keeps track of' });
		await expect(kept).toContainText('Submission');
		await expect(kept).toContainText('10/100');
		await reply(page, unique('[track] I obey.'));
		await expect(kept).toContainText('15/100');
		await expect(page.locator('li.tracker-note')).toContainText('Submission 10 → 15');
		await passageSaved(page);

		// A character's thought, set apart from what is said.
		await reply(page, unique('[thought] Yes.'));
		await expect(page.locator('.thought').last()).toHaveText('The stub keeps this to itself.');
		await passageSaved(page);

		// Started again from the premise: a second beginning, with its own count.
		await page
			.locator('li.passage')
			.first()
			.getByRole('button', { name: 'More for this passage' })
			.click();
		await page.getByRole('menuitem', { name: 'From the premise' }).click();
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();
		await expect(page.locator('li.passage').first()).toContainText('2/2');
		await expect(kept).toContainText('10/100');
	});

	test('an account without the feature has no way in', async ({ page }) => {
		const who = account('Outsider');
		await newAccount(page, who);
		await expect(page.getByRole('link', { name: 'Daydreams' })).toHaveCount(0);
		const response = await page.goto('/daydreams');
		expect(response?.status()).toBe(403);
	});
});
