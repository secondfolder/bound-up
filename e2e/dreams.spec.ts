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

		await expect(page.locator('ol.turns')).toContainText('"You came,"');
		await expect(page.getByRole('heading', { name: 'The Keeper' })).toBeVisible();
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
		await expect(page.getByRole('heading', { name: 'The Keeper' })).toBeVisible();
		await saved(page);

		await box(page, 'Your turn').fill('I light the lamp');
		await clickWaButton(page, 'Send');
		await expect(page.getByText('You say "I light the lamp", and Ottilie smiles.')).toBeVisible();
		await saved(page);

		// Another take is a version beside it, not in its place.
		await page.locator('li.passage').last().getByRole('button', { name: 'Another take' }).click();
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
		await expect(page.getByRole('heading', { name: 'The Keeper' })).toBeVisible();
		await saved(page);

		await box(page, 'Your turn').fill('[contract]');
		await clickWaButton(page, 'Send');
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
		await expect(page.getByRole('heading', { name: 'The Keeper' })).toBeVisible();
		await saved(page);
		await box(page, 'Your turn').fill('I wait');
		await clickWaButton(page, 'Send');
		await expect(page.getByText(/and Ottilie smiles/)).toBeVisible();
		await saved(page);

		await page
			.locator('li.passage')
			.last()
			.getByRole('button', { name: 'Different direction' })
			.click();
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

	test('choosing first, Surprise me, and Try another idea', async ({ page }) => {
		await dreamer(page);
		await start(page, 'A quiet evening [pick]');
		await expect(page.getByText('Choose an idea, or let it choose for you.')).toBeVisible();
		// Nothing is built until the user chooses.
		await expect(page.getByRole('heading', { name: 'The Keeper' })).toHaveCount(0);
		await clickWaButton(page, 'Surprise me');
		await expect(page.getByRole('heading', { name: 'The Keeper' })).toBeVisible();
		await saved(page);

		// Built from one of step 1's ideas, picked for the user.
		await expect(page.locator('li.passage').first()).toContainText(
			/\((?:A lesson in a lighthouse|Letters left under a door|A night train)/
		);
	});

	test('another name for a character, keeping the old one linked', async ({ page }) => {
		await dreamer(page);
		await start(page, 'A quiet evening');
		await expect(page.getByRole('heading', { name: 'The Keeper' })).toBeVisible();
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
		await expect(page.getByRole('heading', { name: 'The Keeper' })).toBeVisible();
		await saved(page);
		await box(page, 'Your turn').fill('[ask]');
		await clickWaButton(page, 'Send');
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
		await expect(page.getByRole('heading', { name: 'The Keeper' })).toBeVisible();
		await saved(page);
		const composure = page.locator('dl.stats');
		await expect(composure).toContainText('30 / 100');

		await box(page, 'Your turn').fill('[hold]');
		await clickWaButton(page, 'Send');
		await expect(page.getByText('+5 composure')).toBeVisible();
		await saved(page);
		await expect(composure).toContainText('35 / 100');

		// Another take, without the change: that branch is back to 30.
		await page.locator('li.passage').last().getByRole('button', { name: 'Another take' }).click();
		await expect(page.getByText(/^Again, differently:/)).toBeVisible();
		await saved(page);
		await expect(composure).toContainText('30 / 100');
		await page.getByRole('button', { name: 'Previous version' }).click();
		await expect(composure).toContainText('35 / 100');

		await box(page, 'Your turn').fill('[roll]');
		await clickWaButton(page, 'Send');
		await clickWaButton(page, 'Roll a d6');
		await expect(page.getByText(/^The dice fall\./)).toContainText(
			'on the d6 you offered ("door")'
		);
		await saved(page);
		await expect(page.getByText(/You rolled \d/)).toBeVisible();
	});

	test('a change asked for while it is set up is read in, and shown', async ({ page }) => {
		await dreamer(page);
		await start(page, 'A quiet evening [ask]');
		await expect(page.getByRole('heading', { name: 'Who is in charge?' })).toBeVisible();

		await box(page, 'Not quite? Tell it what to change.').fill('Make it winter');
		await clickWaButton(page, 'Change it');
		await expect(page.getByText('Then: “Make it winter”')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Who is in charge?' })).toBeVisible();
		await clickWaButton(page, 'You are');
		await expect(page.getByRole('heading', { name: 'The Keeper (changed)' })).toBeVisible();
	});

	test('is only for an account with the feature', async ({ page }) => {
		await newAccount(page, account('Nobody'));
		const response = await page.goto('/dreams');
		expect(response?.status()).toBe(403);
	});
});
