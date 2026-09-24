import { expect } from '@playwright/test';
import { test } from './fixtures';
import {
	clickWaButton,
	deviceHoldsKey,
	fillPassword,
	linkAccounts,
	newSide,
	openBoard,
	signUp,
	waitForHydration,
	writeThread
} from './helpers';

/**
 * Partner-assisted sign-in, from both ends, with the real key exchange.
 *
 * Someone who has lost every way into their account asks from the login page;
 * their partner compares a code and re-encrypts the history the two of them
 * share to the new key; and that approval lets them back in. Only this level
 * sees all three browsers at once — the requester, the partner, and the lost
 * device that must be signed out. See docs/account-recovery.md.
 */

test.describe('partner-assisted sign-in', () => {
	test('a partner vouches for someone who lost every way in, and their history comes back', async ({
		browser
	}) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');
		// Ada's replacement device: a fresh browser, with nothing of hers in it.
		const fresh = await browser.newContext();
		const secret = 'written before Ada lost everything';
		const newPassword = 'vocalist-hazy-radar-plunge';
		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await linkAccounts(ada, jun);

			await jun.page.goto('/home');
			await openBoard(jun.page, ada.who.name);
			await writeThread(jun.page, secret);
			const threadPath = new URL(jun.page.url()).pathname;

			// ── Ada, on the new device ─────────────────────────────────────────
			const requester = await fresh.newPage();
			await requester.goto('/login');
			await waitForHydration(requester);
			await requester.getByRole('link', { name: 'Forgot password' }).click();
			await requester.waitForURL('/login/recover');
			await waitForHydration(requester);
			await requester.locator('wa-input[data-field="recoverEmail"] input').fill(ada.who.email);
			await fillPassword(requester, 'newPassword', newPassword);
			await fillPassword(requester, 'confirmPassword', newPassword);
			await clickWaButton(requester, 'Ask my partner');

			const requesterCode = requester.locator('.safety .number');
			await expect(requesterCode).toBeVisible({ timeout: 15_000 });
			const code = await requesterCode.textContent();

			// ── Jun, wherever they happen to be ────────────────────────────────
			await jun.page.goto('/home');
			await expect(jun.page.getByTestId('help-request')).toContainText(
				`${ada.who.name} can't sign in and asked for your help`
			);
			await jun.page.getByRole('link', { name: `Help ${ada.who.name} sign in` }).click();
			const request = jun.page.getByTestId('restore-request');
			await expect(request).toBeVisible();
			// The code Jun compares is the one Ada reads out.
			await expect(request.locator('.safety .number')).toHaveText(code ?? '');
			await clickWaButton(jun.page, 'The code matches — help them');
			await expect(request).toHaveCount(0);
			// No "key changed" warning about the change Jun just vouched for — not
			// even while the server still serves Ada's old key.
			await expect(jun.page.getByText(/message key has changed/)).toHaveCount(0);

			// ── Ada is let in, with the history readable ───────────────────────
			await requester.waitForURL('/home', { timeout: 20_000 });
			expect(await deviceHoldsKey(requester)).toBe(true);
			await requester.goto(threadPath);
			await expect(requester.getByText(secret)).toBeVisible();

			// ── and the lost device is signed out ──────────────────────────────
			await ada.page.goto('/home');
			await ada.page.waitForURL((url) => url.pathname === '/login');

			// Jun can still write to her: the new key was vouched for, not "changed".
			await jun.page.goto(threadPath);
			await expect(jun.page.getByText(/message key has changed/)).toHaveCount(0);
		} finally {
			await fresh.close();
			await ada.close();
			await jun.close();
		}
	});

	/** A mismatched code stops everything, and the requester is told. */
	test('a partner who says the code does not match stops it', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');
		const fresh = await browser.newContext();
		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await linkAccounts(ada, jun);

			const requester = await fresh.newPage();
			await requester.goto('/login/recover');
			await waitForHydration(requester);
			await requester.locator('wa-input[data-field="recoverEmail"] input').fill(ada.who.email);
			await fillPassword(requester, 'newPassword', 'vocalist-hazy-radar-plunge');
			await fillPassword(requester, 'confirmPassword', 'vocalist-hazy-radar-plunge');
			await clickWaButton(requester, 'Ask my partner');
			await expect(requester.locator('.safety .number')).toBeVisible({ timeout: 15_000 });

			await jun.page.goto('/home');
			await jun.page.getByRole('link', { name: `Help ${ada.who.name} sign in` }).click();
			await clickWaButton(jun.page, "It doesn't match");

			await expect(requester.getByText(/said the code did not match/)).toBeVisible({
				timeout: 15_000
			});
			// Nothing changed: Ada's own session still works.
			await ada.page.goto('/home');
			expect(new URL(ada.page.url()).pathname).toBe('/home');
		} finally {
			await fresh.close();
			await ada.close();
			await jun.close();
		}
	});

	/** Nothing on the page says whether the email had an account. */
	test('looks the same for an email with no account', async ({ page }) => {
		await page.goto('/login/recover');
		await waitForHydration(page);
		await page.locator('wa-input[data-field="recoverEmail"] input').fill('nobody@example.test');
		await fillPassword(page, 'newPassword', 'vocalist-hazy-radar-plunge');
		await fillPassword(page, 'confirmPassword', 'vocalist-hazy-radar-plunge');
		await clickWaButton(page, 'Ask my partner');

		await expect(page.locator('.safety .number')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText(/Waiting for your partner/)).toBeVisible();
	});
});
