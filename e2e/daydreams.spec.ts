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
 * and fails once for a turn containing `[fail]`.
 */

/**
 * Waits until the newest reply has been saved, not just shown. A reply is on
 * screen as it streams in, before it is sealed and saved, and the page offers
 * "Write this reply again" only once that has finished — so a reload or a
 * database read before this would race the save.
 */
async function replySaved(page: Page) {
	await expect(page.getByRole('button', { name: 'Write this reply again' })).toBeVisible();
}

async function grantDaydreams(email: string) {
	await sql(
		`insert into user_features (id, user_id, feature, source)
		 select ?, id, 'daydreams', 'grant' from user where email = ?`,
		[randomUUID(), email]
	);
}

/** From the list to a new daydream's own page, through the disclosure and the setup. */
async function startDaydream(page: Page, title = 'Late meeting') {
	await page.goto('/daydreams');
	await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible();
	await clickWaButton(page, 'I understand');
	await page.getByRole('link', { name: 'New daydream' }).click();
	await page.waitForURL('**/daydreams/new');
	await waitForHydration(page);

	await fillWaInput(page, 'title', title);
	await fillWaInput(page, 'characterName', 'Mara');
	// Typed key by key rather than filled: a space typed here once went missing,
	// which `fill()` cannot see because it never presses a key.
	const scenario = page.locator('textarea[name="scenario"]');
	await scenario.pressSequentially('The office has emptied out.', { delay: 10 });
	await expect(scenario).toHaveValue('The office has emptied out.');
	await page.locator('textarea[name="limits"]').fill('Nothing public.');
	await clickWaButton(page, 'Start daydreaming');
	await page.waitForURL(/\/daydreams\/[0-9a-f-]{36}$/);
	return new URL(page.url()).pathname.split('/').at(-1) ?? '';
}

test.describe('daydreams', () => {
	test('a daydream opens by itself, answers, keeps its history sealed, and retries', async ({
		page
	}) => {
		const who = account('Dreamer');
		await signUp(page, who);
		await grantDaydreams(who.email);

		const id = await startDaydream(page);
		await expect(page.getByRole('heading', { name: 'Late meeting' })).toBeVisible();
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();

		// Unique per run: the stub counts takes per conversation for as long as
		// it runs, and a repeated run would otherwise start at take 2.
		const said = `I close the door, ${randomUUID().slice(0, 8)}.`;
		await reply(page, said);
		await expect(page.getByText(`Mara heard: "${said}"`)).toBeVisible();
		await replySaved(page);

		// Stored sealed: none of the words, in either direction, is in the database.
		const { rows } = await sql(
			'select role, ciphertext from daydream_turns where daydream_id = ? order by position',
			[id]
		);
		expect(rows.map((row) => row.role)).toEqual(['character', 'user', 'character']);
		expect(JSON.stringify(rows)).not.toContain(said);
		expect(JSON.stringify(rows)).not.toContain('Mara');
		const setup = await sql('select ciphertext from daydreams where id = ?', [id]);
		expect(JSON.stringify(setup.rows)).not.toContain('Late meeting');

		// And back, on this device, after a reload.
		await page.reload();
		await waitForHydration(page);
		await expect(page.getByText(`Mara heard: "${said}"`)).toBeVisible();
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();

		// The newest reply, written again in its place.
		await clickWaButton(page, 'Write this reply again');
		await expect(page.getByText(`Mara heard: "${said}" (take 2)`)).toBeVisible();
		await replySaved(page);
		await page.reload();
		await waitForHydration(page);
		await expect(page.getByText('(take 2)')).toBeVisible();
		await expect(page.locator('ol.turns > li')).toHaveCount(3);

		// Listed, and on the home screen's card.
		await page.goto('/daydreams');
		await expect(page.getByRole('link', { name: /Late meeting/ })).toBeVisible();
		await page.goto('/home');
		await expect(page.getByRole('link', { name: 'Daydreams' })).toBeVisible();
		await expect(page.getByText('Late meeting')).toBeVisible();
	});

	test('a failed reply says so, and trying again answers', async ({ page }) => {
		const who = account('Dreamer');
		await signUp(page, who);
		await grantDaydreams(who.email);
		await startDaydream(page);
		await expect(page.getByText('Mara looks up as you come in.')).toBeVisible();

		// Unique per run: the stub fails each `[fail]` turn only the first time.
		const said = `[fail] I knock, ${randomUUID().slice(0, 8)}.`;
		await reply(page, said);
		await expect(page.getByText('The reply could not be written just now')).toBeVisible();
		// What the user said is kept in the scene, not lost with the reply.
		await expect(page.locator('ol.turns li.user')).toContainText(said);

		await clickWaButton(page, 'Try again');
		await expect(page.getByText(`Mara heard: "${said}"`)).toBeVisible();
	});

	test('what is being written survives a reload', async ({ page }) => {
		const who = account('Dreamer');
		await signUp(page, who);
		await grantDaydreams(who.email);
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
		const who = account('Dreamer');
		await signUp(page, who);
		await grantDaydreams(who.email);
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
		page.once('dialog', (dialog) => void dialog.accept());
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
