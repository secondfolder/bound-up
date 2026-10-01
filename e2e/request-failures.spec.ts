import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { test } from './fixtures';
import {
	account,
	fillPassword,
	fillWaInput,
	submitEnhancedForm,
	waitForEnhancedForm
} from './helpers';

/**
 * A request that fails says so on the page. See docs/request-failures.md.
 *
 * Signup is the case that prompted it: against a database missing a
 * migration, the action answered 500, superforms rethrew it, and the form sat
 * there as if nothing had been pressed. Both failures are staged with
 * `page.route` rather than by breaking the server, so the suite's shared
 * database is never touched.
 */
async function fillSignup(page: Page) {
	const who = account('Quinn');
	await page.goto('/signup');
	await waitForEnhancedForm(page);
	await fillWaInput(page, 'name', who.name);
	await fillWaInput(page, 'email', who.email);
	await fillPassword(page, 'password', who.password);
	await fillPassword(page, 'passwordConfirm', who.password);
}

/** Intercepts only the form's POST; the page itself and its assets load normally. */
async function onSignupPost(page: Page, handle: Parameters<Page['route']>[1]) {
	await page.route(
		(url) => url.pathname === '/signup',
		(route, request) => (request.method() === 'POST' ? handle(route, request) : route.continue())
	);
}

test.describe('request failures', () => {
	test('a server error on sign-up is shown, and the form stays filled in', async ({ page }) => {
		await fillSignup(page);
		await onSignupPost(page, (route) =>
			// What SvelteKit answers for an action that threw.
			route.fulfill({
				status: 500,
				contentType: 'application/json',
				body: JSON.stringify({ type: 'error', error: { message: 'Internal Error' } })
			})
		);

		await submitEnhancedForm(page, 'Sign Up');

		await expect(page.getByRole('alert')).toContainText('Something went wrong on our side');
		await expect(page).toHaveURL(/\/signup/);
		await expect(page.locator('wa-input[name=name] input')).toHaveValue('Quinn');
	});

	test('a sign-up that never reaches the server blames the connection', async ({ page }) => {
		await fillSignup(page);
		await onSignupPost(page, (route) => route.abort('internetdisconnected'));

		await submitEnhancedForm(page, 'Sign Up');

		await expect(page.getByRole('alert')).toContainText("Couldn't reach Bound Up");
	});

	test('the notice can be dismissed', async ({ page }) => {
		await fillSignup(page);
		await onSignupPost(page, (route) => route.fulfill({ status: 500, body: '{"type":"error"}' }));
		await submitEnhancedForm(page, 'Sign Up');

		await page.getByRole('alert').getByRole('button', { name: 'Dismiss' }).click();
		await expect(page.getByRole('alert')).toHaveCount(0);
	});
});
