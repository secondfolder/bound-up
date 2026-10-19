import { expect, type Page } from '@playwright/test';
import { sql } from './db';
import { test } from './fixtures';
import { account, signUp, waitForHydration } from './helpers';

/**
 * The kink list, signed in: answering, search, related kinks, and that what
 * is saved is sealed. See docs/kink-list.md.
 */

async function openList(page: Page, path = '/playroom/kink-list') {
	await page.goto(path);
	await waitForHydration(page);
	// The list opens in the person's own vault: a placeholder until then.
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
}

async function saved(page: Page) {
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
}

test('an answer is saved, sealed, and still there after a reload', async ({ page }) => {
	const ada = account('Ada');
	await signUp(page, ada);
	await openList(page);

	await page.getByRole('link', { name: /Impact play/ }).click();
	const spanking = page.getByRole('group', { name: 'Spanking', exact: true });
	await spanking.getByText('Like', { exact: true }).click();
	await saved(page);

	// The server holds one sealed record, and nothing it could read.
	const { rows } = await sql(
		`select kink_lists.ciphertext, kink_lists.scope from kink_lists
		 join user on user.id = kink_lists.owner_id where user.email = ?`,
		[ada.email]
	);
	expect(rows).toHaveLength(1);
	expect(rows[0]?.scope).toBe('self');
	expect(String(rows[0]?.ciphertext)).toMatch(/^sb1\./);
	expect(String(rows[0]?.ciphertext)).not.toContain('spanking');

	await page.reload();
	await waitForHydration(page);
	await expect(
		page.getByRole('group', { name: 'Spanking', exact: true }).getByRole('radio', { name: 'Like' })
	).toBeChecked();
});

test('search finds a kink by another name', async ({ page }) => {
	await signUp(page, account('Bea'));
	await openList(page);
	await page.locator('wa-input[type="search"] input').fill('fellatio');
	await expect(page.getByRole('group', { name: 'Blowjobs', exact: true })).toBeVisible();
});

test('a related kink answered in one category shows the same answer in its own', async ({
	page
}) => {
	await signUp(page, account('Cai'));
	await openList(page, '/playroom/kink-list/anal');
	await page.getByRole('button', { name: /related kinks/ }).click();
	await page
		.getByRole('group', { name: 'Rimming', exact: true })
		.getByText('Love', { exact: true })
		.click();
	await saved(page);

	await page.getByRole('link', { name: 'All categories' }).click();
	await page.getByRole('link', { name: /^Oral/ }).click();
	await expect(
		page.getByRole('group', { name: 'Rimming', exact: true }).getByRole('radio', { name: 'Love' })
	).toBeChecked();
});

test.describe('quick fill', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('triage, a swipe, a button, and a whole category ruled out', async ({ page }) => {
		await signUp(page, account('Dee'));
		await page.goto('/playroom/kink-list/quick');
		await waitForHydration(page);

		// Tap Intimacy out, and rule Oral out wholesale.
		await page.getByRole('button', { name: /^Intimacy and affection/ }).click();
		await expect(page.getByRole('button', { name: /^Intimacy and affection/ })).toHaveAttribute(
			'aria-pressed',
			'false'
		);
		await page.getByRole('button', { name: 'Hard limit everything here (Oral)' }).click();
		await page.locator('wa-button', { hasText: /^Start/ }).click();

		// The first card is now the first kink in Hands and touch.
		const card = page.locator('article.card');
		await expect(card.getByRole('heading', { name: 'Handjobs' })).toBeVisible();

		// Swipe right: Like.
		const box = await card.boundingBox();
		if (!box) {
			throw new Error('no card');
		}
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 4 });
		await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2, { steps: 4 });
		await page.mouse.up();
		await expect(card.getByRole('heading', { name: 'Fingering' })).toBeVisible();

		// A button: Hard limit.
		await page.locator('wa-button', { hasText: /^Hard limit/ }).click();
		await expect(card.getByRole('heading', { name: 'Clit stimulation' })).toBeVisible();
		await saved(page);

		// The whole list shows them, and Oral's kinks carry the category's limit.
		await page.getByRole('link', { name: 'Whole list' }).click();
		await page.getByRole('link', { name: /Hands and touch/ }).click();
		await expect(
			page
				.getByRole('group', { name: 'Handjobs', exact: true })
				.getByRole('radio', { name: 'Like' })
		).toBeChecked();
		await expect(
			page
				.getByRole('group', { name: 'Fingering', exact: true })
				.getByRole('radio', { name: 'Hard limit' })
		).toBeChecked();
		await page.getByRole('link', { name: 'All categories' }).click();
		await page.getByRole('link', { name: /^Oral/ }).click();
		await expect(
			page.getByText('Hard limit, from "Oral": hard limit everything').first()
		).toBeVisible();
	});
});
