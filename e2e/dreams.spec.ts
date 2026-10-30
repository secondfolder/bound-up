import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { sql } from './db';
import { test } from './fixtures';
import { account, clickWaButton, grantFeature, newAccount, waitForHydration } from './helpers';

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
		await clickWaButton(page, 'Add');
		await expect(page.getByRole('region', { name: 'Never' })).toContainText('Nothing about feet');
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
		const [chip] = await chips.getByRole('button').allInnerTexts();
		await chips.getByRole('button').first().click();
		await expect(page.getByText(`Instead: ${chip?.trim()}`)).toBeVisible();
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

	test('the turn is a list of chips: suggestions, held to change first, Continue, and your own', async ({
		page
	}) => {
		await dreamer(page);
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);

		// Suggestions first, then Continue, then writing your own, in one list.
		const chips = page.getByRole('list', { name: 'Your turn' });
		await expect(chips.getByRole('button')).toHaveText([
			'I take the key.',
			'I leave it in her hand.',
			'Continue daydream',
			'Write response…'
		]);
		// Centred in the column.
		await expect(chips).toHaveCSS('justify-content', 'center');

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
		const write = chips.getByRole('button', { name: 'Write response…' });
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

	test('the turn sits at the story’s end, and stays in sight with a background above it', async ({
		page
	}) => {
		await page.setViewportSize({ width: 390, height: 480 });
		await dreamer(page);
		await start(page, 'A quiet evening');
		await play(page);
		await saved(page);
		const turn = page.locator('.dock');
		const main = page.locator('main');

		// At the end of the story: no background of its own.
		await main.evaluate((element) => element.scrollTo(0, element.scrollHeight));
		await expect(turn).not.toHaveClass(/stuck/);
		// Scrolled up, the story runs on under it, so it takes one.
		await main.evaluate((element) => element.scrollTo(0, 0));
		await expect(turn).toHaveClass(/stuck/);
		await expect(turn.getByRole('button', { name: 'Continue daydream' })).toBeInViewport();

		// Never more than half the screen: what does not fit scrolls, from its end.
		await page.setViewportSize({ width: 320, height: 300 });
		const scroller = page.locator('.dock-scroll');
		await expect
			.poll(() => turn.evaluate((element) => element.getBoundingClientRect().height))
			.toBeLessThanOrEqual(150);
		await expect
			.poll(() =>
				scroller.evaluate(
					(element) => element.scrollHeight - element.clientHeight - element.scrollTop
				)
			)
			.toBeLessThanOrEqual(1);
		await expect(turn.getByRole('button', { name: 'Write response…' })).toBeInViewport();
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
		const player = page.getByRole('region', { name: 'Reading aloud' });
		await player.getByRole('button', { name: 'Keep going' }).click();
		await expect(player.getByRole('button', { name: /Keep going/ })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
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
		await page.getByRole('button', { name: 'Read aloud' }).click();
		await expect(player).toContainText('Tap Listen on a passage');
		// In the dock, under the turn, so it stays in sight wherever the story is scrolled.
		await expect(
			page.locator('.dock').getByRole('region', { name: 'Reading aloud' })
		).toBeVisible();
		const chipsTop = (await page.getByRole('list', { name: 'Your turn' }).boundingBox())?.y ?? 0;
		const playerTop = (await player.boundingBox())?.y ?? 0;
		expect(playerTop).toBeGreaterThan(chipsTop);

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
	});

	test('is only for an account with the feature', async ({ page }) => {
		await newAccount(page, account('Nobody'));
		const response = await page.goto('/dreams');
		expect(response?.status()).toBe(403);
	});
});
