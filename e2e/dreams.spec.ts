import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { sql } from './db';
import { test } from './fixtures';
import {
	account,
	clickWaButton,
	grantFeature,
	newAccount,
	settle,
	waitForHydration
} from './helpers';

/**
 * The new daydream engine, end to end (docs/dreams.md), against the
 * stand-in model provider (`e2e/model-stub.mjs`): step 1 offers three
 * directions and, for a brief containing `[ask]`, asks "Who is in charge?";
 * the build is "The Keeper" with Ottilie Brandt, opening on "You came," and
 * a `<more>` brass key, adding The Warden in its footer; a passage answers
 * "You say "…", and Ottilie smiles."; another take starts "Again,
 * differently:".
 */

/**
 * The stub's one provider, checked and passing full adult support: the
 * engine sends nothing to a provider that has not (docs/dreams.md,
 * "Adult-friendly providers").
 */
async function stubProviderPasses() {
	await sql(
		`insert into model_providers (id, model, provider, kind, level_passed, checked_at)
		 values (?, 'e2e/stub', 'stub/fp8', 'language', 4, ?)
		 on conflict (model, provider, kind) do update set level_passed = 4, override = 'auto',
		   refusal_backoff_until = null, error_backoff_until = null`,
		[randomUUID(), Date.now()]
	);
}

async function dreamer(page: Page) {
	await stubProviderPasses();
	const who = account('Dreamer');
	await newAccount(page, who);
	await grantFeature(who.email, 'dreams');
	await page.goto('/dreams');
	await waitForHydration(page);
	await clickWaButton(page, 'I understand');
	await expect(page.getByRole('heading', { name: 'New daydream' })).toBeVisible();
	return who;
}

const box = (page: Page, label: string) => page.getByRole('textbox', { name: label });

async function start(page: Page, brief: string): Promise<string> {
	await box(page, 'What do you feel like?').fill(brief);
	await clickWaButton(page, 'Start');
	await page.waitForURL(/\/dreams\/[0-9a-f-]{36}$/);
	await waitForHydration(page);
	return new URL(page.url()).pathname.split('/').at(-1) ?? '';
}

/**
 * The summary of what was made, then Start: a daydream is shown before it is
 * played (docs/dreams.md, "The setup page").
 */
async function play(page: Page, title = 'The Keeper') {
	const ready = page.getByRole('region', { name: title });
	await expect(ready).toBeVisible();
	await ready.getByRole('button', { name: 'Start', exact: true }).click();
	await expect(page.locator('ol.turns')).toBeVisible();
}

/** Writes a turn in the user's own words: opens the box, fills it and sends it. */
async function reply(page: Page, text: string) {
	await page.getByRole('button', { name: 'Write response…' }).click();
	await box(page, 'Your turn').fill(text);
	await clickWaButton(page, 'Send');
}

/** Chooses from the menu at the end of the newest passage. */
async function passageMenu(page: Page, item: string) {
	const passage = page.locator('li.passage').last();
	await passage.getByRole('button', { name: 'More for this passage' }).click();
	await passage.getByRole('menuitem', { name: item }).click();
}

/** The reading options sheet, opened from the player's ⋯. */
async function readingOptions(page: Page) {
	await page
		.getByRole('region', { name: 'Reading aloud' })
		.getByRole('button', { name: 'Reading options' })
		.click();
	const sheet = page.locator('wa-dialog[open]');
	await expect(sheet.locator('.reading-options')).toBeVisible();
	return sheet;
}

async function closeReadingOptions(page: Page) {
	await page.keyboard.press('Escape');
	await expect(page.locator('wa-dialog[open]')).toHaveCount(0);
}

/** Turns a reading option on or off, in its sheet. */
async function toggleReadingOption(page: Page, name: string) {
	const sheet = await readingOptions(page);
	await sheet.getByRole('button', { name: new RegExp(name) }).click();
	await closeReadingOptions(page);
}

/** Whether a reading option is on, as its sheet says. */
async function expectReadingOption(page: Page, name: string, on: boolean) {
	const sheet = await readingOptions(page);
	await expect(sheet.getByRole('button', { name: new RegExp(name) })).toHaveAttribute(
		'aria-pressed',
		String(on)
	);
	await closeReadingOptions(page);
}

/** Waits for the newest passage to be saved, not just shown. */
async function saved(page: Page) {
	await expect(page.locator('li.passage[aria-busy]')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
}

test.describe('daydreams, the new engine', () => {
	test('a brief is read, asks its question, is built and opens, all sealed', async ({ page }) => {
		await dreamer(page);

		// A limit, kept with the user's preferences, and shown as kept in mind.
		await page.getByRole('link', { name: 'What I keep in mind' }).click();
		await waitForHydration(page);
		await box(page, 'Add a preference').fill('Nothing about feet');
		await box(page, 'Only for (optional)').fill('any story');
		await clickWaButton(page, 'Add');
		await expect(page.getByRole('region', { name: 'Never' })).toContainText('Nothing about feet');
		// Added, the form is empty again for the next.
		await expect(box(page, 'Add a preference')).toHaveValue('');
		await expect(box(page, 'Only for (optional)')).toHaveValue('');
		await page.goto('/dreams');
		await waitForHydration(page);

		const id = await start(page, 'A quiet evening [ask]');
		await expect(page.getByRole('heading', { name: 'Who is in charge?' })).toBeVisible();
		await page.getByRole('button', { name: "What I'm keeping in mind" }).click();
		await expect(page.getByText('Never: Nothing about feet')).toBeVisible();
		await clickWaButton(page, 'They are');

		await play(page);
		await expect(page.locator('ol.turns')).toContainText('"You came,"');
		await saved(page);

		// Sealed: nothing the model or the user wrote is in the database.
		const turns = await sql('select role, ciphertext from dream_turns where dream_id = ?', [id]);
		expect(turns.rows.map((row) => row.role)).toEqual(['model']);
		const setup = await sql('select ciphertext from dreams where id = ?', [id]);
		const stored = JSON.stringify([turns.rows, setup.rows]);
		for (const words of ['Ottilie', 'Keeper', 'quiet evening', 'feet']) {
			expect(stored).not.toContain(words);
		}
		const limits = await sql('select ciphertext from dream_preferences');
		expect(JSON.stringify(limits.rows)).not.toContain('feet');

		// A name opens its card; what it keeps hidden is a spoiler to open.
		await page.locator('ol.turns').getByRole('button', { name: 'Ottilie', exact: true }).click();
		await expect(page.getByText('Precise, amused.')).toBeVisible();
		await page.getByText('Behind the scenes').click();
		await expect(page.getByText('She has been waiting for you.')).toBeVisible();
		await page.keyboard.press('Escape');

		// A <more> expands once, in place.
		await page.getByRole('button', { name: 'Read more: a brass key' }).click();
		await expect(page.getByText('It is warm from her hand')).toBeVisible();
	});

	test('a turn, another take, moving between versions, and a card filled on tap', async ({
		page
	}) => {
		await dreamer(page);
		const id = await start(page, 'A quiet evening');
		await play(page);
		await saved(page);

		await reply(page, 'I light the lamp');
		await expect(page.getByText('You say "I light the lamp", and Ottilie smiles.')).toBeVisible();
		await saved(page);

		// Another take is a version beside it, not in its place.
		await passageMenu(page, 'Another take');
		await expect(page.getByText(/^Again, differently:/)).toBeVisible();
		await saved(page);
		await expect(page.locator('li.passage').last()).toContainText('2 / 2');

		const moved = page.waitForResponse(
			(response) => response.url().endsWith(`/api/dreams/${id}/active`) && response.ok()
		);
		await page.getByRole('button', { name: 'Previous version' }).click();
		await moved;
		await expect(page.locator('li.passage').last()).toContainText('1 / 2');
		await page.reload();
		await waitForHydration(page);
		await expect(page.locator('li.passage').last()).toContainText('1 / 2');
		await expect(page.getByText(/^Again, differently:/)).toHaveCount(0);

		// The Warden came from a footer as a name and a seed; his card is filled on tap.
		await page.getByText('How this daydream was set up').click();
		await clickWaButton(page, 'The Warden');
		await expect(page.getByText('Grey coat, ink on his fingers.')).toBeVisible();
	});

	test('a contract’s fields and a choice arrive as the next turn, and stay as they were sent', async ({
		page
	}) => {
		await dreamer(page);
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);

		await reply(page, '[contract]');
		const contract = page.getByRole('region', { name: 'Terms' });
		await expect(contract).toBeVisible();
		await saved(page);

		await page.getByRole('button', { name: 'Change: the pen, now blue ink' }).click();
		await expect(page.getByRole('button', { name: 'Change: the pen, now red ink' })).toBeVisible();
		const initial = contract.getByRole('button', { name: 'Initial: You will kneel when I enter.' });
		await initial.click();
		await expect(initial).toHaveAttribute('aria-pressed', 'true');

		// Half filled in, and still there after a reload.
		await page.reload();
		await waitForHydration(page);
		await expect(
			page.getByRole('button', { name: 'Initial: You will kneel when I enter.' })
		).toHaveAttribute('aria-pressed', 'true');

		await clickWaButton(page, 'Sign and return');
		await expect(page.getByText(/^Ottilie reads it\./)).toContainText(
			'c1: "initialled"; sig: skipped'
		);
		await expect(page.getByText(/^Ottilie reads it\./)).toContainText('pen = "red ink"');
		await saved(page);
		// The contract now shows what was sent, and takes no more.
		await expect(
			page.getByRole('button', { name: 'Initial: You will kneel when I enter.' })
		).toBeDisabled();
	});

	test('a different direction changes what happens, and offers the rest as chips', async ({
		page
	}) => {
		await dreamer(page);
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);
		await reply(page, 'I wait');
		await expect(page.getByText(/and Ottilie smiles/)).toBeVisible();
		await saved(page);

		await passageMenu(page, 'Different direction');
		await expect(page.getByText(/^Instead: /)).toBeVisible();
		await saved(page);
		await expect(page.locator('li.passage').last()).toContainText('2 / 2');
		const chips = page.getByRole('group', { name: 'Or steer it' });
		await expect(chips.getByRole('button')).toHaveCount(2);
		// From the wa-button itself: the inner button's own text is empty (the
		// label is slotted), which left only "Instead: " to look for, and that
		// matched the passage before this one too while this one was written.
		const chip = (await chips.locator('wa-button').first().textContent())?.trim() ?? '';
		expect(chip).not.toBe('');
		await chips.getByRole('button').first().click();
		await expect(page.getByText(`Instead: ${chip}`)).toBeVisible();
		await saved(page);
		await expect(page.locator('li.passage').last()).toContainText('3 / 3');
	});

	test('what was made is shown before it is played, and can be gone back to', async ({ page }) => {
		await dreamer(page);
		await start(page, 'A quiet evening');
		const ready = page.getByRole('region', { name: 'The Keeper' });
		await expect(ready).toBeVisible();
		// Every step done, each with what came of it, and nothing played yet.
		const steps = page.locator('ol.steps > li');
		// One step for each thing really done: analysing, picking, building.
		await expect(steps).toHaveCount(3);
		await expect(page.locator('ol.steps > li[data-status="done"]')).toHaveCount(3);
		await expect(page.locator('li[data-step="pick"]')).toContainText('Picked:');
		await expect(ready).toContainText('Ottilie');
		await expect(page.locator('ol.turns')).toHaveCount(0);
		// On a narrow phone an element's line wraps inside its row rather than
		// running out of it (Web Awesome keeps a native button to one line).
		await page.setViewportSize({ width: 320, height: 800 });
		const rows = ready.locator('button.person');
		await expect(rows.first()).toBeVisible();
		const overflowing = await rows.evaluateAll(
			(buttons) => buttons.filter((button) => button.scrollWidth > button.clientWidth + 1).length
		);
		expect(overflowing).toBe(0);

		// In the list it is a draft until it is started.
		const dreamUrl = page.url();
		await page.goto('/dreams');
		await waitForHydration(page);
		await expect(page.locator('ul.dreams li.draft')).toContainText('Draft, still being set up');
		await page.goto(dreamUrl);
		await waitForHydration(page);

		// Still waiting on Start after a reload.
		await page.reload();
		await waitForHydration(page);
		await expect(page.getByRole('region', { name: 'The Keeper' })).toBeVisible();
		await play(page);
		await saved(page);

		// The setup can be gone back to from the story, and left again.
		await page.getByRole('button', { name: 'How it was set up' }).click();
		await expect(page.getByRole('heading', { name: 'How it was set up' })).toBeVisible();
		await expect(page.locator('li[data-step="pick"]')).toContainText('Picked:');
		await clickWaButton(page, 'Back to the story');
		await expect(page.locator('ol.turns')).toContainText('"You came,"');

		// Started, it is listed with how much there is to it.
		await page.goto('/dreams');
		await waitForHydration(page);
		await expect(page.locator('ul.dreams li.draft')).toHaveCount(0);
		await expect(page.locator('ul.dreams li').first()).toContainText('1 passage');
	});

	test('the turn: suggestions in the page, held to change first, Continue, and your own', async ({
		page
	}) => {
		await dreamer(page);
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);

		// The suggestions, centred after the story; Continue and writing your own float.
		const chips = page.getByRole('list', { name: 'Suggestions' });
		await expect(chips.getByRole('button')).toHaveText([
			'I take the key.',
			'I leave it in her hand.'
		]);
		await expect(chips).toHaveCSS('justify-content', 'center');
		const dock = page.locator('.dock');
		await expect(dock.getByRole('button', { name: 'Continue daydream' })).toBeVisible();
		await expect(dock.getByRole('button', { name: 'Write response…' })).toBeVisible();

		// Held rather than tapped, a suggestion goes into the box to change first,
		// focused, and is not sent.
		const turn = box(page, 'Your turn');
		const leave = chips.getByRole('button', { name: 'I leave it in her hand.' });
		const at = await leave.boundingBox();
		if (!at) {
			throw new Error('The suggestion has no box to hold');
		}
		await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
		// Still held when the box opens: the hold, not letting go, is what opens it.
		await page.mouse.down();
		await expect(turn).toBeVisible();
		await page.mouse.up();
		await expect(turn).toHaveValue('I leave it in her hand.');
		await expect(turn).toBeFocused();
		await expect(chips).toHaveCount(0);
		await expect(page.locator('li.you')).toHaveCount(0);
		await clickWaButton(page, 'Cancel');
		// Its menu does the same: a right click, a long press on Android.
		await chips.getByRole('button', { name: 'I take the key.', exact: true }).click({
			button: 'right'
		});
		await expect(turn).toHaveValue('I take the key.');
		await clickWaButton(page, 'Cancel');

		// Put away, what the box holds is kept for when it is opened again.
		const write = dock.getByRole('button', { name: 'Write response…' });
		await write.click();
		await expect(turn).toHaveValue('I take the key.');
		await expect(turn).toBeFocused();
		await turn.fill('I pocket it');
		await clickWaButton(page, 'Cancel');
		await expect(turn).toBeHidden();

		// A suggestion is sent with a tap.
		await chips.getByRole('button', { name: 'I take the key.', exact: true }).click();
		await expect(page.getByText('You say "I take the key.", and Ottilie smiles.')).toBeVisible();
		await saved(page);
		// Only the newest passage offers any.
		await expect(page.getByRole('button', { name: 'I take the key.', exact: true })).toHaveCount(0);

		// The draft is still there to send, and the box is empty once it is sent.
		await page.getByRole('button', { name: 'Write response…' }).click();
		await expect(turn).toHaveValue('I pocket it');
		await clickWaButton(page, 'Send');
		await expect(turn).toBeHidden();
		await saved(page);
		await page.getByRole('button', { name: 'Write response…' }).click();
		await expect(turn).toHaveValue('');
	});

	test('Enter sends what a box holds, and Shift+Enter is a new line', async ({ page }) => {
		await dreamer(page);
		// The brief: Enter starts it.
		await box(page, 'What do you feel like?').fill('A quiet evening');
		await box(page, 'What do you feel like?').press('Enter');
		await page.waitForURL(/\/dreams\/[0-9a-f-]{36}$/);
		await waitForHydration(page);
		await play(page);
		await saved(page);

		// Your turn: a new line with Shift, sent with Enter.
		await page.getByRole('button', { name: 'Write response…' }).click();
		const turn = box(page, 'Your turn');
		await turn.fill('I wait');
		await turn.press('Shift+Enter');
		await turn.pressSequentially('and watch');
		await expect(turn).toHaveValue('I wait\nand watch');
		await turn.press('Enter');
		await expect(turn).toBeHidden();
		await expect(page.locator('li.you').last()).toContainText('and watch');
		await saved(page);

		// A passage being edited is paragraphs: Enter is a new one, not Keep my version.
		await passageMenu(page, 'Edit');
		const edit = box(page, 'The passage');
		await edit.press('End');
		await edit.press('Enter');
		await expect(edit).toBeVisible();
		await expect(edit).toHaveValue(/\n$/);
	});

	test('the turn floats over the story, says how many suggestions wait below, and fits its labels', async ({
		page
	}) => {
		await page.setViewportSize({ width: 390, height: 480 });
		await dreamer(page);
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);
		const dock = page.locator('.dock');
		const main = page.locator('main');
		const yourTurn = dock.getByRole('button', { name: 'Your turn: 2 suggestions below' });
		const suggestions = page.getByRole('list', { name: 'Suggestions' });

		// No background of its own: only what is in it is drawn.
		await expect(dock).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
		// Scrolled up, the suggestions are out of sight, and Your turn says so.
		await main.evaluate((element) => element.scrollTo(0, 0));
		await expect(suggestions).not.toBeInViewport();
		await expect(yourTurn).toBeInViewport();
		await expect(yourTurn).toContainText('2');
		// Hovered, it stays solid over the story: the tint goes over its own background.
		await yourTurn.hover();
		await expect(yourTurn).not.toHaveCSS('background-color', /rgba\(.*, 0\.\d+\)|transparent/);
		await expect(yourTurn).toHaveCSS('background-image', /gradient/);
		await expect(dock.getByRole('button', { name: 'Continue daydream' })).toBeInViewport();
		// To the right of Continue and Write.
		const writeBox = await dock.getByRole('button', { name: 'Write response…' }).boundingBox();
		const turnBox = await yourTurn.boundingBox();
		expect(turnBox?.x ?? 0).toBeGreaterThan(writeBox?.x ?? 0);
		// It takes you to them, and goes once they are in sight.
		await yourTurn.click();
		await expect(suggestions).toBeInViewport();
		await expect(yourTurn).toHaveCount(0);

		// Labels step down as the room runs out, full, then short, then the icon
		// alone, never back up as it narrows, and the button stays on the screen.
		const continueButton = dock.getByRole('button', { name: 'Continue daydream' });
		const labelShown = () =>
			continueButton.evaluate((button) => {
				const shown = (name: string) =>
					getComputedStyle(button.querySelector(name) ?? button).display !== 'none';
				if (shown('.long')) {
					return 0;
				}
				return shown('.short') ? 1 : 2;
			});
		// From the top, so Your turn stays in the row throughout: the suggestions
		// coming into sight as the page reflows would take it away, and give the
		// rest its room back.
		await main.evaluate((element) => element.scrollTo(0, 0));
		await expect(yourTurn).toBeVisible();
		const seen: number[] = [];
		for (let width = 800; width >= 160; width -= 20) {
			await page.setViewportSize({ width, height: 480 });
			await settle(page);
			seen.push(await labelShown());
			await expect(continueButton).toBeInViewport({ ratio: 1 });
		}
		expect(seen).toEqual([...seen].sort((a, b) => a - b));
		expect(seen).toContain(1);
		expect(seen).toContain(2);
		// With the room Your turn took, at the end of the page, every label is in full.
		await page.setViewportSize({ width: 800, height: 480 });
		await main.evaluate((element) => element.scrollTo(0, element.scrollHeight));
		await expect(yourTurn).toHaveCount(0);
		await expect(continueButton.locator('.long')).toBeVisible();

		// Writing, the box is never more than half the screen.
		await page.setViewportSize({ width: 320, height: 300 });
		await dock.getByRole('button', { name: 'Write response…' }).click();
		await expect(box(page, 'Your turn')).toBeVisible();
		await expect
			.poll(() => dock.evaluate((element) => element.getBoundingClientRect().height))
			.toBeLessThanOrEqual(150);
	});

	test('a turn is drawn as it was read, written out for you, and can be read differently', async ({
		page
	}) => {
		await dreamer(page);
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);

		// An instruction for the user's own turn is written out for them.
		await reply(page, 'Tell her I am staying');
		await saved(page);
		const turn = page.locator('li.you').last();
		await expect(turn).toContainText('"I am staying," I tell her.');
		await expect(turn).toContainText('Written out for you');
		await turn.getByRole('button', { name: 'Show what you sent' }).click();
		await expect(turn).toContainText('Tell her I am staying');
		// The tags are never drawn in the passage.
		await expect(page.locator('li.passage').last()).not.toContainText('I tell her');

		// Read differently: a version beside it, the reading kept and shown.
		await turn.getByRole('button', { name: 'Read it differently' }).click();
		await turn.getByRole('menuitem', { name: 'A direction for the story' }).click();
		await saved(page);
		await expect(page.locator('li.passage').last()).toContainText('2 / 2');
		await expect(turn).toContainText('A direction for the story');
		await expect(turn).toContainText('as you asked');
	});

	test('an element changed before Start is followed through with Update', async ({ page }) => {
		await dreamer(page);
		await start(page, 'A quiet evening');
		const ready = page.getByRole('region', { name: 'The Keeper' });
		await expect(ready).toBeVisible();

		// Every element opens its card, and its card can be changed.
		await ready.getByRole('button', { name: /Ottilie/ }).click();
		const card = page.locator('wa-dialog[open]');
		await card.locator('wa-button', { hasText: 'Change' }).click();
		await card.locator('wa-textarea[name="fields[1].text"] textarea').fill('Warm, then cold.');
		await card.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(card.getByText('Warm, then cold.')).toBeVisible();
		await page.keyboard.press('Escape');

		// A change can be undone, and made again.
		await expect(ready).toContainText('Changed by hand');
		await ready.getByRole('button', { name: /^Undo/ }).click();
		await expect(ready).not.toContainText('Changed by hand');
		await ready.getByRole('button', { name: 'Start', exact: true }).waitFor();
		await ready.getByRole('button', { name: /Ottilie/ }).click();
		await card.locator('wa-button', { hasText: 'Change' }).click();
		await card.locator('wa-textarea[name="fields[1].text"] textarea').fill('Warm, then cold.');
		await card.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(card.getByText('Warm, then cold.')).toBeVisible();
		await page.keyboard.press('Escape');

		// Start waits until the change is followed through the rest.
		await expect(ready).toContainText('Changed by hand');
		await expect(ready.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0);
		await ready.getByRole('button', { name: 'Update', exact: true }).click();
		await play(page, 'The Keeper (changed)');
	});

	test('the writing style is chosen before Start, kept through Update, and changed by the story', async ({
		page
	}) => {
		await dreamer(page);
		await start(page, 'A quiet evening');
		const ready = page.getByRole('region', { name: 'The Keeper' });
		await expect(ready.locator('wa-button', { hasText: 'Lush and slow' })).toBeVisible();

		// A style chosen by hand is a change, and can be undone.
		await ready.locator('wa-button', { hasText: 'Lush and slow' }).click();
		await ready.getByRole('menuitemcheckbox', { name: /Cold and clipped/ }).click();
		await expect(ready).toContainText('The writing style is now Cold and clipped');
		await ready.getByRole('button', { name: /^Undo/ }).click();
		await expect(ready).not.toContainText('Changed by hand');
		await expect(ready.locator('wa-button', { hasText: 'Lush and slow' })).toBeVisible();

		// Chosen again and followed through, the rebuild keeps it.
		await ready.locator('wa-button', { hasText: 'Lush and slow' }).click();
		await ready.getByRole('menuitemcheckbox', { name: /Cold and clipped/ }).click();
		await ready.getByRole('button', { name: 'Update', exact: true }).click();
		const rebuilt = page.getByRole('region', { name: 'The Keeper (changed)' });
		await expect(rebuilt.locator('wa-button', { hasText: 'Cold and clipped' })).toBeVisible();
		await play(page, 'The Keeper (changed)');
		await saved(page);

		// Every passage is asked for in it; the story can change it, and that can be undone.
		await reply(page, '[style]');
		await saved(page);
		await expect(page.locator('li.passage').last()).toContainText('Written as: Write tersely');
		const notice = page.locator('.notice', { hasText: 'The story changed how it is written' });
		await expect(notice).toContainText('Dark and heavy');
		await notice.getByRole('button', { name: 'Undo' }).click();
		await expect(notice).toHaveCount(0);
		await page.getByRole('button', { name: 'Reading settings' }).click();
		await expect(page.getByRole('menuitemcheckbox', { name: 'Cold and clipped' })).toHaveAttribute(
			'aria-checked',
			'true'
		);

		// Chosen from the reading settings, it applies from the next passage.
		await page.getByRole('menuitemcheckbox', { name: 'Raw and filthy' }).click();
		await saved(page);
		await reply(page, '[style] again');
		await saved(page);
		await expect(page.locator('li.passage').last()).toContainText(
			'Written as: Write like two people sexting'
		);
	});

	test('pulling the story up past its end, and letting go, is Continue', async ({ page }) => {
		await dreamer(page);
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);

		// A touch dragged up from the end of the page, as a finger would.
		const touch = (type: string, y: number) =>
			page.evaluate(
				([kind, at]) => {
					const area = document.querySelector('main') as HTMLElement;
					area.scrollTop = area.scrollHeight;
					const point = new Touch({ identifier: 1, target: area, clientX: 100, clientY: at });
					const touches = kind === 'touchend' ? [] : [point];
					area.dispatchEvent(
						new TouchEvent(kind, { touches, changedTouches: [point], bubbles: true })
					);
				},
				[type, y] as const
			);
		await touch('touchstart', 600);
		await touch('touchmove', 380);
		await expect(page.getByText('Release to continue')).toBeVisible();
		const next = page.waitForRequest((request) => request.url().endsWith('/api/dreams/passage'));
		await touch('touchend', 380);
		await next;
		await expect(page.getByText('Ottilie waits for you to go on.')).toBeVisible();
		await saved(page);
	});

	test('a block no layout covers is designed once, kept, and drawn from then on', async ({
		page
	}) => {
		await dreamer(page);
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);

		const designed = page.waitForResponse(
			(response) => response.url().endsWith('/api/dreams/design') && response.ok()
		);
		await reply(page, '[design]');
		await designed;
		// Drawn from its design: the stamp and four punch boxes, two of them filled.
		const card = page.getByRole('region', { name: 'Week 3' });
		await expect(card).toHaveAttribute('data-frame', 'ticket');
		await expect(card.locator('.boxes li')).toHaveCount(4);
		await expect(card.locator('.boxes li.filled')).toHaveCount(2);
		await expect(card.getByText('ISSUED')).toBeVisible();
		await saved(page);

		// Kept with the daydream: after a reload it is drawn the same, not designed again.
		let designedAgain = false;
		page.on('request', (request) => {
			designedAgain ||= request.url().endsWith('/api/dreams/design');
		});
		await page.reload();
		await waitForHydration(page);
		await expect(page.getByRole('region', { name: 'Week 3' }).locator('.boxes li')).toHaveCount(4);
		expect(designedAgain).toBe(false);
	});

	test('in debug mode, each passage says how much was cached, and shows its request', async ({
		page
	}) => {
		const who = await dreamer(page);
		await grantFeature(who.email, 'debugMode');
		await page
			.context()
			.addCookies([{ name: 'debug', value: '1', url: new URL(page.url()).origin }]);
		// The app shell read the account's features before the grant.
		await page.reload();
		await waitForHydration(page);
		await start(page, 'A quiet evening');

		// Each setup step's request, and its reply, are a tap away.
		await expect(page.getByRole('region', { name: 'The Keeper' })).toBeVisible();
		await page
			.locator('li[data-step="read"]')
			.getByRole('button', { name: /^The request for/ })
			.click();
		const stepDialog = page.locator('wa-dialog[open]');
		await expect(stepDialog.getByRole('heading', { name: 'Reply' })).toBeVisible();
		await expect(stepDialog).toContainText('<musts>');
		await page.keyboard.press('Escape');
		await expect(page.locator('wa-dialog[open]')).toHaveCount(0);

		await play(page);
		await saved(page);

		const last = page.locator('li.passage').last();
		await expect(last.getByText(/^\d+% cached$/)).toBeVisible();
		await last.getByRole('button', { name: "About this passage's request" }).click();
		const dialog = page.locator('wa-dialog[open]');
		await expect(dialog.getByText('Provider', { exact: true })).toBeVisible();
		// The opening came with the build, which may write up to its whole budget.
		await expect(dialog.locator('dl.tokens')).toContainText('(max 16000)');
		await expect(dialog.locator('dl.tokens')).toContainText('Total');
		// Each part of the tokens has its value on its own line, beside its name.
		const rows = await dialog.locator('dl.tokens > div').evaluateAll((divs) =>
			divs.map((div) => {
				const [name, value] = [...div.children].map((child) => child.getBoundingClientRect().top);
				return Math.abs((name ?? 0) - (value ?? 0));
			})
		);
		expect(rows.length).toBe(3);
		expect(Math.max(...rows)).toBeLessThan(4);
		// Kept on this page: the messages sent, and the reply.
		await expect(dialog.getByText('Sent', { exact: true })).toBeVisible();
		await expect(dialog.getByText('system', { exact: true })).toBeVisible();
	});

	test('in debug mode, a passage’s clips read aloud and detail loaded from it have tabs of their own', async ({
		page
	}) => {
		const who = await dreamer(page);
		await grantFeature(who.email, 'debugMode');
		await grantFeature(who.email, 'dreamVoice');
		await page
			.context()
			.addCookies([{ name: 'debug', value: '1', url: new URL(page.url()).origin }]);
		await page.reload();
		await waitForHydration(page);
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);

		// A phrase expanded, and the passage read aloud.
		await page.getByRole('button', { name: 'Read more: a brass key' }).click();
		await expect(page.getByText('It is warm from her hand')).toBeVisible();
		await page.getByRole('button', { name: 'Read aloud' }).click();
		const player = page.getByRole('region', { name: 'Reading aloud' });
		await passageMenu(page, 'Listen');
		await expect(player).toContainText('Tap Listen on a passage', { timeout: 20_000 });

		const last = page.locator('li.passage').last();
		await last.getByRole('button', { name: "About this passage's request" }).click();
		const dialog = page.locator('wa-dialog[open]');
		const tabs = dialog.getByRole('tablist', { name: "This passage's requests" });
		await expect(tabs.getByRole('tab')).toHaveText([/Passage/, /Speech/, /More detail/]);
		// The passage's own request is the first tab, as before.
		await expect(dialog.locator('dl.tokens').first()).toContainText('(max 16000)');

		// Each clip: what went to Fish Audio, key aside, and the words' timings.
		await tabs.getByRole('tab', { name: /Speech/ }).click();
		const speechPanel = dialog.getByRole('tabpanel', { name: /Speech/ });
		await expect(speechPanel).toContainText('reference_id');
		await expect(speechPanel).toContainText('bytes of audio');
		await expect(speechPanel).not.toContainText('apiKey');

		// The phrase expanded: the request, and the reply that became its detail.
		await tabs.getByRole('tab', { name: /More detail/ }).click();
		const morePanel = dialog.getByRole('tabpanel', { name: /More detail/ });
		await expect(morePanel).toContainText('More: a brass key');
		await expect(morePanel).toContainText('It is warm from her hand');
	});

	test('read aloud and the player’s options are as they were left, after a reload', async ({
		page
	}) => {
		const who = await dreamer(page);
		await grantFeature(who.email, 'dreamVoice');
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);

		await page.getByRole('button', { name: 'Read aloud' }).click();
		const sheet = await readingOptions(page);
		const option = (name: string) => sheet.getByRole('button', { name: new RegExp(name) });
		await option('Read new passages').click();
		await option('Keep going').click();
		await option('Highlight').click();
		// A wa-button: its text is the host's, not the inner button's.
		const speed = sheet.locator('wa-button', { hasText: 'Speed' });
		await speed.click();
		await expect(speed).toContainText('1.25×');
		await closeReadingOptions(page);

		await page.reload();
		await waitForHydration(page);
		await expect(page.getByRole('button', { name: 'Read aloud' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await readingOptions(page);
		await expect(option('Read new passages')).toHaveAttribute('aria-pressed', 'true');
		await expect(option('Keep going')).toHaveAttribute('aria-pressed', 'true');
		await expect(option('Highlight')).toHaveAttribute('aria-pressed', 'false');
		await expect(speed).toContainText('1.25×');
		await closeReadingOptions(page);

		// Turned off, it stays off.
		await page.getByRole('button', { name: 'Read aloud' }).click();
		await page.reload();
		await waitForHydration(page);
		await expect(page.getByRole('button', { name: 'Read aloud' })).toHaveAttribute(
			'aria-pressed',
			'false'
		);
	});

	test('reading aloud carries on into the next passage, which Keep going asks for near the end', async ({
		page
	}) => {
		const who = await dreamer(page);
		await grantFeature(who.email, 'dreamVoice');
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);

		const read: string[] = [];
		page.on('request', (request) => {
			if (request.url().endsWith('/api/dreams/speak')) {
				read.push(String(request.postDataJSON()?.text ?? ''));
			}
		});
		await page.getByRole('button', { name: 'Read aloud' }).click();
		await toggleReadingOption(page, 'Keep going');
		await expectReadingOption(page, 'Keep going', true);
		await passageMenu(page, 'Listen');

		// Near the end of the opening (all of it, here), the story carries on by
		// itself, as Continue does, with nobody tapping anything.
		await expect(page.locator('li.passage')).toHaveCount(2, { timeout: 20_000 });
		await expect(page.locator('li.passage').last()).toContainText(
			'Ottilie waits for you to go on.'
		);
		// And once the opening has been read, the new passage is read next.
		await expect
			.poll(() => read.some((text) => text.includes('waits for you to go on')), {
				timeout: 30_000
			})
			.toBe(true);
	});

	test('each character has a colour of their own, and the user the Me blue', async ({ page }) => {
		await dreamer(page);
		await start(page, 'A quiet evening');
		// The setup page's chips are in their people's colours: the user's own
		// is the blue of the Me context.
		const cast = page.locator('ul.cast');
		await expect(cast.locator('li', { hasText: 'Ottilie' }).locator('wa-icon')).toHaveAttribute(
			'style',
			/--space-colour-green/
		);
		await expect(cast.locator('li', { hasText: 'You' }).locator('wa-icon')).toHaveAttribute(
			'style',
			/--space-colour-me/
		);
		await play(page);
		await saved(page);

		// Ottilie, the first character in, has the first colour: her speech,
		// her name where it links to her card, and the card itself.
		const passage = page.locator('li.passage').last();
		await expect(passage.locator('.say[data-who="ottilie"]')).toHaveAttribute(
			'style',
			/--speaker: var\(--space-colour-green\)/
		);
		await expect(passage.locator('button.name', { hasText: 'Ottilie' })).toHaveAttribute(
			'style',
			/--person: var\(--space-colour-green\)/
		);
		await passage.locator('button.name', { hasText: 'Ottilie' }).click();
		await expect(page.locator('wa-dialog[open] .type wa-icon')).toHaveAttribute(
			'style',
			/--space-colour-green/
		);
		// The colour the speech is drawn in is the token's own.
		const [spoken, token] = await passage.locator('.say[data-who="ottilie"]').evaluate((say) => {
			const probe = document.createElement('span');
			probe.style.color = 'var(--space-colour-green)';
			say.append(probe);
			const colours = [getComputedStyle(say).color, getComputedStyle(probe).color];
			probe.remove();
			return colours;
		});
		expect(spoken).toBe(token);
	});

	test('a passage read to its end carries on into the next one that is there', async ({ page }) => {
		const who = await dreamer(page);
		await grantFeature(who.email, 'dreamVoice');
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);
		await reply(page, 'I wait');
		await saved(page);

		const read: string[] = [];
		page.on('request', (request) => {
			if (request.url().endsWith('/api/dreams/speak')) {
				read.push(String(request.postDataJSON()?.text ?? ''));
			}
		});
		await page.getByRole('button', { name: 'Read aloud' }).click();
		// "Read new passages" is off: it is only for a passage still to come.
		await expectReadingOption(page, 'Read new passages', false);
		// The opening, read from its menu, goes on into the passage after it.
		const opening = page.locator('li.passage').first();
		await opening.getByRole('button', { name: 'More for this passage' }).click();
		await opening.getByRole('menuitem', { name: 'Listen' }).click();
		await expect
			.poll(() => read.some((text) => text.includes('Ottilie smiles')), { timeout: 30_000 })
			.toBe(true);
	});

	test('the next passage’s first clips are fetched before this one ends', async ({ page }) => {
		const who = await dreamer(page);
		await grantFeature(who.email, 'dreamVoice');
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);
		await reply(page, 'I wait');
		await saved(page);

		const read: string[] = [];
		page.on('request', (request) => {
			if (request.url().endsWith('/api/dreams/speak')) {
				read.push(String(request.postDataJSON()?.text ?? ''));
			}
		});
		await page.getByRole('button', { name: 'Read aloud' }).click();
		const player = page.getByRole('region', { name: 'Reading aloud' });
		const opening = page.locator('li.passage').first();
		await opening.getByRole('button', { name: 'More for this passage' }).click();
		await opening.getByRole('menuitem', { name: 'Listen' }).click();
		// Paused in the opening's first sentence: the opening is short, so what
		// is fetched ahead already reaches into the passage after it, and the
		// carrying on has no clip to wait for.
		await player.getByRole('button', { name: 'Pause' }).click();
		await expect
			.poll(() => read.some((text) => text.includes('Ottilie smiles')), { timeout: 15_000 })
			.toBe(true);
		await expect(player.getByRole('button', { name: 'Play' })).toBeVisible();
	});

	test('a passage that arrives mid-read waits for the one being read to finish', async ({
		page
	}) => {
		const who = await dreamer(page);
		await grantFeature(who.email, 'dreamVoice');
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);

		const read: string[] = [];
		page.on('request', (request) => {
			if (request.url().endsWith('/api/dreams/speak')) {
				read.push(String(request.postDataJSON()?.text ?? ''));
			}
		});
		await page.getByRole('button', { name: 'Read aloud' }).click();
		// On, it used to start each new passage the moment it came.
		await toggleReadingOption(page, 'Read new passages');
		await passageMenu(page, 'Listen');
		await expect
			.poll(() => page.evaluate(() => CSS.highlights.has('dream-reading')), { timeout: 10_000 })
			.toBe(true);

		// A turn taken while the opening is read: the next passage comes, and
		// the opening is still the one being read.
		await page.getByRole('button', { name: 'I take the key.', exact: true }).click();
		await expect(page.locator('li.passage')).toHaveCount(2);
		await saved(page);
		const litIn = () =>
			page.evaluate(() => {
				const lit = CSS.highlights.get('dream-reading');
				const range = lit ? [...lit][0] : undefined;
				const passage = range?.startContainer.parentElement?.closest('li.passage');
				return passage ? [...document.querySelectorAll('li.passage')].indexOf(passage) : -1;
			});
		expect(await litIn()).toBe(0);
		// Once it has been read, the new one is read after it.
		await expect
			.poll(() => read.some((text) => text.includes('Ottilie smiles')), { timeout: 30_000 })
			.toBe(true);
	});

	test('after a reload, play carries on from where reading got to', async ({ page }) => {
		const who = await dreamer(page);
		await grantFeature(who.email, 'dreamVoice');
		const dreamId = await start(page, 'A quiet evening');
		await play(page);
		await saved(page);
		await reply(page, 'I wait');
		await saved(page);

		const key = `dream-reading:${dreamId}`;
		const position = () =>
			page.evaluate((name) => JSON.parse(localStorage.getItem(name) ?? 'null'), key);
		const firstLit = () =>
			page.evaluate(
				() =>
					new Promise<{ word: string; passage: number }>((resolve) => {
						const look = () => {
							const lit = CSS.highlights.get('dream-reading');
							const range = lit ? [...lit][0] : undefined;
							const passage = range?.startContainer.parentElement?.closest('li.passage');
							if (range && passage) {
								resolve({
									word: range.toString(),
									passage: [...document.querySelectorAll('li.passage')].indexOf(passage)
								});
							} else {
								requestAnimationFrame(look);
							}
						};
						look();
					})
			);
		await page.getByRole('button', { name: 'Read aloud' }).click();
		const player = page.getByRole('region', { name: 'Reading aloud' });
		const opening = page.locator('li.passage').first();
		await opening.getByRole('button', { name: 'More for this passage' }).click();
		await opening.getByRole('menuitem', { name: 'Listen' }).click();
		// Paused past the opening's first sentence.
		await expect
			.poll(async () => (await position())?.index ?? 0, { timeout: 15_000 })
			.toBeGreaterThan(0);
		await player.getByRole('button', { name: 'Pause' }).click();
		const kept = await position();

		await page.reload();
		await waitForHydration(page);
		// Read aloud is still on: it is kept with the player's options.
		await player.getByRole('button', { name: 'Play' }).click();
		const resumed = await firstLit();
		expect(resumed.passage).toBe(0);
		expect(resumed.word).not.toBe('The');
		expect((await position())?.index).toBeGreaterThanOrEqual(kept.index);

		// Kept as finished, play goes on to the passage after it.
		await player.getByRole('button', { name: 'Pause' }).click();
		await page.evaluate(
			([name, turnId]) =>
				localStorage.setItem(name, JSON.stringify({ turnId, index: 99, done: true })),
			[key, kept.turnId] as const
		);
		await page.reload();
		await waitForHydration(page);
		// Read aloud is still on: it is kept with the player's options.
		await player.getByRole('button', { name: 'Play' }).click();
		expect((await firstLit()).passage).toBe(1);
	});

	test('everyone speaks in the narrator’s voice until a voice is chosen for them', async ({
		page
	}) => {
		const who = await dreamer(page);
		await grantFeature(who.email, 'dreamVoice');
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);

		const asked: { text: string; voice: string }[] = [];
		page.on('request', (request) => {
			if (request.url().endsWith('/api/dreams/speak')) {
				const body = request.postDataJSON() ?? {};
				asked.push({ text: String(body.text ?? ''), voice: String(body.voice ?? '') });
			}
		});
		await page.getByRole('button', { name: 'Read aloud' }).click();
		const player = page.getByRole('region', { name: 'Reading aloud' });
		await passageMenu(page, 'Listen');
		await expect(player).toContainText('Tap Listen on a passage', { timeout: 20_000 });
		expect(asked.length).toBeGreaterThan(0);
		expect(asked.every((entry) => entry.voice === 'narrator')).toBe(true);

		// A voice chosen for Ottilie, kept with the daydream.
		await (await readingOptions(page)).getByRole('button', { name: 'Voices' }).click();
		const dialog = page.locator('wa-dialog[open]');
		// The user's own lines have a voice to choose too.
		const yours = dialog.locator('.row').nth(1);
		await expect(yours.locator('.who')).toHaveText('You');
		await expect(yours.locator('wa-button[slot="trigger"]')).toHaveText('Same as the narrator');
		// Each voice can be heard: hers is the narrator's until one is chosen.
		const sample = page.waitForRequest((request) =>
			request.url().endsWith('/api/dreams/voice-sample')
		);
		await dialog.getByRole('button', { name: /^Hear Ottilie.*’s voice$/ }).click();
		expect((await sample).postDataJSON()).toEqual({ voice: 'narrator' });
		const row = dialog.locator('.row', { has: page.locator('.who', { hasText: 'Ottilie' }) });
		const trigger = row.locator('wa-button[slot="trigger"]');
		await expect(trigger).toHaveText('Same as the narrator');
		await trigger.click();
		await row.getByRole('menuitemcheckbox', { name: /^Smoky/ }).click();
		await expect(trigger).toHaveText('Smoky');
		await page.keyboard.press('Escape');
		await page.reload();
		await waitForHydration(page);
		await (await readingOptions(page)).getByRole('button', { name: 'Voices' }).click();
		await expect(trigger).toHaveText('Smoky');
		await page.keyboard.press('Escape');

		// Her lines are read in it, and the narration still in the narrator's.
		asked.length = 0;
		await passageMenu(page, 'Listen');
		await expect
			.poll(() => asked.find((entry) => entry.text.includes('You came'))?.voice, {
				timeout: 15_000
			})
			.toBe('smoky');
		expect(asked.find((entry) => entry.text.includes('lamp turns'))?.voice).toBe('narrator');

		// While reading aloud, her card has her voice, to hear and to change.
		await player.getByRole('button', { name: 'Pause' }).click();
		await page
			.locator('ol.turns')
			.getByRole('button', { name: 'Ottilie', exact: true })
			.first()
			.click();
		const card = page.locator('wa-dialog[open]');
		const cardTrigger = card.locator('.voice wa-button[slot="trigger"]');
		await expect(cardTrigger).toHaveText('Smoky');
		await expect(card.getByRole('button', { name: /^Hear Ottilie.*’s voice$/ })).toBeVisible();
		await cardTrigger.click();
		await card.getByRole('menuitemcheckbox', { name: /^Tender/ }).click();
		await expect(cardTrigger).toHaveText('Tender');
		await page.keyboard.press('Escape');
		await expect(card).toHaveCount(0);
		await (await readingOptions(page)).getByRole('button', { name: 'Voices' }).click();
		await expect(trigger).toHaveText('Tender');
		await page.keyboard.press('Escape');
		// With reading aloud off, a card says nothing of voices.
		await page.getByRole('button', { name: 'Read aloud' }).click();
		await page
			.locator('ol.turns')
			.getByRole('button', { name: 'Ottilie', exact: true })
			.first()
			.click();
		await expect(page.locator('wa-dialog[open] .card')).toBeVisible();
		await expect(page.locator('wa-dialog[open] .voice')).toHaveCount(0);
	});

	test('Keep going turned on after the end asks for the next passage at once', async ({ page }) => {
		const who = await dreamer(page);
		await grantFeature(who.email, 'dreamVoice');
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);

		const read: string[] = [];
		page.on('request', (request) => {
			if (request.url().endsWith('/api/dreams/speak')) {
				read.push(String(request.postDataJSON()?.text ?? ''));
			}
		});
		await page.getByRole('button', { name: 'Read aloud' }).click();
		const player = page.getByRole('region', { name: 'Reading aloud' });
		await passageMenu(page, 'Listen');
		await expect(player).toContainText('Tap Listen on a passage', { timeout: 20_000 });
		// Read to its end with Keep going off: nothing more was asked for.
		await expect(page.locator('li.passage')).toHaveCount(1);

		await toggleReadingOption(page, 'Keep going');
		await expect(page.locator('li.passage')).toHaveCount(2, { timeout: 20_000 });
		await expect
			.poll(() => read.some((text) => text.includes('waits for you to go on')), {
				timeout: 30_000
			})
			.toBe(true);
	});

	test('a passage that comes after reading stopped is fetched, and plays at once', async ({
		page
	}) => {
		const who = await dreamer(page);
		await grantFeature(who.email, 'dreamVoice');
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);

		const read: string[] = [];
		page.on('request', (request) => {
			if (request.url().endsWith('/api/dreams/speak')) {
				read.push(String(request.postDataJSON()?.text ?? ''));
			}
		});
		await page.getByRole('button', { name: 'Read aloud' }).click();
		const player = page.getByRole('region', { name: 'Reading aloud' });
		await passageMenu(page, 'Listen');
		await expect(player).toContainText('Tap Listen on a passage', { timeout: 20_000 });

		// Read new passages and Keep going are off: it is not read by itself,
		// but its first clip is fetched before play is pressed.
		await reply(page, 'I wait');
		await saved(page);
		await expect
			.poll(() => read.some((text) => text.includes('Ottilie smiles')), { timeout: 15_000 })
			.toBe(true);
		await expect(player.getByRole('button', { name: 'Play' })).toBeVisible();
		const asked = read.length;
		await player.getByRole('button', { name: 'Play' }).click();
		await expect(player.getByRole('button', { name: 'Pause' })).toBeVisible();
		// Its opening clip was the one fetched: play asked for none again.
		expect(read.slice(asked).some((text) => text.includes('Ottilie smiles'))).toBe(false);
	});

	test('Keep going asks whether anyone is still listening, warns, and pauses unanswered', async ({
		page
	}) => {
		const who = await dreamer(page);
		await grantFeature(who.email, 'dreamVoice');
		await page.clock.install();
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);

		// Each chime is two notes: counted, since a test cannot hear it. On this
		// page, which the daydream was reached in without loading a new one.
		await page.evaluate(() => {
			const Real = OscillatorNode;
			const counted = globalThis as unknown as { notes: number };
			counted.notes = 0;
			globalThis.OscillatorNode = class extends Real {
				constructor(...args: ConstructorParameters<typeof OscillatorNode>) {
					super(...args);
					counted.notes += 1;
				}
			};
		});
		// What a media key or headphone button would call, kept to press by hand.
		await page.evaluate(() => {
			const kept = globalThis as unknown as { media: Record<string, () => void> };
			kept.media = {};
			const set = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
			navigator.mediaSession.setActionHandler = (action, handler) => {
				if (handler) {
					kept.media[action] = () => handler({ action });
				}
				set(action, handler);
			};
		});
		const press = (action: string) =>
			page.evaluate(
				(name) => (globalThis as unknown as { media: Record<string, () => void> }).media[name]?.(),
				action
			);
		await page.getByRole('button', { name: 'Read aloud' }).click();
		const player = page.getByRole('region', { name: 'Reading aloud' });
		await toggleReadingOption(page, 'Keep going');
		await passageMenu(page, 'Listen');
		await expect(player.getByRole('button', { name: 'Pause' })).toBeVisible();
		const notes = () => page.evaluate(() => (globalThis as unknown as { notes: number }).notes);

		// Two minutes with nobody touching anything.
		await page.clock.fastForward('02:01');
		// Its words: the wa-dialog host has no box of its own to be visible.
		const asking = page.getByText(/Keep going is writing and reading the story by itself/);
		await expect(asking).toBeVisible();
		expect(await notes()).toBe(0);
		// Half way, a chime, for a phone in a pocket.
		await page.clock.fastForward('00:16');
		await expect.poll(notes).toBe(2);
		// Unanswered, it pauses.
		await page.clock.fastForward('00:15');
		await expect(asking).toBeHidden();
		await expect(player.getByRole('button', { name: 'Play' })).toBeVisible();

		// Answered, it keeps playing.
		await player.getByRole('button', { name: 'Play' }).click();
		await expect(player.getByRole('button', { name: 'Pause' })).toBeVisible();
		await page.clock.fastForward('02:01');
		await expect(asking).toBeVisible();
		await clickWaButton(page, 'Keep playing');
		await expect(asking).toBeHidden();
		await expect(player.getByRole('button', { name: 'Pause' })).toBeVisible();

		// After a yes it waits five minutes; then the headphones' pause answers it.
		await page.clock.fastForward('02:01');
		await expect(asking).toBeHidden();
		await page.clock.fastForward('03:00');
		await expect(asking).toBeVisible();
		await press('pause');
		await expect(asking).toBeHidden();
		await expect(player.getByRole('button', { name: 'Play' })).toBeVisible();

		// Played again, it counts as keep playing: the next ask waits ten.
		await press('play');
		await expect(player.getByRole('button', { name: 'Pause' })).toBeVisible();
		await page.clock.fastForward('05:01');
		await expect(asking).toBeHidden();
		await page.clock.fastForward('05:00');
		await expect(asking).toBeVisible();
	});

	test('reading aloud does not pull the page back once it is scrolled away', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 520 });
		const who = await dreamer(page);
		await grantFeature(who.email, 'dreamVoice');
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);
		for (const words of ['I wait', 'I wait again', 'I wait once more']) {
			await reply(page, words);
			await saved(page);
		}
		await page.getByRole('button', { name: 'Read aloud' }).click();
		const player = page.getByRole('region', { name: 'Reading aloud' });
		await passageMenu(page, 'Listen');
		await expect
			.poll(() => page.evaluate(() => CSS.highlights.has('dream-reading')), { timeout: 10_000 })
			.toBe(true);

		// Scrolled to the top, away from the line being read: it stays there
		// for the rest of the reading.
		const main = page.locator('main');
		const area = await main.boundingBox();
		await page.mouse.move((area?.x ?? 0) + 100, (area?.y ?? 0) + 100);
		await page.mouse.wheel(0, -10_000);
		await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBeLessThan(5);
		await expect(player).toContainText('Tap Listen on a passage', { timeout: 20_000 });
		expect(await main.evaluate((element) => element.scrollTop)).toBeLessThan(5);
	});

	test('how the story is shown can be changed from the reading settings, and is kept', async ({
		page
	}) => {
		await dreamer(page);
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);

		await page.getByRole('button', { name: 'Reading settings' }).click();
		await page.getByRole('menuitemcheckbox', { name: 'As messages' }).click();
		await expect(page.locator('ol.turns')).toHaveAttribute('data-view', 'texts');
		await page.reload();
		await waitForHydration(page);
		await expect(page.locator('ol.turns')).toHaveAttribute('data-view', 'texts');
	});

	test('choosing another idea while one is being built builds that one instead', async ({
		page
	}) => {
		await dreamer(page);
		await start(page, 'A quiet evening [pick] [slow build]');
		await page.getByRole('button', { name: 'Use this one' }).first().click();
		// Still being built: the first idea's opening has not finished.
		await expect(page.locator('li[data-step="build"][data-status="active"]')).toBeVisible();
		// The ideas stay open while one is built, so another is a tap away.
		const letters = page.locator('ul.directions li', { hasText: 'Letters left under a door.' });
		await letters.getByRole('button', { name: 'Use this one' }).click();

		// The build is for the idea chosen last, and the first left no trace.
		const ready = page.getByRole('region', { name: 'The Keeper' });
		await expect(ready).toBeVisible({ timeout: 30_000 });
		await expect(page.locator('li[data-step="pick"]').last()).toContainText(
			'Letters left under a door.'
		);
		await play(page);
		await expect(page.locator('li.passage').first()).toContainText('(Letters left under a door.)');
		await page.reload();
		await waitForHydration(page);
		await expect(page.locator('li.passage').first()).toContainText('(Letters left under a door.)');
		await expect(page.locator('li.passage')).toHaveCount(1);
	});

	test('choosing first, Surprise me, and Try another idea', async ({ page }) => {
		await dreamer(page);
		await start(page, 'A quiet evening [pick]');
		// The ideas are under the step that waits on the user, marked as waiting on them.
		const choose = page.locator('li[data-step="pick"]');
		await expect(choose).toHaveAttribute('data-status', 'yours');
		await expect(choose).toContainText('Choose an idea');
		await expect(choose.getByRole('button', { name: 'Use this one' })).toHaveCount(3);
		// Nothing is built until the user chooses.
		await expect(page.getByRole('heading', { name: 'The Keeper' })).toHaveCount(0);
		await clickWaButton(page, 'Surprise me');
		await play(page);
		await saved(page);

		// Built from one of step 1's ideas, picked for the user.
		await expect(page.locator('li.passage').first()).toContainText(
			/\((?:A lesson in a lighthouse|Letters left under a door|A night train)/
		);
	});

	test('another name for a character, keeping the old one linked', async ({ page }) => {
		await dreamer(page);
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);
		await page.locator('ol.turns').getByRole('button', { name: 'Ottilie', exact: true }).click();
		await clickWaButton(page, 'Another name');
		const choice = page.locator('.choices wa-button').first();
		const name = ((await choice.textContent()) ?? '').trim();
		expect(name).toMatch(/^\S+ \S+$/);
		await choice.click();
		const card = page.locator('wa-dialog').getByRole('heading', { name, exact: true });
		await expect(card).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(card).toBeHidden();
		// What the opening called her still opens her card.
		await page.locator('ol.turns').getByRole('button', { name: 'Ottilie', exact: true }).click();
		await expect(card).toBeVisible();
	});

	test('a question in play, remembered and made general, changes the next daydream', async ({
		page
	}) => {
		await dreamer(page);
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);
		await reply(page, '[ask]');
		await expect(page.getByText('Slower, or faster?')).toBeVisible();
		await saved(page);

		// What the model noticed is remembered for this daydream, shown, and undoable.
		await expect(
			page.getByText('Remembered for this daydream: Quiet, unhurried scenes')
		).toBeVisible();
		await page
			.getByRole('status')
			.filter({ hasText: 'Quiet, unhurried scenes' })
			.getByRole('button', { name: 'Undo' })
			.click();
		await expect(page.getByText('Quiet, unhurried scenes')).toHaveCount(0);
		// New telling notes apply only if accepted.
		await expect(page.getByText('Now told as letters between you.')).toBeVisible();
		await clickWaButton(page, 'Keep as it is');

		await page.getByRole('button', { name: 'Remember for this daydream' }).click();
		await clickWaButton(page, 'Slower');
		await expect(page.getByText(/^Ottilie nods\./)).toContainText('"pace": "Slower"');
		await saved(page);
		await expect(
			page.getByText('Remembered for this daydream: Slower, or faster? Slower')
		).toBeVisible();
		await clickWaButton(page, 'Make it general');
		await expect(
			page.getByText('Remembered for every daydream: Slower, or faster? Slower')
		).toBeVisible();

		// The next daydream keeps it in mind, and says so.
		await page.goto('/dreams');
		await waitForHydration(page);
		await start(page, 'Another evening [ask]');
		await expect(page.getByRole('heading', { name: 'Who is in charge?' })).toBeVisible();
		await expect(
			page.getByText('keeping in mind: By default: Slower, or faster? Slower')
		).toBeVisible();
		await page.getByRole('button', { name: "What I'm keeping in mind" }).click();
		await expect(
			page.getByText('By default: Slower, or faster? Slower', { exact: true })
		).toBeVisible();
	});

	test('a stat moves only with the words that earned it, on its own branch; a roll is the turn', async ({
		page
	}) => {
		await dreamer(page);
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);
		const composure = page.locator('dl.stats');
		await expect(composure).toContainText('30 / 100');

		await reply(page, '[hold]');
		await expect(page.getByText('+5 composure')).toBeVisible();
		await saved(page);
		await expect(composure).toContainText('35 / 100');

		// Another take, without the change: that branch is back to 30.
		await passageMenu(page, 'Another take');
		await expect(page.getByText(/^Again, differently:/)).toBeVisible();
		await saved(page);
		await expect(composure).toContainText('30 / 100');
		await page.getByRole('button', { name: 'Previous version' }).click();
		await expect(composure).toContainText('35 / 100');

		await reply(page, '[roll]');
		await clickWaButton(page, 'Roll a d6');
		await expect(page.getByText(/^The dice fall\./)).toContainText(
			'on the d6 you offered ("door")'
		);
		await saved(page);
		await expect(page.getByText(/You rolled \d/)).toBeVisible();
	});

	test('a picture is drawn on tap, kept encrypted, and the same after a reload', async ({
		page
	}) => {
		await dreamer(page);
		const id = await start(page, 'A quiet evening');
		await play(page);
		await saved(page);
		await reply(page, '[picture]');
		await expect(page.getByText('She waits by the lamp.')).toBeVisible();
		await saved(page);

		const made = page.waitForResponse(
			(response) => response.url().endsWith(`/api/dreams/${id}/picture`) && response.ok()
		);
		await clickWaButton(page, 'Show a picture');
		const sent = (await made).request().postDataJSON() as { prompt: string };
		// Described from her card, never from the passage's own words about her.
		expect(sent.prompt).toContain('Silver bob, reading glasses on a chain.');
		const picture = page.getByRole('img', { name: 'Ottilie by the lamp' });
		await expect(picture).toBeVisible();

		await page.reload();
		await waitForHydration(page);
		await expect(page.getByRole('img', { name: 'Ottilie by the lamp' })).toBeVisible();
		await expect(page.getByText('Show a picture')).toHaveCount(0);
	});

	test('a change asked for while it is set up is read in, and shown', async ({ page }) => {
		await dreamer(page);
		await start(page, 'A quiet evening [ask]');
		await expect(page.getByRole('heading', { name: 'Who is in charge?' })).toBeVisible();

		await box(page, 'Not quite? Tell it what to change.').fill('Make it winter');
		await clickWaButton(page, 'Change it');
		await expect(page.getByRole('region', { name: 'What you asked for' })).toContainText(
			'Then: Make it winter'
		);
		await expect(page.getByRole('heading', { name: 'Who is in charge?' })).toBeVisible();
		await clickWaButton(page, 'You are');
		await expect(page.getByRole('heading', { name: 'The Keeper (changed)' })).toBeVisible();
	});

	test('a passage is read aloud only when asked, with its words lit as they are said', async ({
		page
	}) => {
		const who = await dreamer(page);
		await grantFeature(who.email, 'dreamVoice');
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);

		// Nothing plays, and there is no player, until it is asked for.
		const player = page.getByRole('region', { name: 'Reading aloud' });
		await expect(player).toHaveCount(0);
		// Without it, the turn's controls are in the middle of the row; with it,
		// they slide to its start for the player, and back again once it is off.
		const placed = () =>
			page.locator('.turn-row').evaluate((row) => {
				const bounds = row.getBoundingClientRect();
				const controls = row.querySelector('.turn-controls')?.getBoundingClientRect();
				return controls
					? {
							offCentre: Math.abs(controls.x + controls.width / 2 - (bounds.x + bounds.width / 2)),
							fromStart: controls.x - bounds.x
						}
					: null;
			});
		await expect.poll(async () => (await placed())?.offCentre ?? 99).toBeLessThan(2);
		await page.getByRole('button', { name: 'Read aloud' }).click();
		await expect(player).toContainText('Tap Listen on a passage');
		await expect.poll(async () => (await placed())?.fromStart ?? 99).toBeLessThan(2);
		await page.getByRole('button', { name: 'Read aloud' }).click();
		await expect(player).toHaveCount(0);
		await expect.poll(async () => (await placed())?.offCentre ?? 99).toBeLessThan(2);
		await page.getByRole('button', { name: 'Read aloud' }).click();
		await expect(player).toContainText('Tap Listen on a passage');
		// A bubble at the end of the floating row, after the turn, so it stays in
		// sight wherever the story is scrolled.
		await expect(
			page.locator('.dock').getByRole('region', { name: 'Reading aloud' })
		).toBeVisible();
		// Its play icon is in the middle of it: the glyph, not just its box, within
		// the little nudge right a triangle is given to look centred.
		// Polled: the icon's drawing comes from Font Awesome's CDN after the page.
		const offCentre = () =>
			player.locator('.bubble').evaluate((bubble) => {
				const bounds = bubble.getBoundingClientRect();
				const path = bubble.querySelector('wa-icon')?.shadowRoot?.querySelector('path');
				const matrix = path?.getScreenCTM();
				if (!(path && matrix)) {
					return null;
				}
				const drawn = path.getBBox();
				const from = new DOMPoint(drawn.x, drawn.y).matrixTransform(matrix);
				const to = new DOMPoint(drawn.x + drawn.width, drawn.y + drawn.height).matrixTransform(
					matrix
				);
				return {
					x: Math.abs((from.x + to.x) / 2 - (bounds.x + bounds.width / 2)),
					y: Math.abs((from.y + to.y) / 2 - (bounds.y + bounds.height / 2))
				};
			});
		await expect.poll(async () => (await offCentre())?.x ?? 99).toBeLessThanOrEqual(3);
		await expect.poll(async () => (await offCentre())?.y ?? 99).toBeLessThanOrEqual(1);
		const continueLeft =
			(await page.getByRole('button', { name: 'Continue daydream' }).boundingBox())?.x ?? 0;
		const playerLeft = (await player.boundingBox())?.x ?? 0;
		expect(playerLeft).toBeGreaterThan(continueLeft);

		const spoken = page.waitForRequest((request) => request.url().endsWith('/api/dreams/speak'));
		await passageMenu(page, 'Listen');
		const sent = (await spoken).postDataJSON();
		expect(sent.text.length).toBeGreaterThan(0);
		expect(sent.voice).toMatch(/^[a-z-]+$/);
		// The words are lit as the stand-in's timings say they are said, and
		// the light goes out when the passage has been read.
		await expect
			.poll(() => page.evaluate(() => CSS.highlights.has('dream-reading')), { timeout: 10_000 })
			.toBe(true);
		await expect(player).toContainText('Tap Listen on a passage', { timeout: 20_000 });
		expect(await page.evaluate(() => CSS.highlights.has('dream-reading'))).toBe(false);

		// With read aloud on and nothing playing, a tap on a word plays from it:
		// its whole sentence is fetched (here, already kept from before), and
		// played from that word, which is the first one lit.
		const point = await page
			.locator('li.passage .markup')
			.first()
			.evaluate((root) => {
				const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
				for (let node = walker.nextNode(); node; node = walker.nextNode()) {
					const at = node.textContent?.indexOf('hands') ?? -1;
					if (at >= 0) {
						const range = document.createRange();
						range.setStart(node, at + 1);
						range.setEnd(node, at + 2);
						const rect = range.getBoundingClientRect();
						return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
					}
				}
				return null;
			});
		expect(point).not.toBeNull();
		await page.mouse.click(point?.x ?? 0, point?.y ?? 0);
		const firstLit = await page.evaluate(
			() =>
				new Promise<string>((resolve) => {
					const look = () => {
						const lit = CSS.highlights.get('dream-reading');
						const range = lit ? [...lit][0] : undefined;
						if (range) {
							resolve(range.toString());
						} else {
							requestAnimationFrame(look);
						}
					};
					look();
				})
		);
		expect(firstLit).toBe('hands');
		await page
			.getByRole('region', { name: 'Reading aloud' })
			.getByRole('button', { name: 'Pause' })
			.click();

		// Listening, the next passage is asked for delivery cues and sounds.
		const next = page.waitForRequest((request) => request.url().endsWith('/api/dreams/passage'));
		await reply(page, 'I wait.');
		expect((await next).postDataJSON().setup.capabilities).toContain('voice');
		await saved(page);

		// Too narrow for even the icons on one line, the turn's controls wrap
		// rather than push the player off the screen.
		await page.setViewportSize({ width: 200, height: 600 });
		const dock = page.locator('.dock');
		await expect(player.getByRole('button', { name: 'Play' })).toBeInViewport({ ratio: 1 });
		await expect(dock.getByRole('button', { name: 'Write response…' })).toBeInViewport({
			ratio: 1
		});
		const rows = await dock
			.locator('.turn-controls > *')
			.evaluateAll(
				(controls) => new Set(controls.map((control) => control.getBoundingClientRect().top)).size
			);
		expect(rows).toBeGreaterThan(1);
	});

	test('is only for an account with the feature', async ({ page }) => {
		await newAccount(page, account('Nobody'));
		const response = await page.goto('/dreams');
		expect(response?.status()).toBe(403);
	});
});
