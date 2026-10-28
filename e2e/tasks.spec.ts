import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { defined } from '../src/lib/testing/defined';
import { sql } from './db';
import { test } from './fixtures';
import {
	clickWaButton,
	closeCredits,
	contextOf,
	createInvite,
	creditsRow,
	fillRichText,
	linkAccounts,
	newAccount,
	newAccounts,
	newSide,
	openCredits,
	showContext,
	startAdding,
	typeRichText,
	waitForHydration,
	waitForSheetClosed
} from './helpers';

test.describe('tasks', () => {
	/**
	 * The floating toolbar, which had three separate faults worth pinning.
	 *
	 * Selecting a word by double-clicking used to come out bold: the toolbar
	 * was drawn over the text it described, so the second click of the
	 * double-click landed on a format button. It was also positioned inside the
	 * field — a bordered box with `overflow-y: auto` — which clipped it and made
	 * the field scroll. And pressing a button dismissed it, because focus left
	 * the editor and the selection collapsed.
	 */
	test('the formatting toolbar formats only when asked, and survives being used', async ({
		browser
	}) => {
		const ada = await newSide(browser, 'Ada');

		try {
			await newAccount(ada.page, ada.who);
			await ada.page.goto('/tasks/add');
			const surface = ada.page.locator('.task-form .richtext-editor .surface').first();
			await typeRichText(ada.page.locator('.task-form'), 'Take your time');

			const box = defined(await surface.boundingBox(), 'the editor surface box');
			await ada.page.mouse.dblclick(box.x + 20, box.y + box.height / 2);

			const toolbar = ada.page.getByRole('toolbar', { name: 'Text formatting' });
			await expect(toolbar).toBeVisible();

			// Selecting is not formatting.
			await expect(surface.locator('strong')).toHaveCount(0);

			// It lives outside the field, so it cannot clip or grow it: in the
			// add sheet's dialog, since outside a modal dialog it could not be
			// clicked at all.
			await expect(toolbar).toHaveJSProperty('parentElement.tagName', 'WA-DIALOG');

			await toolbar.getByRole('button', { name: 'Bold' }).click();
			await expect(surface.locator('strong')).toHaveText('Take');
			// Still there: the press must not collapse the selection behind it.
			await expect(toolbar).toBeVisible();
		} finally {
			await ada.close();
		}
	});

	test('a user can manage and complete self tasks from Today', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');

		try {
			await newAccount(ada.page, ada.who);
			await ada.page.waitForURL('**/today');
			// Today's card, not the nav's tab of the same name.
			await ada.page.getByRole('main').getByRole('link', { name: 'Tasks', exact: true }).click();
			await ada.page.waitForURL(/\/tasks$/);

			await startAdding(ada.page, 'Add a task');
			await ada.page.waitForURL(/\/tasks\/add$/);
			await waitForHydration(ada.page);
			await ada.page.locator('wa-input[name="title"] input').fill('Long shower');
			/**
			 * Typed key by key, not bulk-filled, and that is the point.
			 *
			 * The editor used to be torn down and rebuilt on every change, because
			 * its setup effect read the `value` prop the form fed straight back to
			 * it. Only the first character survived and the caret jumped to the
			 * start, so the text came out reversed. A `fill()` is a single
			 * insertion and passes happily against that; typing does not.
			 */
			await typeRichText(ada.page.locator('.task-form'), 'Take your time');
			await expect(ada.page.locator('.task-form .richtext-editor .surface').first()).toHaveText(
				'Take your time'
			);
			await ada.page.locator('wa-input[name="creditsAwarded"] input').fill('2');
			await ada.page
				.locator('wa-textarea[name="completionMessagesText"] textarea')
				.fill('Nicely done');
			await clickWaButton(ada.page, 'Add task');
			await waitForSheetClosed(ada.page, /\/tasks$/);

			const ready = ada.page.locator('.item-group').filter({ hasText: 'Ready' });
			await expect(ready.getByRole('button', { name: /^Long shower/ })).toBeVisible();

			// The circle submits in the background (use:enhance) and celebrates
			// before the list refreshes, so wait for the action's answer rather
			// than the page: navigating straight away could cancel the request.
			const posted = (action: string) =>
				ada.page.waitForResponse(
					(response) => response.request().method() === 'POST' && response.url().includes(action)
				);
			await waitForHydration(ada.page);
			let completed = posted('?/complete');
			await ada.page.getByRole('button', { name: 'Complete Long shower' }).click();
			expect((await completed).ok()).toBe(true);

			// The task's own line offers it back, where it was tapped.
			const undoLine = ready.locator('.item-row').filter({ hasText: 'Completed · +2' });
			await expect(undoLine).toContainText('Long shower');
			await expect(ready.getByRole('button', { name: 'Complete Long shower' })).toHaveCount(0);

			// Undo is real: the task is ready again and the credits are gone.
			const undone = posted('?/undo');
			await undoLine.getByRole('button', { name: 'Undo' }).click();
			expect((await undone).ok()).toBe(true);
			await expect(ready.getByRole('button', { name: 'Complete Long shower' })).toBeVisible();

			// The deliberate way: open the task and complete it from its detail.
			await ready.getByRole('button', { name: /^Long shower/ }).click();
			const dialog = ada.page.locator('wa-dialog');
			await expect(dialog).toContainText('Take your time');
			completed = posted('?/complete');
			await clickWaButton(ada.page, /^Complete · \+2$/);
			expect((await completed).ok()).toBe(true);
			await expect(undoLine).toBeVisible();

			await ada.page.goto('/rewards');
			await expect(ada.page.locator('.credits-chip')).toContainText('You 2');
		} finally {
			await ada.close();
		}
	});

	/**
	 * A to-do list in a description is ticked from the task's sheet, without
	 * opening its edit form, and the tick is saved: the one place a document
	 * shown read-only can change (docs/rich-text.md, "To-do lists").
	 */
	test("a to-do list in a task's description is ticked from its sheet, and stays ticked", async ({
		browser
	}) => {
		const ada = await newSide(browser, 'Ada');

		try {
			await newAccount(ada.page, ada.who);
			await ada.page.goto('/tasks/add');
			await waitForHydration(ada.page);
			await ada.page.locator('wa-input[name="title"] input').fill('Pack');
			const form = ada.page.locator('.task-form');
			// Typed, because `[ ] ` is a typing shortcut: it is what makes the list.
			await typeRichText(form, '[ ] towel');
			await ada.page.keyboard.press('Enter');
			await ada.page.keyboard.type('snacks', { delay: 15 });
			const editorItems = form.locator('.richtext-editor .surface li');
			await expect(editorItems).toHaveText(['towel', 'snacks']);
			await expect(editorItems.first()).toHaveAttribute('aria-checked', 'false');
			await clickWaButton(ada.page, 'Add task');
			await waitForSheetClosed(ada.page, /\/tasks$/);

			const openSheet = async () => {
				await waitForHydration(ada.page);
				await ada.page.getByRole('button', { name: /^Pack/ }).click();
				const dialog = ada.page.locator('wa-dialog');
				await expect(dialog.locator('wa-checkbox')).toHaveCount(2);
				return dialog;
			};
			let dialog = await openSheet();
			const snacks = dialog.locator('wa-checkbox').filter({ hasText: 'snacks' });
			await expect(snacks).toHaveJSProperty('checked', false);
			await expect(snacks).toHaveJSProperty('disabled', false);

			const saved = ada.page.waitForResponse(
				(response) => response.request().method() === 'POST' && response.url().includes('?/content')
			);
			await snacks.click();
			expect((await saved).ok()).toBe(true);
			await expect(snacks).toHaveJSProperty('checked', true);

			// Saved, not just drawn: a fresh page reads it ticked from the server.
			await ada.page.reload();
			dialog = await openSheet();
			await expect(dialog.locator('wa-checkbox').filter({ hasText: 'snacks' })).toHaveJSProperty(
				'checked',
				true
			);
			await expect(dialog.locator('wa-checkbox').filter({ hasText: 'towel' })).toHaveJSProperty(
				'checked',
				false
			);

			// And the edit form opens on the ticked document, at the revision the
			// tick wrote, so saving it from there is not refused as a conflict.
			// A `wa-button` with an `href` is a link.
			await dialog.getByRole('link', { name: 'Edit' }).click();
			const items = ada.page.locator('.task-form .richtext-editor .surface li');
			await expect(items.filter({ hasText: 'snacks' })).toHaveAttribute('aria-checked', 'true');
			await clickWaButton(ada.page, 'Save task');
			await waitForSheetClosed(ada.page, /\/tasks$/);
		} finally {
			await ada.close();
		}
	});

	/**
	 * A task's detail is a sheet on a phone and a dialog on a wider screen,
	 * decided by CSS alone (`ResponsiveDialog`). Only a real page can show it
	 * clear of the app shell and its nav, which a sheet pinned to the bottom of
	 * the layout viewport would sit behind.
	 */
	test("a task's detail is a sheet on a phone and a dialog on a desktop", async ({ browser }) => {
		const ada = await newSide(browser, 'Ada', {
			viewport: { width: 390, height: 844 },
			hasTouch: true,
			isMobile: true
		});

		try {
			await newAccount(ada.page, ada.who);
			await ada.page.goto('/tasks/add');
			await waitForHydration(ada.page);
			await ada.page.locator('wa-input[name="title"] input').fill('Stretch');
			await clickWaButton(ada.page, 'Add task');
			await waitForSheetClosed(ada.page, /\/tasks$/);

			const panel = async () =>
				await ada.page.locator('wa-dialog').evaluate(async (dialog) => {
					await (dialog as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;
					await new Promise((done) => requestAnimationFrame(done));
					const rect = dialog.shadowRoot
						?.querySelector('[part~="dialog"]')
						?.getBoundingClientRect();
					return rect && { left: rect.left, width: rect.width, bottom: rect.bottom };
				});

			await waitForHydration(ada.page);
			await ada.page.getByRole('button', { name: /^Stretch/ }).click();
			await expect.poll(panel).toEqual({ left: 0, width: 390, bottom: expect.closeTo(844, 0) });

			await ada.page.keyboard.press('Escape');
			await expect(ada.page.locator('wa-dialog')).toHaveCount(0);

			await ada.page.setViewportSize({ width: 1280, height: 800 });
			await ada.page.getByRole('button', { name: /^Stretch/ }).click();
			await expect.poll(async () => (await panel())?.width).toBe(512);
			const centred = await panel();
			expect(centred?.left).toBeCloseTo((1280 - 512) / 2, 0);
			expect(centred?.bottom).toBeLessThan(800);
		} finally {
			await ada.close();
		}
	});

	/**
	 * Today's cards, which only this level can check.
	 *
	 * Checked against the real page: whether the header link survives the
	 * custom element, and whether the body renders beside it. The accessible
	 * name is the load-bearing part: the
	 * cards replaced `wa-button`s that every other spec here locates by these
	 * exact words.
	 */
	test('Today’s cards preview what is behind them and still link there', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');

		try {
			await newAccount(ada.page, ada.who);
			await ada.page.waitForURL('**/today');

			/**
			 * A fresh account has nothing in any section, so every card is a
			 * header and nothing else — no "Nothing to do right now." line. Only
			 * a real browser can check that: the body div lives in wa-card's
			 * shadow root and is collapsed through `::part`.
			 */
			const tasks = ada.page.locator('wa-card').filter({ hasText: 'Tasks' });
			await expect(tasks).toHaveText('Tasks');
			await expect(tasks.locator('wa-card')).toHaveCount(0);

			const rewards = ada.page.locator('wa-card').filter({ hasText: 'Rewards' });
			await expect(rewards).toHaveText('Rewards');

			// Nothing is unread, so the messages card is absent entirely rather
			// than present and empty.
			await expect(ada.page.locator('wa-card').filter({ hasText: 'Messages' })).toHaveCount(0);

			// Still the bare word, upgraded element and all.
			await ada.page.getByRole('link', { name: 'Rewards' }).click();
			await ada.page.waitForURL(/\/rewards$/);
		} finally {
			await ada.close();
		}
	});

	test('the controlling side can create a partner task and the other side can complete it', async ({
		browser
	}) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');

		try {
			await newAccount(ada.page, ada.who);
			await ada.page.waitForURL('**/today');
			const link = await createInvite(ada.page, {
				partnerName: 'Jun',
				yourName: 'Ada',
				control: 'them'
			});

			await newAccount(jun.page, jun.who);
			await jun.page.waitForURL('**/today');
			await jun.page.goto(link);
			await clickWaButton(jun.page, 'Accept and link');
			// Into Today, in the new partnership's context.
			await jun.page.waitForURL((url) => url.pathname === '/today');
			const partnershipId = await contextOf(jun.page);

			// After hydration: before it the card is a plain link, which would not
			// set the partnership's context on the way.
			await waitForHydration(jun.page);
			await jun.page.getByRole('main').getByRole('link', { name: 'Tasks', exact: true }).click();
			await jun.page.waitForURL(/\/tasks$/);
			await startAdding(jun.page, 'Add a task');
			await jun.page.waitForURL(/\/tasks\/add$/);
			await waitForHydration(jun.page);
			await jun.page.locator('wa-input[name="title"] input').fill('Make tea');
			await fillRichText(jun.page.locator('.task-form'), 'With the good teapot');
			await jun.page.locator('wa-input[name="creditsAwarded"] input').fill('3');
			await jun.page.locator('wa-textarea[name="completionMessagesText"] textarea').fill('Perfect');
			await clickWaButton(jun.page, 'Add task');
			await waitForSheetClosed(jun.page, /\/tasks$/);
			// Jun set it, so Jun watches it rather than ticks it.
			const waiting = jun.page.getByRole('region', { name: 'Tasks set for Ada' });
			await expect(waiting.getByRole('button', { name: /^Make tea/ })).toBeVisible();
			await expect(jun.page.getByRole('button', { name: 'Complete Make tea' })).toHaveCount(0);

			/**
			 * The bug Today's cards (then /home's) shipped with: the tasks card read the solo
			 * half only, so it said "Nothing to do right now." while this very
			 * task sat assigned one tap away. Today's card in Everyone covers every space,
			 * as /tasks does in Everyone, which is where it leads.
			 */
			await ada.page.goto('/today');
			const tasksCard = ada.page.locator('wa-card').filter({ hasText: 'Tasks' });
			await expect(tasksCard).toContainText('Make tea');
			// Attributed, because two partners can name a task the same thing.
			await expect(tasksCard).toContainText('Jun');
			await expect(tasksCard).not.toContainText('Nothing to do right now.');

			// Following the card opens /tasks in Everyone, where each row says
			// whose space it is in.
			await waitForHydration(ada.page);
			await tasksCard.getByRole('link', { name: 'Tasks' }).click();
			await ada.page.waitForURL(/\/tasks$/);
			const row = ada.page.locator('.item-row').filter({ hasText: 'Make tea' });
			await expect(row.locator('.chip')).toHaveText('Jun');
			const posted = ada.page.waitForResponse(
				(response) =>
					response.request().method() === 'POST' && response.url().includes('?/complete')
			);
			await waitForHydration(ada.page);
			await ada.page.getByRole('button', { name: 'Complete Make tea' }).click();
			expect((await posted).ok()).toBe(true);
			await expect(row).toContainText('Completed · +3');

			// Done, so it is inactive: in the partnership's own context it waits,
			// folded away, and the history says who did it.
			await showContext(ada.page, partnershipId);
			await ada.page.goto('/today');
			await waitForHydration(ada.page);
			await ada.page.getByRole('main').getByRole('link', { name: 'Tasks', exact: true }).click();
			await ada.page.waitForURL(/\/tasks$/);
			await ada.page.locator('wa-details.collapsed').filter({ hasText: 'Inactive' }).click();
			await expect(ada.page.getByRole('button', { name: /^Make tea/ })).toBeVisible();
			await ada.page.getByRole('link', { name: 'Completed tasks' }).click();
			await ada.page.waitForURL(/\/tasks\/history$/);
			await expect(ada.page.getByText('Completed by you')).toBeVisible();

			// History is a sheet over the list, with its own URL; closing it is
			// going back to the list.
			await ada.page.locator('wa-dialog').getByRole('button', { name: 'Close' }).click();
			await ada.page.waitForURL(/\/tasks$/);

			// The credits are Ada's in her partnership with Jun: the tab across
			// to the rewards shows them in the same context.
			await ada.page.getByRole('link', { name: 'Rewards', exact: true }).click();
			await ada.page.waitForURL(/\/rewards$/);
			await expect(ada.page.locator('.credits-chip')).toContainText('You 3');
		} finally {
			await ada.close();
			await jun.close();
		}
	});
});

/**
 * Tasks follow the context (docs/contexts.md): the switcher re-filters the
 * list in place, Everyone shows every space with a chip on each row, adding
 * in Everyone asks for whom, and a completion pays into the wallet of the
 * task's own space.
 */
test.describe('tasks in every context', () => {
	const control = (page: Page) => page.getByRole('button', { name: /^Showing / });

	async function pick(page: Page, name: string) {
		await control(page).click();
		await page.getByRole('button', { name: `Show ${name}` }).click();
		await expect(control(page)).toHaveAccessibleName(new RegExp(`^Showing ${name}`));
		await expect(control(page)).toHaveAttribute('aria-expanded', 'false');
	}

	/**
	 * Adds a task with the add button, picking whom it is for from its fan
	 * where it asks (Everyone): "me", or a partner's name.
	 */
	async function addTask(page: Page, title: string, forWhom: string | null) {
		await startAdding(page, 'Add a task', forWhom ?? undefined);
		await page.waitForURL(/\/tasks\/add$/);
		await waitForHydration(page);
		// Picked on the fan, so the sheet does not ask again.
		await expect(page.locator('wa-select[name="spaceId"]')).toHaveCount(0);
		await page.locator('wa-input[name="title"] input').fill(title);
		await page.locator('wa-input[name="creditsAwarded"] input').fill('4');
		await clickWaButton(page, 'Add task');
		await waitForSheetClosed(page, /\/tasks$/);
	}

	test('switching keeps the page; Everyone shows both with chips, and asks for whom', async ({
		browser
	}) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');
		try {
			await newAccounts(ada, jun);
			const partnershipId = await linkAccounts(ada, jun, 'mix');
			const tag = crypto.randomUUID().slice(0, 6);

			await showContext(ada.page, 'all');
			await ada.page.goto('/tasks');
			await waitForHydration(ada.page);
			await expect(control(ada.page)).toHaveAccessibleName(/^Showing Everyone/);

			// In Everyone the add button asks whose a new task is, with a fan
			// of the places it can go and nothing else.
			await ada.page.getByRole('button', { name: 'Add a task: choose whose it’s for' }).click();
			await expect(ada.page.locator('[data-fan-option]')).toHaveCount(2);
			await expect(ada.page.getByRole('button', { name: 'Add a task for me' })).toBeVisible();
			await expect(ada.page.getByRole('button', { name: 'Add a task for Jun' })).toBeVisible();
			await ada.page.keyboard.press('Escape');
			await expect(ada.page.locator('[data-fan-option]')).toHaveCount(0);
			// Opened by its URL, with nothing picked, the sheet asks instead,
			// before the form appears.
			await ada.page.goto('/tasks/add');
			await expect(ada.page.locator('wa-select[name="spaceId"]')).toBeVisible();
			await expect(ada.page.locator('.task-form')).toHaveCount(0);
			await ada.page.goto('/tasks');
			await waitForHydration(ada.page);

			await addTask(ada.page, `Mine ${tag}`, 'me');
			await addTask(ada.page, `For Jun ${tag}`, 'Jun');
			// Where it went is what the form chose, not the context.
			const { rows } = await sql(
				'SELECT space_id, assignee_user_id FROM tasks WHERE space_id = ?',
				[partnershipId]
			);
			expect(rows).toHaveLength(1);

			// Both lists at once, each row saying whose space it is in.
			const mine = ada.page.locator('.item-row').filter({ hasText: `Mine ${tag}` });
			await expect(mine.locator('.chip')).toHaveText('Me');
			const set = ada.page.getByRole('region', { name: 'Set for others' });
			await expect(set.locator('.item-row').filter({ hasText: `For Jun ${tag}` })).toBeVisible();

			// Switching re-filters the same page in place.
			await pick(ada.page, 'Me');
			await expect(ada.page).toHaveURL(/\/tasks$/);
			await expect(mine).toBeVisible();
			await expect(mine.locator('.chip')).toHaveCount(0);
			await expect(ada.page.getByRole('region', { name: 'Set for others' })).toHaveCount(0);

			await pick(ada.page, 'Jun');
			await expect(ada.page).toHaveURL(/\/tasks$/);
			await expect(ada.page.locator('.item-row').filter({ hasText: `Mine ${tag}` })).toHaveCount(0);
			await expect(
				ada.page.getByRole('region', { name: 'Set for others' }).getByText(`For Jun ${tag}`)
			).toBeVisible();

			// And the Rewards tab keeps the context.
			await ada.page.getByRole('link', { name: 'Rewards', exact: true }).click();
			await ada.page.waitForURL(/\/rewards$/);
			await expect(control(ada.page)).toHaveAccessibleName(/^Showing Jun/);
		} finally {
			await ada.close();
			await jun.close();
		}
	});

	test('completing a task a partner set credits that partnership’s wallet, not your own', async ({
		browser
	}) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');
		try {
			await newAccounts(ada, jun);
			const partnershipId = await linkAccounts(ada, jun, 'me');
			const tag = crypto.randomUUID().slice(0, 6);

			await showContext(ada.page, partnershipId);
			await ada.page.goto('/tasks');
			await waitForHydration(ada.page);
			await addTask(ada.page, `Water ${tag}`, null);

			await showContext(jun.page, 'all');
			await jun.page.goto('/tasks');
			await waitForHydration(jun.page);
			const posted = jun.page.waitForResponse(
				(response) =>
					response.request().method() === 'POST' && response.url().includes('?/complete')
			);
			await jun.page.getByRole('button', { name: `Complete Water ${tag}` }).click();
			expect((await posted).ok()).toBe(true);

			// Two balances, kept apart: his own stays at nothing, and the four
			// are his with Ada.
			await jun.page.goto('/rewards');
			const juns = await openCredits(jun.page);
			await expect(creditsRow(juns, 'Ada')).toContainText(/You\s*4/);
			await expect(creditsRow(juns, 'Me')).toContainText(/You\s*0/);
			await closeCredits(jun.page);

			// Ada, who set it, sees Jun's balance where she keeps his rewards:
			// in their partnership's context, in the chip itself.
			await ada.page.goto('/rewards');
			await expect(ada.page.locator('.credits-chip')).toContainText('Jun 4');
		} finally {
			await ada.close();
			await jun.close();
		}
	});
});
