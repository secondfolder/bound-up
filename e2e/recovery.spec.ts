import { expect } from '@playwright/test';
import { sql } from './db';
import { test } from './fixtures';
import {
	clickWaButton,
	deviceHoldsKey,
	fillPassword,
	linkAccounts,
	newAccounts,
	newSide,
	openBoard,
	waitForHydration,
	waitForKeyring,
	writeThread
} from './helpers';
import { linkIn, mailsTo, waitForMailTo } from './mail';

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
			await newAccounts(ada, jun);
			await linkAccounts(ada, jun);

			// Ada's device holds her own vault in escrow with Jun once it sees the
			// partnership. That escrow is what brings it back later.
			await ada.page.goto('/home');
			await waitForKeyring(ada.page);
			const ownVault = async () => {
				const { rows } = await sql(
					`SELECT v.id AS vaultId, e.id AS escrowId,
					        (SELECT COUNT(*) FROM vault_wraps w JOIN user_keys k ON k.user_id = w.user_id
					          WHERE w.vault_id = v.id AND w.for_recipient = k.recipient) AS usableWraps
					   FROM vaults v JOIN user u ON u.id = v.owner_user_id
					   LEFT JOIN vault_escrows e ON e.vault_id = v.id
					  WHERE u.email = ?`,
					[ada.who.email.toLowerCase()]
				);
				return rows[0] ?? null;
			};
			await expect.poll(async () => (await ownVault())?.escrowId ?? null).not.toBeNull();
			const before = await ownVault();

			await jun.page.goto('/home');
			await openBoard(jun.page, ada.who.name);
			await writeThread(jun.page, secret);
			const threadPath = new URL(jun.page.url()).pathname;

			// ── Ada, on the new device ─────────────────────────────────────────
			const mailsBefore = (await mailsTo(ada.who.email)).length;
			const requester = await fresh.newPage();
			await requester.goto('/login');
			await waitForHydration(requester);
			await requester.getByRole('link', { name: 'Forgot password?' }).click();
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

			// ── Jun's approval alone is not enough ─────────────────────────────
			// Otherwise a partner could file a request for someone else's email
			// and approve it themselves. The requester page waits for the other
			// half: the link emailed to Ada's address.
			await expect(requester.getByText('Your partner confirmed it is you.')).toBeVisible({
				timeout: 15_000
			});
			expect(new URL(requester.url()).pathname).toBe('/login/recover');

			// ── Ada opens the email, wherever she reads it ─────────────────────
			const confirmMail = await waitForMailTo(ada.who.email, mailsBefore + 1);
			expect(confirmMail.subject).toMatch(/signing back in/);
			const inbox = await fresh.newPage();
			await inbox.goto(linkIn(confirmMail));
			await waitForHydration(inbox);
			await clickWaButton(inbox, 'Yes, this is me');
			await expect(inbox.getByText(/that's confirmed/)).toBeVisible();
			await inbox.close();

			// ── Ada is let in, with the history readable ───────────────────────
			await requester.waitForURL('/home', { timeout: 20_000 });
			// Landing is not the end of signing in: going on before the shell has
			// cached the key throws it away, and against the image's fast redirect
			// the Security page was sent back to sign in every time.
			await waitForKeyring(requester);
			expect(await deviceHoldsKey(requester)).toBe(true);
			await requester.goto(threadPath);
			await expect(requester.getByText(secret)).toBeVisible();

			// Her own vault came back too: the same one, open to her new key,
			// and escrowed afresh now its old shares have been released.
			await expect
				.poll(async () => {
					const after = await ownVault();
					return [
						after?.vaultId === before?.vaultId,
						Number(after?.usableWraps),
						after?.escrowId !== null && after?.escrowId !== before?.escrowId
					];
				})
				.toEqual([true, 1, true]);

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
			await newAccounts(ada, jun);
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
		// Says it emailed a link, as it does for a real account, though nothing
		// was sent.
		await expect(page.getByText(/We've emailed a link to nobody@example.test/)).toBeVisible();
		expect(await mailsTo('nobody@example.test')).toEqual([]);
	});

	/**
	 * Mail scanners open links to look at them. Opening the confirm link must
	 * not be what confirms it, or a scanner could vouch for a takeover.
	 */
	test('opening the emailed link confirms nothing until the button is pressed', async ({
		browser
	}) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');
		const fresh = await browser.newContext();
		try {
			await newAccounts(ada, jun);
			await linkAccounts(ada, jun);
			const mailsBefore = (await mailsTo(ada.who.email)).length;

			const requester = await fresh.newPage();
			await requester.goto('/login/recover');
			await waitForHydration(requester);
			await requester.locator('wa-input[data-field="recoverEmail"] input').fill(ada.who.email);
			await fillPassword(requester, 'newPassword', 'vocalist-hazy-radar-plunge');
			await fillPassword(requester, 'confirmPassword', 'vocalist-hazy-radar-plunge');
			await clickWaButton(requester, 'Ask my partner');
			await expect(requester.locator('.safety .number')).toBeVisible({ timeout: 15_000 });

			const link = linkIn(await waitForMailTo(ada.who.email, mailsBefore + 1));
			const scanner = await fresh.newPage();
			await scanner.goto(link);
			await waitForHydration(scanner);
			await expect(scanner.getByText('Is this you?')).toBeVisible();
			await scanner.close();

			// Jun approves; the request still cannot finish.
			await jun.page.goto('/home');
			await jun.page.getByRole('link', { name: `Help ${ada.who.name} sign in` }).click();
			await clickWaButton(jun.page, 'The code matches — help them');
			await expect(requester.getByText('Your partner confirmed it is you.')).toBeVisible({
				timeout: 15_000
			});
			await expect(requester.getByText(/We've emailed a link/)).toBeVisible();
			expect(new URL(requester.url()).pathname).toBe('/login/recover');
			// And Ada's old session is untouched.
			await ada.page.goto('/home');
			expect(new URL(ada.page.url()).pathname).toBe('/home');
		} finally {
			await fresh.close();
			await ada.close();
			await jun.close();
		}
	});
});
