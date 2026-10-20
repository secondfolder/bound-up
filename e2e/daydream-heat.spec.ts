import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { sql } from './db';
import { test } from './fixtures';
import { account, clickWaButton, reply, signUp, waitForHydration } from './helpers';

/**
 * How sexual and how kinky a daydream is: an idea's heat, from a starting
 * point, reaching the prompt, and turned up mid-story. The stand-in model
 * (`e2e/model-stub.mjs`) ends each passage with "(Heat: <level>.)" when the
 * prompt names one, which is how this sees what the model was told.
 */

const dialog = (page: Page) => page.locator('wa-dialog');

async function dreamer(page: Page) {
	const who = account('Dreamer');
	await signUp(page, who);
	await sql(
		`insert into user_features (id, user_id, feature, source)
		 select ?, id, 'daydreams', 'grant' from user where email = ?`,
		[randomUUID(), who.email]
	);
}

async function openSetup(page: Page) {
	await page.goto('/daydreams');
	await waitForHydration(page);
	const understand = page.getByRole('button', { name: 'I understand' });
	const newLink = page.getByRole('link', { name: 'New daydream' });
	await expect(understand.or(newLink)).toBeVisible();
	if (await understand.isVisible()) {
		await clickWaButton(page, 'I understand');
	}
	await newLink.click();
	await page.waitForURL('**/daydreams/new');
	await waitForHydration(page);
	await clickWaButton(page, 'Build it yourself');
}

test('a SFW starting point keeps the story SFW, and the heat can be turned up mid-story', async ({
	page
}) => {
	await dreamer(page);
	await openSetup(page);

	// The starting points say their level on them, SFW first.
	await clickWaButton(page, 'New idea');
	// The host, not its role: `getByRole` lands on the inner button, which
	// holds the slotted label but not as its own text (AGENTS.md).
	const template = (name: string) => dialog(page).locator('wa-button').filter({ hasText: name });
	const oneBed = template('Only one bed');
	await expect(oneBed.locator('.level')).toHaveText('SFW');
	await expect(template('The dungeon').locator('.level')).toHaveText('Filthy · kinky');
	await oneBed.click();
	await expect(dialog(page).getByRole('button', { name: 'Clear heat' })).toBeVisible();
	await dialog(page).getByRole('button', { name: 'Use this idea' }).click();
	await expect(dialog(page)).toHaveCount(0);

	await clickWaButton(page, 'Cast the best friend');
	await page.getByRole('menuitem', { name: 'New character' }).click();
	await dialog(page).locator('wa-input[name="name"] input').fill('Wren');
	await dialog(page).getByRole('button', { name: 'Add character' }).click();
	await expect(dialog(page)).toHaveCount(0);

	await clickWaButton(page, 'Start daydreaming');
	await page.waitForURL(/\/daydreams\/[0-9a-f-]{36}$/);
	await expect(page.getByText('Wren looks up as you come in. (Heat: SFW.)')).toBeVisible();
	await expect(page.locator('li.streaming')).toHaveCount(0);

	// Turned up from the Dials popover: the next passage is asked for at that level.
	await clickWaButton(page, 'Dials');
	const heat = page.locator('wa-popover wa-slider').first();
	await heat.evaluate((slider: HTMLElement & { value: number }) => {
		slider.value = 5;
		slider.dispatchEvent(new Event('change'));
	});
	await expect(page.locator('wa-popover .level').first()).toContainText('Filthy');
	await page.keyboard.press('Escape');

	const said = `I open the door ${randomUUID().slice(0, 8)}.`;
	await reply(page, said);
	await expect(page.getByText(`Wren heard: "${said}" (Heat: filthy.)`)).toBeVisible();
});
