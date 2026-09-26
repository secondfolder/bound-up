import { createClient } from '@libsql/client';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { test } from './fixtures';
import { type Account, account, clickWaButton, logIn, logOut, newSide, signUp } from './helpers';
import { E2E_DATABASE_URL } from './run-paths';

/**
 * Sets an account's role straight in the database, then signs it in afresh.
 *
 * Straight in the database because the migrations make the first account of a
 * run an admin — whichever worker happens to sign up first — so no spec may
 * assume a fresh account's role; it sets the one it needs. Then a fresh sign-in
 * because Better Auth's session cookie cache carries the role for up to a
 * minute (`session.cookieCache` in src/lib/server/auth.ts), and the old session
 * would keep the old one until then.
 */
async function becomeRole(page: Page, who: Account, role: 'admin' | 'user') {
	const client = createClient({ url: E2E_DATABASE_URL, timeout: 5000 });
	try {
		await client.execute({
			sql: 'update user set role = ? where email = ?',
			args: [role, who.email]
		});
	} finally {
		client.close();
	}
	await logOut(page);
	await logIn(page, who);
}

async function guidesStatus(page: Page): Promise<number | undefined> {
	return (await page.goto('/home/guides'))?.status();
}

async function openAccount(admin: Page, who: Account) {
	await admin.goto(`/admin?q=${encodeURIComponent(who.email)}`);
	await admin.getByRole('link', { name: new RegExp(who.email) }).click();
	await expect(admin.getByRole('heading', { name: who.name })).toBeVisible();
}

test('an admin grants and revokes a feature, and makes another admin', async ({ browser }) => {
	const admin = await newSide(browser, 'Root');
	const ada = await newSide(browser, 'Ada');
	try {
		await signUp(admin.page, admin.who);
		await signUp(ada.page, ada.who);
		await becomeRole(admin.page, admin.who, 'admin');
		await becomeRole(ada.page, ada.who, 'user');

		// Without the feature: no card, and the pages refuse.
		await ada.page.goto('/home');
		await expect(ada.page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
		await expect(ada.page.getByRole('heading', { name: 'Guides' })).toHaveCount(0);
		expect(await guidesStatus(ada.page)).toBe(403);

		// Granted: read from the database per request, so it applies at once.
		await admin.page.goto('/settings');
		await admin.page.getByRole('link', { name: 'Admin' }).click();
		await admin.page.waitForURL('/admin');
		await openAccount(admin.page, ada.who);
		await clickWaButton(admin.page, 'Grant Guides');
		await expect(admin.page.getByRole('button', { name: 'Revoke Guides' })).toBeVisible();
		await expect(admin.page.getByText(`by ${admin.who.name}`)).toBeVisible();

		expect(await guidesStatus(ada.page)).toBe(200);
		await ada.page.goto('/home');
		await expect(ada.page.getByRole('heading', { name: 'Guides' })).toBeVisible();

		// Revoked: gone again.
		await clickWaButton(admin.page, 'Revoke Guides');
		await expect(admin.page.getByRole('button', { name: 'Grant Guides' })).toBeVisible();
		expect(await guidesStatus(ada.page)).toBe(403);

		// Made an admin: the Settings link appears once Ada's session picks up
		// the role, which a fresh sign-in does straight away.
		await clickWaButton(admin.page, 'Make admin');
		await expect(admin.page.getByRole('button', { name: 'Remove admin access' })).toBeVisible();
		await logOut(ada.page);
		await logIn(ada.page, ada.who);
		await ada.page.goto('/settings');
		await expect(ada.page.getByRole('link', { name: 'Admin' })).toBeVisible();

		// And an admin cannot take away their own access, so there is always one.
		await openAccount(admin.page, admin.who);
		await expect(admin.page.getByText('This account is an admin')).toBeVisible();
		await expect(admin.page.getByRole('button', { name: 'Remove admin access' })).toHaveCount(0);
	} finally {
		await admin.close();
		await ada.close();
	}
});

test('the admin pages are a 404 for anyone else', async ({ page }) => {
	const bo = account('Bo');
	await signUp(page, bo);
	await becomeRole(page, bo, 'user');

	expect((await page.goto('/admin'))?.status()).toBe(404);
	await page.goto('/settings');
	await expect(page.getByRole('link', { name: 'Partners' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
});
