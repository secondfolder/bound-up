import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import {
	type Account,
	account,
	fillPassword,
	fillWaInput,
	LOG_IN_BUTTON,
	logInHere,
	signUp,
	submitEnhancedForm,
	waitForEnhancedForm
} from './helpers';
import { linkIn, mailsTo, waitForMailTo } from './mail';

/**
 * An account cannot sign in until its address is confirmed. Signing up ends on
 * "check your email", the link in that email lands on the login page, and
 * signing in there is what finishes it — and unlocks, as it always does.
 * See docs/email.md.
 *
 * `signUp` does all of this for the other specs about signing up, and the
 * rest skip it with `newAccount`; these look at each step on its own.
 */

/** Fills and submits the sign-up form, and stops on the check-email page. */
async function submitSignUp(page: Page, who: Account, from = '/signup') {
	await page.goto(from);
	await waitForEnhancedForm(page);
	await fillWaInput(page, 'name', who.name);
	await fillWaInput(page, 'email', who.email);
	await fillPassword(page, 'password', who.password);
	await fillPassword(page, 'passwordConfirm', who.password);
	await submitEnhancedForm(page, 'Sign up');
	await page.waitForURL((url) => url.pathname === '/signup/check-email');
}

async function submitLogIn(page: Page, who: Account) {
	await page.goto('/login');
	await waitForEnhancedForm(page);
	await fillWaInput(page, 'email', who.email);
	await fillPassword(page, 'password', who.password);
	await submitEnhancedForm(page, LOG_IN_BUTTON);
}

test.describe('email verification', () => {
	test('signing up ends at "check your email", and the link leads to signing in', async ({
		page
	}) => {
		const who = account('Vera');
		await submitSignUp(page, who);
		await expect(page.getByText(`We've sent a link to ${who.email}`)).toBeVisible();
		// No session yet: the app is still out of reach.
		await page.goto('/home');
		await page.waitForURL((url) => url.pathname === '/login');

		const mail = await waitForMailTo(who.email);
		expect(mail.subject).toBe('Confirm your email for Bound Up');
		await page.goto(linkIn(mail));
		await expect(page.getByTestId('verification-notice')).toContainText('Your email is confirmed');
		await logInHere(page, who);
		await expect(page).toHaveURL(/\/home$/);
	});

	test('signing in before confirming says so, and sends a fresh link', async ({ page }) => {
		const who = account('Wren');
		await submitSignUp(page, who);
		await waitForMailTo(who.email, 1);

		await submitLogIn(page, who);
		await expect(page.getByText(/Confirm your email address first/)).toBeVisible();
		expect(new URL(page.url()).pathname).toBe('/login');

		// The newer link works as well as the first would have.
		const fresh = await waitForMailTo(who.email, 2);
		await page.goto(linkIn(fresh));
		await logInHere(page, who);
		await expect(page).toHaveURL(/\/home$/);
	});

	test('a link that has been tampered with says so', async ({ page }) => {
		const who = account('Yara');
		await submitSignUp(page, who);
		const link = new URL(linkIn(await waitForMailTo(who.email)));
		link.searchParams.set('token', `${link.searchParams.get('token')}x`);

		await page.goto(link.href);
		await expect(page.getByTestId('verification-notice')).toContainText("That link didn't work");
		// And it did not confirm anything.
		await submitLogIn(page, who);
		await expect(page.getByText(/Confirm your email address first/)).toBeVisible();
	});

	/**
	 * A link has only just gone, so another is offered after a minute's
	 * countdown — the same minute the server would refuse anyway — and the
	 * countdown starts again after each one. The clock is Playwright's, so the
	 * test does not wait the minute out; the server's limit is off in this
	 * suite, as every other auth limit is.
	 */
	test('the check-email page counts down, then sends another link', async ({ page }) => {
		await page.clock.install();
		const who = account('Zola');
		await submitSignUp(page, who);
		await waitForMailTo(who.email, 1);

		// Filled in already, from the sign-up that sent us here.
		await expect(page.locator('wa-input[name="email"] input')).toHaveValue(who.email);
		const resend = page.locator('wa-button', { hasText: /Send a new link/ });
		await expect(resend).toHaveText(/Send a new link in (?:60|59)s/);
		await expect(resend).toHaveJSProperty('disabled', true);

		await page.clock.fastForward(30_000);
		await expect(resend).toHaveText(/Send a new link in (?:30|29)s/);

		await page.clock.fastForward(31_000);
		await expect(resend).toHaveText(/^\s*Send a new link\s*$/);
		await expect(resend).toHaveJSProperty('disabled', false);
		await submitEnhancedForm(page, 'Send a new link');
		await expect(page.getByText(/a new link is on its way/)).toBeVisible();
		await waitForMailTo(who.email, 2);
		// And it waits again.
		await expect(resend).toHaveText(/Send a new link in (?:60|59)s/);
	});

	/**
	 * Signing up with a taken address looks exactly like signing up with a new
	 * one, so the form cannot be used to find out who has an account. The real
	 * owner is told by email instead.
	 */
	test('a taken address gets the same page, and its owner an email', async ({ browser }) => {
		const owner = account('Abel');
		const ownerContext = await browser.newContext();
		const strangerContext = await browser.newContext();
		try {
			const ownerPage = await ownerContext.newPage();
			await signUp(ownerPage, owner);
			const before = (await mailsTo(owner.email)).length;

			const stranger = await strangerContext.newPage();
			await submitSignUp(stranger, { ...owner, name: 'Not Abel', password: 'someone-elses-pass' });
			await expect(stranger.getByText(`We've sent a link to ${owner.email}`)).toBeVisible();

			const notice = await waitForMailTo(owner.email, before + 1);
			expect(notice.subject).toMatch(/tried to sign up/);
			// The owner's account is untouched: still signed in, and still
			// confirmed.
			await ownerPage.goto('/home');
			expect(new URL(ownerPage.url()).pathname).toBe('/home');
		} finally {
			await ownerContext.close();
			await strangerContext.close();
		}
	});

	/** An invite survives sign-up, the email and sign-in. */
	test('a redirectTo rides along through the link', async ({ page }) => {
		const who = account('Bram');
		await submitSignUp(page, who, '/signup?redirectTo=%2Froadmap');
		expect(new URL(page.url()).searchParams.get('redirectTo')).toBe('/roadmap');

		await page.goto(linkIn(await waitForMailTo(who.email)));
		expect(new URL(page.url()).searchParams.get('redirectTo')).toBe('/roadmap');
		await logInHere(page, who);
		await expect(page).toHaveURL(/\/roadmap$/);
	});
});
