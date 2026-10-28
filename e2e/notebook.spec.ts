import type { Browser, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { sql } from './db';
import { test } from './fixtures';
import {
	clickWaButton,
	linkAccounts,
	newAccount,
	newAccounts,
	newSide,
	type Side,
	showContext,
	startAdding,
	switchTo,
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

/**
 * Starts an entry from a notebook list in one space's context, with its add
 * button, and waits until it can be written in. A journal entry asks for its
 * date first, in a dialog; a note starts at once.
 */
async function startEntry(page: Page, kind: 'journal' | 'note'): Promise<string> {
	await waitForHydration(page);
	if (kind === 'note') {
		await page.getByRole('tab', { name: 'Notes' }).click();
	}
	await startAdding(page, kind === 'journal' ? 'New journal entry' : 'New note');
	if (kind === 'journal') {
		await clickWaButton(page, 'Start entry');
	}
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
): Promise<{ ada: Side; bo: Side; notebookUrl: string; partnershipId: string }> {
	const ada = await newSide(browser, 'Ada');
	const bo = await newSide(browser, 'Bo');
	await newAccounts(ada, bo);
	const partnershipId = await linkAccounts(ada, bo, control);
	// Bo goes the way a person does: Today in the partnership's context, whose
	// notebook card sets that context on the way to /notebook. Ada's device
	// has a context of its own, switched to the same partnership.
	await bo.page.goto('/today');
	// After hydration: before it the card is a plain link, which goes to
	// /notebook without setting the context.
	await waitForHydration(bo.page);
	await switchTo(bo.page, 'Ada');
	await expect(bo.page.getByRole('heading', { level: 2, name: 'Ada', exact: true })).toBeVisible();
	// The card, not the nav's tab of the same name.
	await bo.page.getByRole('main').getByRole('link', { name: 'Notebook', exact: true }).click();
	await bo.page.waitForURL(/\/notebook$/);
	await showContext(ada.page, partnershipId);
	return { ada, bo, notebookUrl: '/notebook', partnershipId };
}

test.describe('the solo journal', () => {
	test('keeps an entry, sealed, across a reload', async ({ browser }) => {
		const side = await newSide(browser, 'Ada');
		try {
			await newAccount(side.page, side.who);
			await side.page.goto('/notebook');
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
			await side.page.goto('/notebook');
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
			await newAccount(side.page, side.who);
			await side.page.goto('/notebook');
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

			await clickWaButton(ada.page, 'Settings');
			await ada.page.locator('wa-select[name="access"]').click();
			await ada.page.getByRole('option', { name: 'Bo can only read it' }).click();
			await clickWaButton(ada.page, 'Save');

			// Bo's open page follows without a reload.
			await expect(bo.page.getByText('Read only')).toBeVisible({ timeout: 15_000 });
			await expect(
				bo.page.locator('.richtext-editor .surface[contenteditable="false"]')
			).toBeVisible();

			await clickWaButton(ada.page, 'Settings');
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

/**
 * One list for every context (docs/contexts.md): the switcher re-filters it
 * in place, Everyone shows every space with each row's owner, a new entry in
 * Everyone asks whose it is, and nothing the context says ever moves a write.
 */
test.describe('contexts', () => {
	const control = (page: Page) => page.getByRole('button', { name: /^Showing / });

	/** Opens the fan and picks one, then waits for the list to have followed. */
	async function pick(page: Page, name: string) {
		await control(page).click();
		await page.getByRole('button', { name: `Show ${name}` }).click();
		await expect(control(page)).toHaveAccessibleName(new RegExp(`^Showing ${name}`));
		await expect(control(page)).toHaveAttribute('aria-expanded', 'false');
	}

	async function titled(page: Page, kind: 'note', title: string): Promise<string> {
		const url = await startEntry(page, kind);
		await setTitle(page, title);
		await expect(page.getByText('Saved')).toBeVisible();
		return url;
	}

	/**
	 * An Everyone list watches one stream, the viewer's own room, which every
	 * space they are in fans its list events out to (docs/realtime.md,
	 * "Everyone"). Asserted with no reload, so it cannot pass on a refetch.
	 */
	test('an Everyone list updates live when a partner adds an entry, on one stream', async ({
		browser
	}) => {
		const { ada, bo, partnershipId } = await sharedNotebook(browser);
		try {
			const tag = crypto.randomUUID().slice(0, 6);
			await showContext(bo.page, 'all');
			// Off the page sharedNotebook left Bo on first. It returns once the
			// URL is /notebook, before that page has hydrated and opened its
			// own stream on the partnership's space, which it would otherwise
			// do while the goto below is under way and be counted here.
			await bo.page.goto('about:blank');
			const streams: string[] = [];
			bo.page.on('request', (request) => {
				if (request.url().includes('/api/realtime/events')) {
					streams.push(new URL(request.url()).searchParams.get('room') ?? '');
				}
			});
			await bo.page.goto('/notebook');
			await waitForHydration(bo.page);
			await expect(control(bo.page)).toHaveAccessibleName(/^Showing Everyone/);
			await bo.page.getByRole('tab', { name: 'Notes' }).click();
			await expect.poll(() => streams.length).toBeGreaterThan(0);

			await ada.page.goto('/notebook');
			await titled(ada.page, 'note', `Live ${tag}`);

			await expect(bo.page.getByRole('link', { name: new RegExp(`Live ${tag}`) })).toContainText(
				'Ada',
				{ timeout: 15_000 }
			);
			// One stream, on Bo's own room, however many spaces the list shows.
			expect([...new Set(streams)]).toEqual([expect.stringMatching(/^user:/)]);
			expect(streams[0]).not.toContain(partnershipId);
		} finally {
			await ada.close();
			await bo.close();
		}
	});

	test('switching keeps the page and re-filters it; Everyone shows both, each saying whose', async ({
		browser
	}) => {
		const { ada, bo } = await sharedNotebook(browser);
		try {
			const tag = crypto.randomUUID().slice(0, 6);
			// Bo is in the partnership's context, from its card.
			await expect(control(bo.page)).toHaveAccessibleName(/^Showing Ada/);
			const ours = await titled(bo.page, 'note', `Ours ${tag}`);

			await bo.page.goto('/notebook');
			await waitForHydration(bo.page);
			await pick(bo.page, 'Me');
			await expect(bo.page).toHaveURL(/\/notebook$/);
			await bo.page.getByRole('tab', { name: 'Notes' }).click();
			await expect(bo.page.getByRole('link', { name: new RegExp(`Ours ${tag}`) })).toHaveCount(0);
			await titled(bo.page, 'note', `Mine ${tag}`);

			await bo.page.goto('/notebook');
			await waitForHydration(bo.page);
			await pick(bo.page, 'Everyone');
			await bo.page.getByRole('tab', { name: 'Notes' }).click();
			await expect(bo.page.getByRole('link', { name: new RegExp(`Ours ${tag}`) })).toContainText(
				'Ada'
			);
			await expect(bo.page.getByRole('link', { name: new RegExp(`Mine ${tag}`) })).toContainText(
				'Me'
			);

			// A partnership's entry opened in Me is still the partnership's.
			await pick(bo.page, 'Me');
			await bo.page.goto(ours);
			await expect(bo.page.locator('header .corner')).toContainText('Ada');
			await expect(surface(bo.page)).toBeVisible();
			// Control is shared and Bo started it, so its settings are his.
			await expect(bo.page.locator('wa-button', { hasText: 'Settings' })).toBeVisible();
		} finally {
			await ada.close();
			await bo.close();
		}
	});

	test('a new entry in Everyone asks whose it is first, with the add button’s fan', async ({
		browser
	}) => {
		const { ada, bo } = await sharedNotebook(browser);
		try {
			await showContext(ada.page, 'all');
			await ada.page.goto('/notebook');
			await waitForHydration(ada.page);
			await expect(control(ada.page)).toHaveAccessibleName(/^Showing Everyone/);
			await ada.page.getByRole('tab', { name: 'Notes' }).click();

			// Nothing is started until it is picked.
			await ada.page.getByRole('button', { name: 'New note: choose whose it’s for' }).click();
			await expect(ada.page.locator('[data-fan-option]')).toHaveCount(2);
			await expect(ada.page).toHaveURL(/\/notebook$/);

			await ada.page.getByRole('button', { name: 'New note for Bo', exact: true }).click();
			await ada.page.waitForURL(/\/notebook\/[0-9a-f-]{36}$/);
			await expect(ada.page.locator('header .corner')).toContainText('Bo');
			const id = ada.page.url().split('/').at(-1) ?? '';
			const { rows } = await sql('SELECT partnership_id FROM notebook_entries WHERE id = ?', [id]);
			expect(rows[0]?.partnership_id).toBeTruthy();

			// A journal entry asks for its date too, for the one picked.
			await ada.page.goto('/notebook');
			await waitForHydration(ada.page);
			await ada.page.getByRole('tab', { name: 'Journal' }).click();
			await startAdding(ada.page, 'New journal entry', 'me');
			const dialog = ada.page.locator('wa-dialog');
			await expect(dialog.locator('wa-input[name="entryDate"]')).toBeVisible();
			await clickWaButton(ada.page, 'Start entry');
			await ada.page.waitForURL(/\/notebook\/[0-9a-f-]{36}$/);
			const journalId = ada.page.url().split('/').at(-1) ?? '';
			const journal = await sql('SELECT partnership_id, kind FROM notebook_entries WHERE id = ?', [
				journalId
			]);
			expect(journal.rows[0]?.partnership_id).toBeNull();
			expect(journal.rows[0]?.kind).toBe('journal');
		} finally {
			await ada.close();
			await bo.close();
		}
	});

	test('another tab switching does not move where this one creates; coming back refreshes it', async ({
		browser
	}) => {
		const { ada, bo, partnershipId } = await sharedNotebook(browser);
		const second = await bo.page.context().newPage();
		try {
			await bo.page.goto('/notebook');
			await waitForHydration(bo.page);
			await pick(bo.page, 'Me');
			await bo.page.getByRole('tab', { name: 'Notes' }).click();

			// The same device, another tab: the cookie is the device's.
			await showContext(second, 'all');

			// This tab still shows Me, so what it starts is Bo's own.
			await expect(control(bo.page)).toHaveAccessibleName(/^Showing Me/);
			const url = await startEntry(bo.page, 'note');
			const id = url.split('/').at(-1) ?? '';
			const { rows } = await sql(
				'SELECT partnership_id, owner_id FROM notebook_entries WHERE id = ?',
				[id]
			);
			expect(rows[0]?.partnership_id).toBeNull();
			expect(rows[0]?.owner_id).toBeTruthy();

			// Back on the list, the tab coming to the front again sees the cookie
			// changed under it and follows.
			await bo.page.goto('/notebook');
			await expect(control(bo.page)).toHaveAccessibleName(/^Showing Everyone/);
			await showContext(second, partnershipId);
			await bo.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
			await expect(control(bo.page)).toHaveAccessibleName(/^Showing Ada/);
		} finally {
			await second.close();
			await ada.close();
			await bo.close();
		}
	});

	test('the old notebook addresses are gone', async ({ browser }) => {
		const side = await newSide(browser, 'Ada');
		try {
			await newAccount(side.page, side.who);
			expect((await side.page.goto('/home/notebook'))?.status()).toBe(404);
		} finally {
			await side.close();
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
			await newAccount(side.page, side.who);
			await side.page.goto('/notebook');
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
			await newAccount(side.page, side.who);
			await side.page.goto('/notebook');
			const url = await startEntry(side.page, 'note');

			let refused = 0;
			await side.page.route('**/api/notebook/entries/*/updates', (route) => {
				if (route.request().method() !== 'POST') {
					return route.continue();
				}
				refused += 1;
				return route.abort();
			});
			await typeRichText(side.page, 'Written on a train.');
			await expect(side.page.getByText(/Offline: changes kept on this device/)).toBeVisible({
				timeout: 15_000
			});

			// A reload while still offline: the edit comes back from the device.
			// Kept on the device before the reload: the last keystrokes reach the
			// outbox in a batch up to 400ms later, and are encrypted on the way,
			// so a reload straight after typing could beat them there. Nothing
			// says when that has happened, so poll it a second apart, longer than a
			// batch takes, until two readings in a row agree.
			const kept = () =>
				side.page.evaluate(
					() =>
						Object.entries(localStorage).find(([key]) =>
							key.startsWith('bound-up:notebook-outbox')
						)?.[1] ?? null
				);
			let lastKept: string | null = null;
			await expect
				.poll(
					async () => {
						const now = await kept();
						const still = now !== null && now === lastKept;
						lastKept = now;
						return still;
					},
					{ intervals: [1000], timeout: 15_000 }
				)
				.toBe(true);

			refused = 0;
			await side.page.goto(url);
			await expect(surface(side.page)).toContainText('Written on a train.');

			// Offline long enough for the backoff to grow: four refusals after the
			// reload (1, 2 and 4 seconds apart) put the next try 8 seconds off.
			await expect.poll(() => refused, { timeout: 20_000 }).toBeGreaterThanOrEqual(4);

			// Back online, as the browser says when the connection returns: it
			// sends at once, well inside the 8 seconds its backoff would have
			// waited. It used to wait them out, and with the backoff grown to its
			// 30 second cap that ran a slow CI run past the test's time.
			await side.page.unroute('**/api/notebook/entries/*/updates');
			await side.page.evaluate(() => globalThis.dispatchEvent(new Event('online')));
			await expect(side.page.getByText('Saved')).toBeVisible({ timeout: 5000 });

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
