import { expect, type Page } from '@playwright/test';
import { sql } from './db';
import { test } from './fixtures';
import { account, clickWaButton, linkAccounts, newSide, signUp, waitForHydration } from './helpers';

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

test('imports a KinkSheet link, exports the list, and reads the export back', async ({ page }) => {
	await signUp(page, account('Hal'));
	const sheet = (await import('../src/lib/kink-list/import/lists/kinksheet.json', {
		with: { type: 'json' }
	})) as { default: { levels: unknown[]; categories: { items: unknown[]; columns: unknown[] }[] } };
	const { encodeKinklistHash } = await import('../src/lib/kink-list/import/kinklist-hash');
	const positions = sheet.default.categories.reduce(
		(sum, category) => sum + category.items.length * category.columns.length,
		0
	);
	const values = new Array<number>(positions).fill(0);
	values[0] = 1; // Romance / Affection: Favorite
	const link = `https://kinksheet.com/#${encodeKinklistHash(values, sheet.default.levels.length)}`;

	await page.goto('/playroom/kink-list/transfer');
	await waitForHydration(page);
	await page.getByRole('textbox', { name: 'A link to a kink list' }).fill(link);
	await clickWaButton(page, 'Read link');
	await expect(page.getByRole('heading', { name: 'From KinkSheet' })).toBeVisible();
	await clickWaButton(page, 'Import');
	await expect(page.getByText('Imported: 1 new answer.')).toBeVisible();
	await saved(page);

	const download = page.waitForEvent('download');
	await clickWaButton(page, 'Everything (JSON)');
	const file = await (await download).path();
	const { readFileSync } = await import('node:fs');
	const exported = JSON.parse(readFileSync(file, 'utf8')) as {
		format: string;
		list: { answers: Partial<Record<string, { level?: string }>> };
	};
	expect(exported.format).toBe('bound-up-kink-list');
	expect(exported.list.answers.romance?.level).toBe('love');

	await page.locator('input[type="file"]').setInputFiles(file);
	// Playwright saves a download under a name of its own, which the preview shows.
	await expect(page.getByRole('heading', { name: /^From / })).toBeVisible();
	await expect(page.getByText('1 answer for kinks on this list.')).toBeVisible();

	await page.goto('/playroom/kink-list/intimacy');
	await waitForHydration(page);
	await expect(
		page
			.getByRole('group', { name: 'Romance and affection', exact: true })
			.getByRole('radio', { name: 'Love' })
	).toBeChecked();
});

test.describe('with a partner', () => {
	async function answer(page: Page, kink: string, level: string) {
		await page
			.getByRole('group', { name: kink, exact: true })
			.getByText(level, { exact: true })
			.click();
	}

	test('a shared list follows your own, overrides and holds back for one partner, and compares', async ({
		browser
	}) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');
		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await linkAccounts(ada, jun);
			const partnershipId = new URL(jun.page.url()).pathname.split('/').at(-1) ?? '';
			const partnerList = `/playroom/kink-list/partner/${partnershipId}`;

			// Ada's own list: Spanking Like, Caning a hard limit.
			await ada.page.goto('/playroom/kink-list/impact');
			await waitForHydration(ada.page);
			await answer(ada.page, 'Spanking', 'Like');
			await answer(ada.page, 'Caning', 'Hard limit');
			await saved(ada.page);

			// Shared with Jun, then Love just for him, and Caning kept from him.
			await ada.page.goto(partnerList);
			await waitForHydration(ada.page);
			await clickWaButton(ada.page, 'Share my list with Jun');
			await expect(ada.page.getByRole('heading', { name: 'Your list for Jun' })).toBeVisible();
			await ada.page.getByRole('link', { name: /Impact play/ }).click();
			await answer(ada.page, 'Spanking', 'Love');
			await expect(ada.page.getByText('Just for Jun')).toBeVisible();
			await ada.page.getByRole('button', { name: 'More detail and notes for Caning' }).click();
			await ada.page.getByRole('checkbox', { name: "Don't show Jun this yet" }).check();
			// Flogging was never answered on her own list: it goes there, not to Jun's copy.
			await answer(ada.page, 'Flogging', 'Like');
			await saved(ada.page);

			await ada.page.goto('/playroom/kink-list/impact');
			await waitForHydration(ada.page);
			await expect(
				ada.page
					.getByRole('group', { name: 'Spanking', exact: true })
					.getByRole('radio', { name: 'Like' })
			).toBeChecked();
			await expect(
				ada.page
					.getByRole('group', { name: 'Flogging', exact: true })
					.getByRole('radio', { name: 'Like' })
			).toBeChecked();

			// Jun shares his: Spanking Love.
			await jun.page.goto('/playroom/kink-list/impact');
			await waitForHydration(jun.page);
			await answer(jun.page, 'Spanking', 'Love');
			await saved(jun.page);
			await jun.page.goto(partnerList);
			await waitForHydration(jun.page);
			await clickWaButton(jun.page, 'Share my list with Ada');
			await expect(jun.page.getByRole('heading', { name: 'Your list for Ada' })).toBeVisible();

			// Jun sees Ada's answer for him, and not what she kept back.
			await jun.page.goto(`${partnerList}/compare`);
			await waitForHydration(jun.page);
			const both = jun.page.getByRole('region', { name: /You both want this/ });
			await expect(both.getByText('Spanking', { exact: true }).first()).toBeVisible();
			const limits = jun.page.getByRole('region', { name: 'Ada’s hard limits' });
			await expect(limits).toBeVisible();
			await expect(limits.getByText(/Caning/)).toHaveCount(0);

			// Blind comparing, turned on by Ada, applies to Jun's view too.
			await ada.page.goto(partnerList);
			await waitForHydration(ada.page);
			await ada.page.locator('wa-switch', { hasText: 'Blind comparing' }).click();
			await saved(ada.page);
			await jun.page.reload();
			await waitForHydration(jun.page);
			await expect(jun.page.getByText('Blind comparing is on')).toBeVisible();
		} finally {
			await ada.close();
			await jun.close();
		}
	});
});

test('a partner view starts you on your own list before offering to share it', async ({
	browser
}) => {
	const ada = await newSide(browser, 'Ada');
	const jun = await newSide(browser, 'Jun');
	try {
		await signUp(ada.page, ada.who);
		await signUp(jun.page, jun.who);
		await linkAccounts(ada, jun);
		const partnershipId = new URL(jun.page.url()).pathname.split('/').at(-1) ?? '';
		await ada.page.goto(`/playroom/kink-list/partner/${partnershipId}`);
		await waitForHydration(ada.page);
		await expect(ada.page.getByText('Start your own kink list first.')).toBeVisible();
		await expect(ada.page.locator('wa-button', { hasText: 'Share my list with Jun' })).toHaveCount(
			0
		);

		await ada.page.goto('/playroom/kink-list/impact');
		await waitForHydration(ada.page);
		await ada.page
			.getByRole('group', { name: 'Spanking', exact: true })
			.getByText('Like', { exact: true })
			.click();
		await saved(ada.page);
		await ada.page.goto(`/playroom/kink-list/partner/${partnershipId}`);
		await waitForHydration(ada.page);
		await expect(
			ada.page.locator('wa-button', { hasText: 'Share my list with Jun' })
		).toBeVisible();
	} finally {
		await ada.close();
		await jun.close();
	}
});

test('a week without changes keeps a version, and history shows what moved', async ({ page }) => {
	const eve = account('Eve');
	await signUp(page, eve);
	await openList(page);

	await page.getByRole('link', { name: /Impact play/ }).click();
	const spanking = page.getByRole('group', { name: 'Spanking', exact: true });
	await spanking.getByText('Like', { exact: true }).click();
	await saved(page);

	// A week and a day without changes, without waiting for one.
	const eightDays = 8 * 24 * 60 * 60 * 1000;
	await sql(
		`update kink_lists set edited_at = edited_at - ?, created_at = created_at - ?
		 where owner_id = (select id from user where email = ?)`,
		[eightDays, eightDays, eve.email]
	);

	await spanking.getByText('Love', { exact: true }).click();
	await saved(page);

	const { rows } = await sql(
		`select kink_list_versions.ciphertext from kink_list_versions
		 join kink_lists on kink_lists.id = kink_list_versions.list_id
		 join user on user.id = kink_lists.owner_id where user.email = ?`,
		[eve.email]
	);
	expect(rows).toHaveLength(1);
	expect(String(rows[0]?.ciphertext)).toMatch(/^sb1\./);

	await page.getByRole('link', { name: 'All categories' }).click();
	await page.getByRole('link', { name: 'See how your list has changed' }).click();
	await expect(page.getByRole('heading', { name: 'Versions (1)' })).toBeVisible();
	const moreInto = page.getByRole('region', { name: 'More into (1)' });
	await expect(moreInto.getByText('Spanking', { exact: true })).toBeVisible();
	await expect(moreInto.getByText('Like → Love')).toBeVisible();

	await moreInto.getByRole('button', { name: 'Over time for Spanking' }).click();
	await expect(moreInto.getByRole('listitem').filter({ hasText: /^\s*Now/ })).toContainText('Love');
});
