import { expect } from '@playwright/test';
import { test } from './fixtures';
import { account, signUp } from './helpers';

test.describe('a new version being deployed', () => {
	// SvelteKit never checks for a new version under `vite dev` — `updated.check()`
	// answers false without asking — so only a production build can show this.
	// `npm run test:e2e:image` and CI run it; UpdateAvailableNotice.svelte.test.ts
	// covers the component everywhere.
	// biome-ignore lint/suspicious/noSkippedTests: conditional on the server under test, not a test left switched off; it runs in CI.
	test.skip(!process.env.E2E_IMAGE, 'needs a production build: run npm run test:e2e:image');

	test('is offered on coming back to the app, and the reload loads it', async ({ page }) => {
		await signUp(page, account('Uma'));
		const toast = page.getByTestId('update-available');
		await expect(toast).toHaveCount(0);

		// What a deploy looks like from an open page: version.json stops matching
		// the build the page was loaded from.
		await page.route('**/_app/version.json', (route) =>
			route.fulfill({ json: { version: 'a-later-build' } })
		);
		// Coming back from the app switcher, as far as the page can tell.
		await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

		await expect(toast).toContainText('A new version of Bound Up is available.');
		const reloaded = page.waitForEvent('load');
		await toast.locator('wa-button', { hasText: 'Reload' }).click();
		await reloaded;
	});
});
