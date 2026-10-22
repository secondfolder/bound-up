import type { Browser, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { sql } from './db';
import { test } from './fixtures';
import {
	clickWaButton,
	linkAccounts,
	newSide,
	type Side,
	signUp,
	typeRichText,
	waitForHydration
} from './helpers';

/**
 * The notebook end to end: a solo journal that survives a reload, a shared
 * note two people write in at once, who may see what, version history, and
 * edits made offline. See docs/notebook.md.
 *
 * Live updates are asserted with a retrying `expect` and never a reload: a
 * reload would pass whether or not the live path works at all.
 */

const surface = (page: Page) =>
	page.locator('.richtext-editor .surface[contenteditable="true"]').first();

/** Starts an entry from a notebook list and waits until it can be written in. */
async function startEntry(page: Page, kind: 'journal' | 'note'): Promise<string> {
	await waitForHydration(page);
	if (kind === 'note') {
		await page.getByRole('tab', { name: 'Notes' }).click();
	}
	await clickWaButton(page, kind === 'journal' ? 'New journal entry' : 'New note');
	await page.waitForURL(/\/notebook\/[0-9a-f-]{36}$/);
	await expect(page.getByText('Saved')).toBeVisible();
	return page.url();
}

async function setTitle(page: Page, title: string) {
	const input = page.locator('wa-input[name="title"] input');
	await input.click();
	await input.pressSequentially(title, { delay: 10 });
}

/** Both accounts linked, both on the shared notebook, with control as given. */
async function sharedNotebook(
	browser: Browser,
	control: 'me' | 'them' | 'mix' = 'mix'
): Promise<{ ada: Side; bo: Side; notebookUrl: string }> {
	const ada = await newSide(browser, 'Ada');
	const bo = await newSide(browser, 'Bo');
	await signUp(ada.page, ada.who);
	await signUp(bo.page, bo.who);
	await linkAccounts(ada, bo, control);
	// The invitee lands on the partner page; its notebook is one link away.
	await bo.page.getByRole('link', { name: 'Notebook' }).click();
	await bo.page.waitForURL(/\/partner\/[0-9a-f-]{36}\/notebook$/);
	return { ada, bo, notebookUrl: bo.page.url() };
}

test.describe('the solo journal', () => {
	test('keeps an entry, sealed, across a reload', async ({ browser }) => {
		const side = await newSide(browser, 'Ada');
		try {
			await signUp(side.page, side.who);
			await side.page.goto('/home/notebook');
			const url = await startEntry(side.page, 'journal');

			await setTitle(side.page, 'A good week');
			// A phrase nothing else in the database could contain, to look for later.
			const sentinel = `sentinel-${crypto.randomUUID().slice(0, 8)}`;
			await typeRichText(side.page, `We talked about the rules. ${sentinel}`);
			await expect(side.page.getByText('Saved')).toBeVisible();

			await side.page.goto(url);
			await expect(surface(side.page)).toContainText(sentinel);
			await expect(side.page.locator('wa-input[name="title"] input')).toHaveValue('A good week');

			// Encrypted at rest: neither the phrase nor the title is anywhere in the
			// notebook's rows.
			const { rows } = await sql(
				`SELECT e.ciphertext AS header, u.ciphertext AS edit
				   FROM notebook_entries e JOIN notebook_updates u ON u.entry_id = e.id
				  WHERE e.id = ?`,
				[url.split('/').at(-1) ?? '']
			);
			expect(rows.length).toBeGreaterThan(0);
			const stored = JSON.stringify(rows);
			expect(stored).not.toContain(sentinel);
			expect(stored).not.toContain('A good week');

			// The list shows it by its (opened) title.
			await side.page.goto('/home/notebook');
			await expect(side.page.getByRole('link', { name: /A good week/ })).toBeVisible({
				timeout: 15_000
			});
		} finally {
			await side.close();
		}
	});
});

test.describe('the writing surface', () => {
	/** A short entry still fills the page, so a click below its text writes in it. */
	test('takes a click anywhere below the text', async ({ browser }) => {
		const side = await newSide(browser, 'Ada');
		try {
			await signUp(side.page, side.who);
			await side.page.goto('/home/notebook');
			await startEntry(side.page, 'note');
			await typeRichText(side.page, 'One line.');

			const body = side.page.locator('.entry-body');
			const box = await body.boundingBox();
			const surfaceBox = await surface(side.page).boundingBox();
			if (!(box && surfaceBox)) {
				throw new Error('The entry has no box to click in');
			}
			// The surface reaches the foot of its area, not just the one line.
			expect(surfaceBox.y + surfaceBox.height).toBeGreaterThan(box.y + box.height - 2);

			await side.page.getByRole('button', { name: 'History' }).focus();
			await side.page.mouse.click(box.x + box.width / 2, box.y + box.height - 8);
			await expect(surface(side.page)).toBeFocused();
			await side.page.keyboard.type(' And another.');
			await expect(surface(side.page)).toContainText('One line. And another.');

			// The title is the page's heading: no visible label, and its text on the
			// same edge as the entry's.
			const label = side.page
				.locator('wa-input[name="title"]')
				.locator('[part~="form-control-label"]');
			expect(
				await label.evaluate((element) => element.getBoundingClientRect().width)
			).toBeLessThanOrEqual(1);
			const titleInput = await side.page.locator('wa-input[name="title"] input').boundingBox();
			const firstLine = await surface(side.page).locator('p').first().boundingBox();
			if (!(titleInput && firstLine)) {
				throw new Error('The title or the first line has no box');
			}
			expect(Math.abs(titleInput.x - firstLine.x)).toBeLessThanOrEqual(1);
		} finally {
			await side.close();
		}
	});
});

test.describe('a shared note', () => {
	test('two people see each other’s writing, presence and caret live', async ({ browser }) => {
		const { ada, bo, notebookUrl } = await sharedNotebook(browser);
		try {
			const url = await startEntry(bo.page, 'note');
			await ada.page.goto(url);
			await expect(surface(ada.page)).toBeVisible();

			await expect(ada.page.getByText('Bo is here')).toBeVisible({ timeout: 15_000 });
			await expect(bo.page.getByText('Ada is here')).toBeVisible({ timeout: 15_000 });

			await typeRichText(bo.page, 'Bo writes first.');
			await expect(surface(ada.page)).toContainText('Bo writes first.', { timeout: 15_000 });

			await surface(ada.page).press('End');
			await surface(ada.page).pressSequentially(' Ada adds this.', { delay: 15 });
			await expect(surface(bo.page)).toContainText('Ada adds this.', { timeout: 15_000 });

			// Bo sees Ada's caret, labelled with the name Bo's own device knows her by.
			await expect(bo.page.locator('.rt-remote-cursor-name', { hasText: 'Ada' })).toBeVisible({
				timeout: 15_000
			});

			await setTitle(ada.page, 'Plans');
			await expect(bo.page.locator('wa-input[name="title"] input')).toHaveValue('Plans', {
				timeout: 15_000
			});

			// The list updates live too.
			await bo.page.goto(notebookUrl);
			await bo.page.getByRole('tab', { name: 'Notes' }).click();
			await expect(bo.page.getByRole('link', { name: /Plans/ })).toBeVisible({ timeout: 15_000 });
		} finally {
			await ada.close();
			await bo.close();
		}
	});

	test('the partner holding control can make an entry read-only, then hidden', async ({
		browser
	}) => {
		// Ada invites, and keeps control.
		const { ada, bo, notebookUrl } = await sharedNotebook(browser, 'me');
		try {
			await ada.page.goto(notebookUrl);
			const url = await startEntry(ada.page, 'journal');
			await typeRichText(ada.page, 'Only for reading.');
			await expect(ada.page.getByText('Saved')).toBeVisible();

			await bo.page.goto(url);
			await expect(surface(bo.page)).toContainText('Only for reading.');

			await ada.page.locator('wa-select[name="access"]').click();
			await ada.page.getByRole('option', { name: 'Bo can only read it' }).click();
			await clickWaButton(ada.page, 'Save');

			// Bo's open page follows without a reload.
			await expect(bo.page.getByText('Read only')).toBeVisible({ timeout: 15_000 });
			await expect(
				bo.page.locator('.richtext-editor .surface[contenteditable="false"]')
			).toBeVisible();

			await ada.page.locator('wa-select[name="access"]').click();
			await ada.page.getByRole('option', { name: 'Hidden from Bo' }).click();
			await clickWaButton(ada.page, 'Save');

			// Gone from Bo's list, and its address is a 404.
			await bo.page.goto(notebookUrl);
			await expect(bo.page.getByText('No journal entries yet')).toBeVisible();
			const response = await bo.page.goto(url);
			expect(response?.status()).toBe(404);
		} finally {
			await ada.close();
			await bo.close();
		}
	});
});

test.describe('version history', () => {
	test('keeps versions automatically, and restores one', async ({ browser }) => {
		const side = await newSide(browser, 'Ada');
		try {
			// Versions after half a second of quiet rather than two minutes.
			await side.page.addInitScript(() => {
				localStorage.setItem(
					'bound-up:notebook-timings',
					JSON.stringify({ idleMs: 500, checkMs: 300 })
				);
			});
			await signUp(side.page, side.who);
			await side.page.goto('/home/notebook');
			await startEntry(side.page, 'note');

			await typeRichText(side.page, 'First draft.');
			await expect(side.page.getByText('Saved')).toBeVisible();

			await clickWaButton(side.page, 'History');
			const firstVersion = side.page.locator('.versions .version').first();
			await expect(firstVersion).toBeVisible({ timeout: 15_000 });
			// Closed and gone before typing: while a drawer is open the page behind
			// it is inert, and keys go nowhere.
			await side.page.keyboard.press('Escape');
			await expect(side.page.locator('wa-drawer')).toHaveCount(0);

			await surface(side.page).press('ControlOrMeta+a');
			await surface(side.page).pressSequentially('Rewritten entirely.', { delay: 10 });
			await expect(side.page.getByText('Saved')).toBeVisible();
			await expect(surface(side.page)).toHaveText('Rewritten entirely.');

			await clickWaButton(side.page, 'History');
			await expect(side.page.locator('.versions .version')).toHaveCount(2, { timeout: 15_000 });
			await side.page.locator('.versions .version').last().click();
			await expect(side.page.locator('.preview')).toContainText('First draft.');
			await clickWaButton(side.page, 'Restore this version');

			await expect(surface(side.page)).toHaveText('First draft.');
		} finally {
			await side.close();
		}
	});
});

test.describe('offline', () => {
	test('keeps what was typed on the device and sends it once back online', async ({ browser }) => {
		const side = await newSide(browser, 'Ada');
		try {
			await signUp(side.page, side.who);
			await side.page.goto('/home/notebook');
			const url = await startEntry(side.page, 'note');

			await side.page.route('**/api/notebook/entries/*/updates', (route) =>
				route.request().method() === 'POST' ? route.abort() : route.continue()
			);
			await typeRichText(side.page, 'Written on a train.');
			await expect(side.page.getByText(/Offline: changes kept on this device/)).toBeVisible({
				timeout: 15_000
			});

			// A reload while still offline: the edit comes back from the device.
			await side.page.goto(url);
			await expect(surface(side.page)).toContainText('Written on a train.');

			await side.page.unroute('**/api/notebook/entries/*/updates');
			await expect(side.page.getByText('Saved')).toBeVisible({ timeout: 40_000 });

			// And now it is on the server: a fresh device-less load still has it.
			await side.page.evaluate(() => {
				for (const key of Object.keys(localStorage)) {
					if (key.startsWith('bound-up:notebook-outbox')) {
						localStorage.removeItem(key);
					}
				}
			});
			await side.page.goto(url);
			await expect(surface(side.page)).toContainText('Written on a train.');
		} finally {
			await side.close();
		}
	});
});
