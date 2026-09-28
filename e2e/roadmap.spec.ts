import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { waitForHydration } from './helpers';

/**
 * The public roadmap and the landing page's teaser for it.
 *
 * End to end because the drawer is driven by the URL fragment through the real
 * router: a fragment is never sent to the server, so only a hydrated page in a
 * real browser can open it, and only the router can tell us that closing it
 * really took the fragment away (shallow routing would have left `page.url`
 * behind and the drawer would have come straight back).
 */

function drawer(page: Page) {
	return page.locator('wa-drawer');
}

/**
 * A drawer property, polled. Svelte sets an upgraded element's properties,
 * and Lit does not reflect `label` back to an attribute, so the attribute is
 * no witness.
 */
function drawerProp(page: Page, name: 'label' | 'placement') {
	return expect.poll(() =>
		drawer(page).evaluate((el, prop) => (el as unknown as Record<string, unknown>)[prop], name)
	);
}

test.describe('roadmap', () => {
	test('is public: /roadmap loads signed out, without a redirect', async ({ page }) => {
		await page.goto('/roadmap');
		await expect(page).toHaveURL(/\/roadmap$/);
		await expect(page.getByRole('heading', { level: 1, name: 'Roadmap' })).toBeVisible();
		await expect(page.getByRole('heading', { level: 2, name: 'Notebook' })).toBeVisible();
	});

	test('a landing page tile opens that item on the roadmap', async ({ page }) => {
		await page.goto('/');
		await waitForHydration(page);
		await page.getByRole('link', { name: /^Kink list/ }).click();

		await page.waitForURL('**/roadmap#kink-list');
		await drawerProp(page, 'label').toBe('Kink list');
		await expect(drawer(page).getByText("What you're into", { exact: false })).toBeVisible();
	});

	test('a fragment opened directly shows its drawer, and closing it clears the fragment', async ({
		page
	}) => {
		await page.goto('/roadmap#kink-list');
		await waitForHydration(page);
		await drawerProp(page, 'label').toBe('Kink list');

		await page.keyboard.press('Escape');
		await expect(drawer(page)).toHaveCount(0);
		await expect(page).toHaveURL(/\/roadmap$/);
	});

	test('a node opens its drawer, and a prerequisite link swaps to that item', async ({ page }) => {
		await page.goto('/roadmap');
		await waitForHydration(page);
		await page.locator('a.node[id="kink-list"]').click();
		await drawerProp(page, 'label').toBe('Kink list');

		await drawer(page).getByRole('link', { name: 'End-to-end encryption everywhere' }).click();
		await expect(page).toHaveURL(/#expand-encryption$/);
		await drawerProp(page, 'label').toBe('End-to-end encryption everywhere');
	});

	test('fits a phone: no sideways scroll, and the drawer is a bottom sheet', async ({
		browser
	}) => {
		const context = await browser.newContext({ viewport: { width: 375, height: 800 } });
		try {
			const page = await context.newPage();
			await page.goto('/roadmap');
			await waitForHydration(page);
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			);
			expect(overflow).toBe(0);

			await page.locator('a.node[id="edging"]').click();
			await drawerProp(page, 'placement').toBe('bottom');
		} finally {
			await context.close();
		}
	});
});
