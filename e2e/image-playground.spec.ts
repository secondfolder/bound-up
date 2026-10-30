import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { sql } from './db';
import { test } from './fixtures';
import {
	type Account,
	account,
	clickWaButton,
	grantFeature,
	logIn,
	logOut,
	newAccount,
	waitForHydration
} from './helpers';

/**
 * The picture playground (docs/debug-mode.md, "Picture playground"), against
 * the Runware stub, which draws the same picture whatever it is asked and
 * says the seed it was given.
 *
 * Its history is the server's, shared by every worker in this run, so each
 * test finds its own runs by a prompt nobody else writes.
 */

async function becomePlaygroundAdmin(page: Page, who: Account) {
	await sql("update user set role = 'admin' where email = ?", [who.email]);
	await grantFeature(who.email, 'debugMode');
	await logOut(page);
	await logIn(page, who);
}

async function openPlayground(page: Page) {
	await page.goto('/debug');
	await page.getByRole('link', { name: /Picture playground/ }).click();
	await page.waitForURL('/debug/images');
	await waitForHydration(page);
}

const model = (page: Page, name: string) => page.locator('wa-checkbox', { hasText: name });

test('one prompt drawn by two models side by side, kept, reused and forgotten', async ({
	page
}) => {
	const root = account('Root');
	await newAccount(page, root);
	await becomePlaygroundAdmin(page, root);
	await openPlayground(page);

	const prompt = `A lighthouse keeper at dusk, ${crypto.randomUUID()}`;
	await page.locator('wa-textarea[name="prompt"] textarea').fill(prompt);
	// The first preset is ticked to start with; a second makes it a comparison.
	await expect(model(page, 'Dark Beast')).toHaveJSProperty('checked', true);
	await model(page, 'LUSTIFY!').click();
	await page.locator('wa-input[name="seed"] input').fill('77');
	await page.locator('wa-select[name="numberResults"]').click();
	await page.getByRole('option', { name: '2', exact: true }).click();

	const sent: Record<string, unknown>[] = [];
	page.on('request', (request) => {
		if (request.url().endsWith('/api/debug/images') && request.method() === 'POST') {
			sent.push(request.postDataJSON() as Record<string, unknown>);
		}
	});
	await clickWaButton(page, 'Draw with 2 models');

	const run = page.locator('li.comparison', { hasText: prompt });
	const darkBeast = run.getByRole('article', { name: 'Dark Beast' });
	const lustify = run.getByRole('article', { name: 'LUSTIFY!' });
	await expect(darkBeast.locator('img')).toHaveCount(2);
	await expect(lustify.locator('img')).toHaveCount(2);
	await expect(darkBeast).toContainText('Seed 77');
	await expect(darkBeast).toContainText('Seed 78');
	// One run, one seed for both, each its own model.
	expect(sent).toHaveLength(2);
	expect(new Set(sent.map((each) => each.runId)).size).toBe(1);
	expect(sent.map((each) => each.seed)).toEqual([77, 77]);
	expect(
		sent.map((each) => (each.model as { label: string }).label).sort((a, b) => a.localeCompare(b))
	).toEqual(['Dark Beast', 'LUSTIFY!']);
	// What was sent is there to read: the app's recipe for a Z-Image model.
	await darkBeast.locator('wa-details').click();
	await expect(darkBeast.locator('pre')).toContainText('"steps": 9');
	await expect(darkBeast.locator('pre')).toContainText('"negativePrompt": "child, minor');

	// Kept: there after a reload, and its settings can be put back.
	await page.reload();
	await waitForHydration(page);
	await expect(run.getByRole('article', { name: 'LUSTIFY!' }).locator('img')).toHaveCount(2);
	await page.locator('wa-textarea[name="prompt"] textarea').fill('');
	await model(page, 'LUSTIFY!').click();
	await run.locator('wa-button', { hasText: 'Use these settings' }).click();
	await expect(page.locator('wa-textarea[name="prompt"] textarea')).toHaveValue(prompt);
	await expect(page.locator('wa-input[name="seed"] input')).toHaveValue('77');
	await expect(model(page, 'LUSTIFY!')).toHaveJSProperty('checked', true);

	// Forgotten: gone now and after a reload.
	await run.getByRole('button', { name: 'Forget this run' }).click();
	await expect(run).toHaveCount(0);
	await page.reload();
	await waitForHydration(page);
	await expect(page.locator('wa-textarea[name="prompt"] textarea')).toBeVisible();
	await expect(run).toHaveCount(0);
});

test('a setting Runware refuses, and a prompt with a minor, say why in their column', async ({
	page
}) => {
	const root = account('Root');
	await newAccount(page, root);
	await becomePlaygroundAdmin(page, root);
	await openPlayground(page);

	const prompt = `A quiet harbour, ${crypto.randomUUID()}`;
	await page.locator('wa-textarea[name="prompt"] textarea').fill(prompt);
	await page.locator('wa-select[name="scheduler"]').click();
	await page.getByRole('option', { name: 'LCM' }).click();
	await clickWaButton(page, 'Draw');
	await expect(
		page.locator('li.comparison', { hasText: prompt }).getByRole('article', { name: 'Dark Beast' })
	).toContainText('Runware said: The stub refuses the LCM scheduler.');

	const minor = `A 16-year-old on a harbour wall, ${crypto.randomUUID()}`;
	await page.locator('wa-textarea[name="prompt"] textarea').fill(minor);
	await clickWaButton(page, 'Draw');
	await expect(
		page.locator('li.comparison', { hasText: minor }).getByRole('article', { name: 'Dark Beast' })
	).toContainText('mentions someone under 18');
});

test('is only for an admin with debug mode', async ({ page }) => {
	const who = account('Debugger');
	await newAccount(page, who);
	// Not left to chance: the first account on a fresh server is made an admin.
	await sql("update user set role = 'user' where email = ?", [who.email]);
	await grantFeature(who.email, 'debugMode');
	await logOut(page);
	await logIn(page, who);
	await page.goto('/debug');
	await waitForHydration(page);
	await expect(page.getByRole('link', { name: /Daydream prompts/ })).toBeVisible();
	await expect(page.getByRole('link', { name: /Picture playground/ })).toHaveCount(0);
	const response = await page.goto('/debug/images');
	expect(response?.status()).toBe(404);
	expect((await page.request.post('/api/debug/images', { data: {} })).status()).toBe(404);
});
