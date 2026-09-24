import { expect } from '@playwright/test';
import { test } from './fixtures';
import {
	account,
	clickWaButton,
	deviceHoldsKey,
	evictKeyStorage,
	expectSentToSignIn,
	fillPassword,
	fillWaInput,
	logInHere,
	signUp,
	uniqueEmail,
	waitForEnhancedForm
} from './helpers';

test.describe('settings information architecture', () => {
	/**
	 * Signing in is what unlocks, so there is nothing to set up, unlock or
	 * lock — and no settings page for it.
	 */
	test('lists account, security and partners, and nothing about encryption', async ({ page }) => {
		const ada = account('Ada');
		await signUp(page, ada);

		await page.goto('/settings');
		await expect(page.getByRole('link', { name: 'Account' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Security' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Partners' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Encrypted messages' })).toHaveCount(0);
		await expect(page.locator('.account').getByRole('button', { name: 'Log out' })).toBeVisible();
	});

	test('uses nested sub-pages for account and security', async ({ page }) => {
		const who = account('Nia');
		await signUp(page, who);

		await page.goto('/settings/account');
		await expect(page.getByRole('link', { name: 'Back to settings' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
		await expect(page.getByText(/Email changes are not available yet/)).toBeVisible();
		await expect(page.getByRole('link', { name: 'Open security settings' })).toBeVisible();

		await page.goto('/settings/security');
		await expect(page.getByRole('link', { name: 'Back to settings' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Security' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'This device' })).toBeVisible();

		// The old encrypted-messages page is gone, not hidden.
		const gone = await page.goto('/settings/encryption');
		expect(gone?.status()).toBe(404);
	});

	test('renames passkeys settings to security and redirects old deep links', async ({ page }) => {
		const who = account('Oren');
		await signUp(page, who);

		await page.goto('/settings/passkeys');
		await page.waitForURL('/settings/security');
		await expect(page.getByRole('heading', { name: 'Security' })).toBeVisible();
		await expect(
			page.getByText('Passkeys let you sign in with your device instead of a password.')
		).toBeVisible();
	});
});

test.describe('settings actions', () => {
	test('updates the account name from the account page', async ({ page }) => {
		const who = account('Pia');
		await signUp(page, who);

		await page.goto('/settings/account');
		await waitForEnhancedForm(page);
		await fillWaInput(page, 'name', 'Pia Newname');
		await Promise.all([
			page.waitForResponse(
				(response) =>
					response.request().method() === 'POST' && response.url().includes('/settings/account')
			),
			clickWaButton(page, 'Save account details')
		]);

		await page.goto('/settings');
		await expect(page.locator('.account .name')).toHaveText('Pia Newname');
	});

	/**
	 * The password re-seals the key as it changes, so the new one is what signs
	 * a cleared browser back in — and signing in is what brings the key back.
	 */
	test('changes the password from the security page, and the new one signs a cleared browser back in', async ({
		page
	}) => {
		const who = account('Quinn');
		const newPassword = 'vocalist-hazy-radar-plunge';

		await signUp(page, who);
		await page.goto('/settings/security');
		await waitForEnhancedForm(page);
		await fillPassword(page, 'oldPassword', who.password);
		await fillPassword(page, 'newPassword', newPassword);
		await fillPassword(page, 'newConfirm', newPassword);
		await clickWaButton(page, 'Change password');
		await expect(page.locator('wa-input[data-field="oldPassword"] input')).toHaveValue('');

		await evictKeyStorage(page);
		await page.goto('/home');
		await expectSentToSignIn(page, '/home');

		await logInHere(page, { ...who, password: newPassword });
		await page.waitForURL('/home');
		expect(await deviceHoldsKey(page)).toBe(true);
	});

	test('shows the read-only email explanation on the account page', async ({ page }) => {
		const who = { name: 'Rhea', email: uniqueEmail('rhea'), password: 'correct-horse-battery' };
		await signUp(page, who);

		await page.goto('/settings/account');
		await expect(page.getByText(who.email)).toBeVisible();
		await expect(page.getByText(/Email changes are not available yet/)).toBeVisible();
	});

	test('signs out from the signed-in panel on settings', async ({ page }) => {
		const who = account('Seth');
		await signUp(page, who);

		await page.goto('/settings');
		await expect(page.locator('.account').getByRole('button', { name: 'Log out' })).toBeVisible();
		await clickWaButton(page, 'Log out');
		await page.waitForURL('/');

		// Signing out forgets the key on this device, rather than leaving it for
		// whoever signs in next on the same browser.
		const cached = await page.evaluate(
			() =>
				new Promise<number>((resolve) => {
					const open = indexedDB.open('bound-up-keys');
					open.onsuccess = () => {
						const db = open.result;
						if (!db.objectStoreNames.contains('identity')) {
							resolve(0);
							return;
						}
						const count = db.transaction('identity').objectStore('identity').count();
						count.onsuccess = () => resolve(count.result);
					};
				})
		);
		expect(cached).toBe(0);
	});
});
