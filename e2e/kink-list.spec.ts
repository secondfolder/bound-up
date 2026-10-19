import { expect, type Page } from '@playwright/test';
import { sql } from './db';
import { test } from './fixtures';
import { account, clickWaButton, signUp, waitForHydration } from './helpers';

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

test.describe('without an account', () => {
	async function answerSpanking(page: Page, path: string) {
		await page.goto(`${path}/impact`);
		await waitForHydration(page);
		await page
			.getByRole('group', { name: 'Spanking', exact: true })
			.getByText('Like', { exact: true })
			.click();
		await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
	}

	async function makeLink(page: Page, name: string): Promise<string> {
		await page.goto('/kink-list');
		await waitForHydration(page);
		await page.getByText('Share a link to your list', { exact: true }).click();
		// By role: Svelte sets a wa-input's label as a property, not an attribute.
		await page.getByRole('textbox', { name: 'Your name on it (optional)' }).fill(name);
		await clickWaButton(page, 'Make a link');
		const field = page.getByRole('textbox', { name: 'Your link' });
		await expect(field).toHaveValue(/#k1\./);
		return await field.inputValue();
	}

	test('keeps a list on the device, and shares it as a link anyone can open', async ({
		page,
		browser
	}) => {
		await answerSpanking(page, '/kink-list');
		await page.reload();
		await waitForHydration(page);
		await expect(
			page
				.getByRole('group', { name: 'Spanking', exact: true })
				.getByRole('radio', { name: 'Like' })
		).toBeChecked();

		const link = await makeLink(page, 'Ada');
		// The answers are after the #, which never reaches the server.
		expect(new URL(link).hash).toMatch(/^#k1\./);

		const stranger = await browser.newContext();
		try {
			const other = await stranger.newPage();
			await other.goto(link);
			await waitForHydration(other);
			await expect(other.getByRole('heading', { name: 'Ada’s kink list' })).toBeVisible();
			await expect(other.getByText('Spanking', { exact: true })).toBeVisible();
			// Nothing on that device to compare with.
			await expect(other.locator('wa-button', { hasText: 'Compare with mine' })).toHaveCount(0);
		} finally {
			await stranger.close();
		}

		// On a device with a list of its own, the two can be compared.
		await page.goto(link);
		await waitForHydration(page);
		await page.locator('wa-button', { hasText: 'Compare with mine' }).click();
		await expect(page.getByRole('heading', { name: /You both want this/ })).toBeVisible();
	});

	test('the answers on the device join the account at sign-up', async ({ page }) => {
		await answerSpanking(page, '/kink-list');
		await signUp(page, account('Eve'), '/signup?redirectTo=/playroom/kink-list');
		await expect(page).toHaveURL(/\/playroom\/kink-list$/);
		await expect(page.getByText(/Added the answer saved on this device/)).toBeVisible();
		await page.goto('/playroom/kink-list/impact');
		await waitForHydration(page);
		await expect(
			page
				.getByRole('group', { name: 'Spanking', exact: true })
				.getByRole('radio', { name: 'Like' })
		).toBeChecked();
		expect(await page.evaluate(() => localStorage.getItem('kink-list.device'))).toBeNull();
	});

	test('signed in, the public list sends you to your own, and a shared link compares with it', async ({
		page,
		browser
	}) => {
		const sharer = await browser.newContext();
		let link: string;
		try {
			const other = await sharer.newPage();
			await answerSpanking(other, '/kink-list');
			link = await makeLink(other, 'Fin');
		} finally {
			await sharer.close();
		}

		await signUp(page, account('Gus'));
		await page.goto('/kink-list/quick');
		await expect(page).toHaveURL(/\/playroom\/kink-list\/quick$/);

		await page.goto('/playroom/kink-list/impact');
		await waitForHydration(page);
		await page
			.getByRole('group', { name: 'Spanking', exact: true })
			.getByText('Love', { exact: true })
			.click();
		await saved(page);

		await page.goto(link);
		await waitForHydration(page);
		await page.locator('wa-button', { hasText: 'Compare with mine' }).click();
		await expect(page).toHaveURL(/\/playroom\/kink-list\/compare#k1\./);
		await expect(page.getByRole('heading', { name: 'You and Fin' })).toBeVisible();
		await expect(page.getByRole('heading', { name: /You both want this/ })).toBeVisible();
	});
});
