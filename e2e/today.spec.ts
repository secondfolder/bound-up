import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import {
	account,
	linkAccounts,
	navTabs,
	newAccount,
	newAccounts,
	newSide,
	openBoard,
	switchTo,
	waitForHydration,
	writeThread
} from './helpers';

/**
 * Today, the signed-in app's front page, and the bottom nav around it
 * (docs/section-widgets.md, docs/contexts.md). Today follows the context:
 * Everyone is every space's overview, Me is your own cards with nothing of a
 * partner's, and a partnership is its own place with its header.
 */

/** The titles of Today's cards, in order. */
async function cards(page: Page): Promise<string[]> {
	const titles = page.getByRole('main').locator('wa-card h2');
	return (await titles.allTextContents()).map((text) => text.trim());
}

test.describe('Today', () => {
	test('the nav has the five places, and switching context re-filters Today in place', async ({
		browser
	}) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');
		try {
			await newAccounts(ada, jun);
			await linkAccounts(ada, jun);
			// Something of the partnership's for Ada to see, or not see.
			await openBoard(jun.page, 'Ada');
			await writeThread(jun.page, 'hello from Jun');

			await ada.page.goto('/today');
			await waitForHydration(ada.page);
			expect(await navTabs(ada.page)).toEqual([
				'Today',
				'Tasks',
				'Notebook',
				'Messages',
				'Settings'
			]);
			const nav = ada.page.getByRole('navigation', { name: 'Primary' });
			await expect(nav.getByRole('link', { name: 'Today' })).toHaveAttribute(
				'aria-current',
				'page'
			);

			// Everyone: the overview, with what is waiting from Jun at the top.
			await expect(ada.page.getByRole('button', { name: /^Showing Everyone\./ })).toBeVisible();
			const unread = ada.page.getByRole('link', { name: /1 new message from Jun/ });
			await expect(unread).toBeVisible();
			await expect
				.poll(() => cards(ada.page))
				.toEqual(['Messages', 'Tasks', 'Rewards', 'Notebook', 'Playroom']);

			// Me: your own cards, and nothing of Jun's at all.
			await switchTo(ada.page, 'Me');
			await expect(ada.page).toHaveURL(/\/today$/);
			await expect(unread).toHaveCount(0);
			await expect
				.poll(() => cards(ada.page))
				.toEqual(['Tasks', 'Rewards', 'Notebook', 'Playroom']);
			await expect(
				ada.page.getByRole('heading', { level: 2, name: 'Jun', exact: true })
			).toHaveCount(0);

			// The partnership: its own place, headed by Jun, with its settings
			// one tap away.
			await switchTo(ada.page, 'Jun');
			await expect(ada.page).toHaveURL(/\/today$/);
			await expect(
				ada.page.getByRole('heading', { level: 2, name: 'Jun', exact: true })
			).toBeVisible();
			await expect
				.poll(() => cards(ada.page))
				.toEqual(['Messages', 'Tasks', 'Rewards', 'Notebook', 'Kink lists']);
			await expect(
				ada.page.getByRole('main').locator('wa-card').filter({ hasText: 'Messages' })
			).toContainText('1 unread');
			await ada.page.getByRole('link', { name: 'Edit this connection' }).click();
			await ada.page.waitForURL(/\/settings\/partners\/[0-9a-f-]{36}$/);
			await expect(nav.getByRole('link', { name: 'Settings' })).toHaveAttribute(
				'aria-current',
				'page'
			);

			// Still Jun's on coming back: the context is the device's, not the page's.
			await ada.page.goto('/today');
			await expect(ada.page.getByRole('button', { name: /^Showing Jun\./ })).toBeVisible();
		} finally {
			await ada.close();
			await jun.close();
		}
	});

	test('an app installed on the home screen before the move still opens', async ({ page }) => {
		// iOS keeps the start_url an app was installed with: /home, for ever.
		await newAccount(page, account('Installer'));
		const response = await page.request.get('/home', { maxRedirects: 0 });
		// Temporary, never permanent: a 308 would be cached for good.
		expect(response.status()).toBe(307);
		expect(response.headers().location).toBe('/today');

		await page.goto('/home');
		await expect(page).toHaveURL(/\/today$/);
		await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
	});

	test('the old pages are gone, and only /home itself redirects', async ({ page }) => {
		await newAccount(page, account('Visitor'));
		for (const path of [
			'/home/guides',
			'/home/tasks',
			'/partner/00000000-0000-4000-8000-000000000000'
		]) {
			expect((await page.request.get(path, { maxRedirects: 0 })).status(), path).toBe(404);
		}
	});

	test('a fresh install starts on Today', async ({ page }) => {
		const response = await page.request.get('/site.webmanifest');
		expect((await response.json()).start_url).toBe('/today');
	});
});
