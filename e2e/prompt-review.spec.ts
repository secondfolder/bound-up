import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import {
	account,
	clickWaButton,
	grantFeature,
	signUp,
	switchOnDebugCookie,
	waitForHydration
} from './helpers';

/**
 * The prompt review debug tool (docs/prompt-review.md, "The debug page"):
 * reached from Settings in debug mode, it renders any combination of options
 * through the real builders, keeps the combination in the URL, and compares
 * two prompts.
 */

/** Chooses a value in one of the option selects, by the axis it sets. */
async function choose(page: Page, axis: string, value: string) {
	const select = page.locator(`wa-select[data-axis="${axis}"]`);
	await select.click();
	await select.locator(`wa-option[value="${value}"]`).click();
}

/** The catalogue the page reads is generated in a checkout, never built into an image. */
const LOCAL_ONLY = 'the prompt catalogue is generated locally, not built in: run npm run test:e2e';

test('reviews a prompt, changes an option, and compares the two', async ({ page }) => {
	// biome-ignore lint/suspicious/noSkippedTests: conditional on the server under test; an image has no catalogue, so this runs under `npm run test:e2e` only.
	test.skip(Boolean(process.env.E2E_IMAGE), LOCAL_ONLY);
	const who = account('Reviewer');
	await signUp(page, who);
	await grantFeature(who.email, 'debugMode');
	await switchOnDebugCookie(page);

	await page.goto('/settings');
	await waitForHydration(page);
	await page.getByRole('link', { name: 'Debug tools' }).click();
	await page.getByRole('link', { name: /Daydream prompts/ }).click();
	await expect(page).toHaveURL(/\/debug\/prompts/);
	await waitForHydration(page);

	// The baseline story reply, rendered through the real builder.
	await expect(page.getByText('⟦character1.name⟧').first()).toBeVisible();
	await expect(page.getByText('# Keeping the monologue going')).toHaveCount(0);
	await clickWaButton(page, 'Pin as A, to compare');

	await choose(page, 'narrator', 'monologue');
	await expect(page).toHaveURL(/a\.narrator=monologue/);
	await expect(page.getByText('# Keeping the monologue going')).toBeVisible();

	await page.locator('wa-radio[value="compare"]').click();
	await expect(page.getByText('A: baseline')).toBeVisible();
	await expect(page.getByText('B: narrator=monologue')).toBeVisible();
	await expect(page.locator('.row.added').first()).toBeVisible();

	// The URL alone opens the same prompt.
	await page.goto('/debug/prompts?builder=reply&a.narrator=monologue');
	await waitForHydration(page);
	await expect(page.getByText('# Keeping the monologue going')).toBeVisible();
});

test('marks a paragraph reviewed on this device', async ({ page }) => {
	// biome-ignore lint/suspicious/noSkippedTests: conditional on the server under test; an image has no catalogue, so this runs under `npm run test:e2e` only.
	test.skip(Boolean(process.env.E2E_IMAGE), LOCAL_ONLY);
	const who = account('Reviewer');
	await signUp(page, who);
	await grantFeature(who.email, 'debugMode');
	await switchOnDebugCookie(page);

	await page.goto('/debug/prompts?builder=name&view=paragraphs');
	await waitForHydration(page);
	const first = page.locator('.paragraphs > li').first();
	await first.getByRole('button', { name: 'Reviewed' }).click();
	await expect(first.getByRole('button', { name: 'Reviewed' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByText('1 reviewed on this device')).toBeVisible();

	await page.reload();
	await waitForHydration(page);
	await expect(page.getByText('1 reviewed on this device')).toBeVisible();
});

test('is not there for an account without debug mode', async ({ page }) => {
	await signUp(page, account('Nobody'));
	const response = await page.goto('/debug/prompts');
	expect(response?.status()).toBe(403);
	expect((await page.request.get('/api/debug/prompts?builder=reply')).status()).toBe(403);
});
