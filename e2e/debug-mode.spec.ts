import { expect, type Page } from '@playwright/test';
import { sql } from './db';
import { test } from './fixtures';
import { account, grantFeature, newAccount, waitForHydration } from './helpers';

/**
 * Debug mode (docs/debug-mode.md): granted per account, switched on per
 * device, from the bottom nav's corner or from Settings.
 */

const toggle = (page: Page) =>
	page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Debug mode' });

const opacity = (page: Page) =>
	toggle(page).evaluate((element) => getComputedStyle(element).opacity);

const panel = (page: Page) => page.getByRole('region', { name: 'Debug info' });

test('the corner toggle switches debug mode on and off, and only for an account granted it', async ({
	page
}) => {
	const who = account('Debugger');
	await newAccount(page, who);
	await page.goto('/settings');
	await waitForHydration(page);
	await expect(toggle(page)).toHaveCount(0);
	await expect(page.getByText('Debug mode on this device')).toHaveCount(0);

	await grantFeature(who.email, 'debugMode');
	await page.goto('/today');
	await waitForHydration(page);

	// There, but unseen until hovered.
	await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
	await page.mouse.move(0, 0);
	await expect.poll(() => opacity(page)).toBe('0');
	await toggle(page).hover();
	await expect.poll(() => opacity(page)).toBe('1');

	// On: it stays in sight, and Settings shows the panel.
	await toggle(page).click();
	await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
	await page.mouse.move(0, 0);
	await expect.poll(() => opacity(page)).toBe('1');
	await page.goto('/settings');
	await waitForHydration(page);
	await expect(panel(page)).toContainText('debugMode');
	await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');

	// Off again from Settings' own switch.
	await page.locator('wa-switch', { hasText: 'Debug mode on this device' }).click();
	await expect(panel(page)).toHaveCount(0);
	await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
});

test('a revoked grant turns debug mode off, whatever the device says', async ({ page }) => {
	const who = account('Debugger');
	await newAccount(page, who);
	await grantFeature(who.email, 'debugMode');
	await page.goto('/settings');
	await waitForHydration(page);
	await toggle(page).click();
	await expect(panel(page)).toBeVisible();

	await sql(
		`delete from user_features where feature = 'debugMode'
		 and user_id = (select id from user where email = ?)`,
		[who.email]
	);
	await page.reload();
	await waitForHydration(page);
	// The cookie is still set; the account no longer holds the feature.
	expect((await page.context().cookies()).some((cookie) => cookie.name === 'debug')).toBe(true);
	await expect(panel(page)).toHaveCount(0);
	await expect(toggle(page)).toHaveCount(0);
});
