import { expect, type Page } from '@playwright/test';
import { sql } from './db';
import { test } from './fixtures';
import {
	account,
	clickWaButton,
	linkAccounts,
	newAccount,
	newAccounts,
	newSide,
	signUp,
	waitForHydration
} from './helpers';

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

/**
 * One context of a kink, or a kink without a role pair, by the name its dots
 * are grouped under: "Spanking, giving", "Romance and affection".
 */
function scale(page: Page, name: string) {
	return page.getByRole('group', { name, exact: true });
}

async function answer(page: Page, name: string, level: string) {
	await scale(page, name).getByRole('radio', { name: level, exact: true }).click();
}

/** Opens a kink's row: its name is the button, followed by any flags. */
async function openRow(page: Page, name: string) {
	await page
		.getByRole('button', { name: new RegExp(`^${name}\\b`) })
		.first()
		.click();
}

test('an answer is saved, sealed, and still there after a reload', async ({ page }) => {
	const ada = account('Ada');
	await newAccount(page, ada);
	await openList(page);

	// Every category is on the one page, open.
	await answer(page, 'Spanking, giving', 'Like');
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
	await expect(scale(page, 'Spanking, giving').getByRole('radio', { name: 'Like' })).toBeChecked();
	await expect(
		scale(page, 'Spanking, receiving').getByRole('radio', { checked: true })
	).toHaveCount(0);
});

test('a role kink’s two contexts sit side by side when there is room', async ({ page }) => {
	// The rows are a size container, which a page column that shrinks to fit
	// its content collapsed: every pair stacked, however wide the window.
	await page.setViewportSize({ width: 1280, height: 900 });
	await newAccount(page, account('Wren'));
	await openList(page);
	const giving = await scale(page, 'Spanking, giving').boundingBox();
	const receiving = await scale(page, 'Spanking, receiving').boundingBox();
	expect(giving && receiving && Math.abs(giving.y - receiving.y)).toBeLessThan(1);
	expect(giving && receiving && receiving.x > giving.x + giving.width).toBe(true);
});

test('a category folds away and opens again', async ({ page }) => {
	await newAccount(page, account('Ivy'));
	await openList(page);
	await expect(scale(page, 'Spanking, giving')).toBeVisible();
	await page.locator('#category-impact').getByText('Impact play', { exact: true }).click();
	await expect(scale(page, 'Spanking, giving')).toBeHidden();
	await page.getByRole('button', { name: 'Expand all' }).click();
	await expect(scale(page, 'Spanking, giving')).toBeVisible();
});

test('your side hides the contexts that lean the other way', async ({ page }) => {
	await newAccount(page, account('Kit'));
	await openList(page);
	await page.getByRole('radio', { name: 'Sub', exact: true }).check();
	await expect(scale(page, 'Spanking, receiving')).toBeVisible();
	await expect(scale(page, 'Spanking, giving')).toHaveCount(0);
	// Neutral kinks keep both.
	await expect(scale(page, 'Kissing, giving')).toBeVisible();
	await saved(page);
	await page.reload();
	await waitForHydration(page);
	await expect(page.getByRole('radio', { name: 'Sub', exact: true })).toBeChecked();
});

test('search finds a kink by another name', async ({ page }) => {
	await newAccount(page, account('Bea'));
	await openList(page);
	await page.locator('wa-input[type="search"] input').fill('fellatio');
	// Found in its own category, with the rest of the list narrowed away.
	await expect(
		page.locator('#category-oral').getByRole('group', { name: 'Blowjobs, giving', exact: true })
	).toBeVisible();
	await expect(scale(page, 'Kissing, giving')).toHaveCount(0);
});

test('a related kink answered in one category shows the same answer in its own', async ({
	page
}) => {
	await newAccount(page, account('Cai'));
	await openList(page);
	const anal = page.locator('#category-anal');
	await anal.getByRole('button', { name: /related kinks?\b/ }).click();
	await anal
		.getByRole('group', { name: 'Rimming, giving', exact: true })
		.getByRole('radio', { name: 'Love', exact: true })
		.click();
	await saved(page);

	await expect(
		page
			.locator('#category-oral')
			.getByRole('group', { name: 'Rimming, giving', exact: true })
			.getByRole('radio', { name: 'Love' })
	).toBeChecked();
});

test.describe('quick fill', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('triage, a swipe, a button, and a whole category ruled out', async ({ page }) => {
		await newAccount(page, account('Dee'));
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

		// The whole list shows them, on both sides — a card answers for both
		// unless one is picked — and Oral's kinks carry the category's limit.
		await page.getByRole('link', { name: 'Back to kink list' }).click();
		for (const side of ['giving', 'receiving']) {
			await expect(
				scale(page, `Handjobs, ${side}`).getByRole('radio', { name: 'Like' })
			).toBeChecked();
			await expect(
				scale(page, `Fingering, ${side}`).getByRole('radio', { name: 'Hard limit' })
			).toBeChecked();
		}
		// Inherited, so a dashed ring whose tooltip says where it is from.
		await expect(
			scale(page, 'Blowjobs, giving').locator('label', {
				has: page.getByRole('radio', { name: 'Hard limit' })
			})
		).toHaveAttribute('title', 'Hard limit, from "Oral": hard limit everything');
	});
});

test.describe('without an account', () => {
	/** Both sides, so a list compared with a copy of itself matches: my giving, their receiving. */
	async function answerSpanking(page: Page, path: string) {
		await page.goto(path);
		await waitForHydration(page);
		await answer(page, 'Spanking, giving', 'Like');
		await answer(page, 'Spanking, receiving', 'Like');
		await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	}

	async function makeLink(page: Page, name: string): Promise<string> {
		await page.goto('/kink-list');
		await waitForHydration(page);
		await clickWaButton(page, 'Share');
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
			scale(page, 'Spanking, giving').getByRole('radio', { name: 'Like' })
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
		// Brought in by a store of its own, after this page's opened: a fresh load shows it.
		await openList(page);
		await expect(
			scale(page, 'Spanking, giving').getByRole('radio', { name: 'Like' })
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

		await newAccount(page, account('Gus'));
		await page.goto('/kink-list/quick');
		await expect(page).toHaveURL(/\/playroom\/kink-list\/quick$/);

		await openList(page);
		await answer(page, 'Spanking, giving', 'Love');
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
	await newAccount(page, account('Hal'));
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

	await openList(page);
	await expect(
		scale(page, 'Romance and affection').getByRole('radio', { name: 'Love' })
	).toBeChecked();
});

test.describe('with a partner', () => {
	test('a shared list follows your own, overrides and holds back for one partner, and compares', async ({
		browser
	}) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');
		try {
			await newAccounts(ada, jun);
			await linkAccounts(ada, jun);
			const partnershipId = new URL(jun.page.url()).pathname.split('/').at(-1) ?? '';
			const partnerList = `/playroom/kink-list/partner/${partnershipId}`;

			// Ada's own list: spanking Like, caning a hard limit.
			await openList(ada.page);
			await answer(ada.page, 'Spanking, giving', 'Like');
			await answer(ada.page, 'Caning, giving', 'Hard limit');
			await saved(ada.page);

			// Shared with Jun, then Love just for him, and Caning kept from him.
			await ada.page.goto(partnerList);
			await waitForHydration(ada.page);
			await clickWaButton(ada.page, 'Share my list with Jun');
			await expect(ada.page.getByRole('heading', { name: 'Your list for Jun' })).toBeVisible();
			// Control is shared: nothing is narrowed to one side.
			await expect(ada.page.getByRole('radio', { name: 'Both', exact: true })).toBeChecked();
			await answer(ada.page, 'Spanking, giving', 'Love');
			await openRow(ada.page, 'Spanking');
			await expect(ada.page.getByText('Just for Jun', { exact: true })).toBeVisible();
			await openRow(ada.page, 'Caning');
			await ada.page
				.locator('.kink', { has: scale(ada.page, 'Caning, giving') })
				.getByRole('checkbox', { name: "Don't show Jun this yet" })
				.check();
			// Flogging was never answered on her own list: it goes there, not to Jun's copy.
			await answer(ada.page, 'Flogging, giving', 'Like');
			await saved(ada.page);

			await openList(ada.page);
			await expect(
				scale(ada.page, 'Spanking, giving').getByRole('radio', { name: 'Like' })
			).toBeChecked();
			await expect(
				scale(ada.page, 'Flogging, giving').getByRole('radio', { name: 'Like' })
			).toBeChecked();

			// Jun shares his: being spanked, Love — the half that fits Ada's spanking.
			await openList(jun.page);
			await answer(jun.page, 'Spanking, receiving', 'Love');
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
		await newAccounts(ada, jun);
		await linkAccounts(ada, jun);
		const partnershipId = new URL(jun.page.url()).pathname.split('/').at(-1) ?? '';
		await ada.page.goto(`/playroom/kink-list/partner/${partnershipId}`);
		await waitForHydration(ada.page);
		await expect(ada.page.getByText('Start your own kink list first.')).toBeVisible();
		await expect(ada.page.locator('wa-button', { hasText: 'Share my list with Jun' })).toHaveCount(
			0
		);

		await openList(ada.page);
		await answer(ada.page, 'Spanking, giving', 'Like');
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
	await newAccount(page, eve);
	await openList(page);
	// Nothing kept yet: no History to offer.
	await expect(page.getByRole('link', { name: 'History' })).toHaveCount(0);

	await answer(page, 'Spanking, giving', 'Like');
	await saved(page);

	// A week and a day without changes, without waiting for one.
	const eightDays = 8 * 24 * 60 * 60 * 1000;
	await sql(
		`update kink_lists set edited_at = edited_at - ?, created_at = created_at - ?
		 where owner_id = (select id from user where email = ?)`,
		[eightDays, eightDays, eve.email]
	);

	await answer(page, 'Spanking, giving', 'Love');
	await saved(page);

	const { rows } = await sql(
		`select kink_list_versions.ciphertext from kink_list_versions
		 join kink_lists on kink_lists.id = kink_list_versions.list_id
		 join user on user.id = kink_lists.owner_id where user.email = ?`,
		[eve.email]
	);
	expect(rows).toHaveLength(1);
	expect(String(rows[0]?.ciphertext)).toMatch(/^sb1\./);

	// History is offered from the next load after a version is kept.
	await openList(page);
	await page.getByRole('link', { name: 'History' }).click();
	await expect(page.getByRole('heading', { name: 'Versions (1)' })).toBeVisible();
	const moreInto = page.getByRole('region', { name: 'More into (1)' });
	await expect(moreInto.getByText('Spanking (Giving)', { exact: true })).toBeVisible();
	await expect(moreInto.getByText('Like → Love')).toBeVisible();

	await moreInto.getByRole('button', { name: 'Over time for Spanking' }).click();
	await expect(moreInto.getByRole('listitem').filter({ hasText: /^\s*Now/ })).toContainText('Love');
});

test('a partner view starts on the side who is in control puts you on', async ({ browser }) => {
	const ada = await newSide(browser, 'Ada');
	const jun = await newSide(browser, 'Jun');
	try {
		await newAccounts(ada, jun);
		// Ada is in control: with Jun, she is on the dom side.
		await linkAccounts(ada, jun, 'me');
		const partnershipId = new URL(jun.page.url()).pathname.split('/').at(-1) ?? '';
		await openList(ada.page);
		await answer(ada.page, 'Spanking, giving', 'Like');
		await saved(ada.page);
		// Her own list is not narrowed: that is a choice she has not made.
		await expect(ada.page.getByRole('radio', { name: 'Both', exact: true })).toBeChecked();

		await ada.page.goto(`/playroom/kink-list/partner/${partnershipId}`);
		await waitForHydration(ada.page);
		await clickWaButton(ada.page, 'Share my list with Jun');
		await expect(ada.page.getByRole('radio', { name: 'Dom', exact: true })).toBeChecked();
		await expect(ada.page.getByText("Set from who's in control")).toBeVisible();
		await expect(scale(ada.page, 'Spanking, giving')).toBeVisible();
		await expect(scale(ada.page, 'Spanking, receiving')).toHaveCount(0);

		// Changing it lasts for the visit, and leaves her own list's alone.
		await ada.page.getByRole('radio', { name: 'Both', exact: true }).check();
		await expect(scale(ada.page, 'Spanking, receiving')).toBeVisible();
	} finally {
		await ada.close();
		await jun.close();
	}
});
