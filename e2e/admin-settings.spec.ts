import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { sql } from './db';
import { test } from './fixtures';
import {
	type Account,
	account,
	clickWaButton,
	logIn,
	logOut,
	signUp,
	waitForHydration
} from './helpers';
import { waitForMailTo } from './mail';

/**
 * Admin → Server settings (docs/server-settings.md).
 *
 * The settings are the whole server's, shared by every worker in this run, so
 * nothing here changes one another spec depends on: no key is regenerated
 * (that signs everyone out, or drops every push device — the server tests
 * cover both), and what is saved is put back.
 */

/** As in admin.spec.ts: the role straight in the database, then a fresh sign-in. */
async function becomeAdmin(page: Page, who: Account) {
	await sql("update user set role = 'admin' where email = ?", [who.email]);
	await logOut(page);
	await logIn(page, who);
}

async function openServerSettings(page: Page) {
	await page.goto('/admin');
	await page.getByRole('link', { name: /Server settings/ }).click();
	await page.waitForURL('/admin/server');
	await waitForHydration(page);
}

test('an admin sees what is set up, and sends themselves a test email', async ({ page }) => {
	const root = account('Root');
	await signUp(page, root);
	await becomeAdmin(page, root);
	await openServerSettings(page);

	const email = page.getByRole('article', { name: 'Email' });
	await expect(email.getByText('Working')).toBeVisible();
	// A saved credential is never shown, only that there is one.
	await expect(
		page.getByRole('article', { name: 'Language models' }).getByText('Saved')
	).toBeVisible();
	await expect(page.getByText('e2e-openrouter-key')).toHaveCount(0);

	await clickWaButton(page, 'Send a test email');
	await expect(email.getByText(`Sent to ${root.email}.`)).toBeVisible();
	const mail = await waitForMailTo(root.email);
	expect(mail.subject).toBe('A test email from your server');
});

test('an admin finds a story model on OpenRouter and saves it', async ({ page }) => {
	const root = account('Root');
	await signUp(page, root);
	await becomeAdmin(page, root);
	await openServerSettings(page);

	const daydreams = page.getByRole('article', { name: 'Language models' });
	// The suite's own model is already a custom one.
	await expect(daydreams.getByRole('radio', { name: /Custom/ })).toBeChecked();
	await daydreams.getByRole('searchbox', { name: 'Search OpenRouter' }).fill('storyteller');
	await daydreams.getByRole('button', { name: /Stub: Storyteller 70B/ }).click();
	await expect(daydreams.locator('wa-input[name="openrouterModelId"] input')).toHaveValue(
		'stubvendor/stub-storyteller-70b'
	);

	try {
		await clickWaButton(page, 'Save language model settings');
		await expect(daydreams.getByText('Saved.')).toBeVisible();
		const { rows } = await sql(
			"select value from server_settings where key = 'openrouterStoryModel'"
		);
		expect(JSON.parse(String(rows[0]?.value))).toEqual({
			openrouterModelId: 'stubvendor/stub-storyteller-70b'
		});
	} finally {
		await sql("update server_settings set value = ? where key = 'openrouterStoryModel'", [
			JSON.stringify({ openrouterModelId: 'e2e/stub' })
		]);
	}
});

test('a custom picture model found on Runware fills in its base model', async ({ page }) => {
	const root = account('Root');
	await signUp(page, root);
	await becomeAdmin(page, root);
	await openServerSettings(page);

	const pictures = page.getByRole('article', { name: 'Image models' });
	const photo = pictures.getByRole('group', { name: 'Daydreams photo model' });
	await expect(photo.getByRole('radio', { name: /Dark Beast/ })).toBeChecked();
	await photo.getByText('Custom').click();
	await photo.getByRole('searchbox', { name: 'Search Runware' }).fill('pony');
	await photo.getByRole('button', { name: /Stub Pony Checkpoint/ }).click();

	await expect(photo.locator('wa-input[name="photoRunwareModelAir"] input')).toHaveValue(
		'civitai:111111@222222'
	);
	await expect(photo.locator('wa-select[name="photoBase"]')).toHaveJSProperty('value', 'pony');
	// What Runware says about it, as text: the stub's description has markup.
	await expect(photo.getByText(/Runware lists it as pony, which is Pony \(SDXL\)/)).toBeVisible();
	await expect(photo.getByText('A stub checkpoint for the suite.')).toBeVisible();

	// Cleared, the search's results go.
	await photo.getByRole('searchbox', { name: 'Search Runware' }).fill('');
	await expect(photo.getByRole('button', { name: /Stub Pony Checkpoint/ })).toHaveCount(0);
	// Not saved: every picture in the run would be drawn with it.
});

test('the server settings are a 404 for anyone but an admin', async ({ page }) => {
	const bo = account('Bo');
	await signUp(page, bo);
	await sql("update user set role = 'user' where email = ?", [bo.email]);
	await logOut(page);
	await logIn(page, bo);

	expect((await page.goto('/admin/server'))?.status()).toBe(404);
	expect((await page.request.get('/api/admin/models/openrouter?q=x')).status()).toBe(404);
});
