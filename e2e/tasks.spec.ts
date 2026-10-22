import { expect } from '@playwright/test';
import { defined } from '../src/lib/testing/defined';
import { test } from './fixtures';
import {
	clickWaButton,
	createInvite,
	fillRichText,
	newAccount,
	newSide,
	typeRichText,
	waitForHydration
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
			await ada.page.goto('/home/tasks/add');
			const surface = ada.page.locator('.task-form .richtext-editor .surface').first();
			await typeRichText(ada.page.locator('.task-form'), 'Take your time');

			const box = defined(await surface.boundingBox(), 'the editor surface box');
			await ada.page.mouse.dblclick(box.x + 20, box.y + box.height / 2);

			const toolbar = ada.page.getByRole('toolbar', { name: 'Text formatting' });
			await expect(toolbar).toBeVisible();

			// Selecting is not formatting.
			await expect(surface.locator('strong')).toHaveCount(0);

			// It lives on <body>, so it cannot clip or grow the field it belongs to.
			await expect(toolbar).toHaveJSProperty('parentElement.tagName', 'BODY');

			await toolbar.getByRole('button', { name: 'Bold' }).click();
			await expect(surface.locator('strong')).toHaveText('Take');
			// Still there: the press must not collapse the selection behind it.
			await expect(toolbar).toBeVisible();
		} finally {
			await ada.close();
		}
	});

	test('a user can manage and complete self tasks from home', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');

		try {
			await newAccount(ada.page, ada.who);
			await ada.page.waitForURL('**/home');
			await ada.page.getByRole('link', { name: 'Tasks' }).click();
			await ada.page.waitForURL(/\/home\/tasks$/);

			await ada.page.getByRole('link', { name: 'Add a task' }).click();
			await ada.page.waitForURL(/\/home\/tasks\/add$/);
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
			await ada.page.waitForURL(/\/home\/tasks$/);

			const ready = ada.page.locator('.item-group').filter({ hasText: 'Ready' });
			await expect(ready.getByRole('button', { name: /Long shower/ })).toBeVisible();

			// The circle submits in the background (use:enhance) and celebrates
			// before the list refreshes, so wait for the action's answer rather
			// than the page: navigating straight away could cancel the request.
			const posted = (action: string) =>
				ada.page.waitForResponse(
					(response) => response.request().method() === 'POST' && response.url().includes(action)
				);
			await waitForHydration(ada.page);
			let completed = posted('selfCompleteTask');
			await ada.page.getByRole('button', { name: 'Complete Long shower' }).click();
			expect((await completed).ok()).toBe(true);

			// The task's own line offers it back, where it was tapped.
			const undoLine = ready.locator('.item-row').filter({ hasText: 'Completed · +2' });
			await expect(undoLine).toContainText('Long shower');
			await expect(ready.getByRole('button', { name: 'Complete Long shower' })).toHaveCount(0);

			// Undo is real: the task is ready again and the credits are gone.
			const undone = posted('selfUndoCompletion');
			await undoLine.getByRole('button', { name: 'Undo' }).click();
			expect((await undone).ok()).toBe(true);
			await expect(ready.getByRole('button', { name: 'Complete Long shower' })).toBeVisible();

			// The deliberate way: open the task and complete it from its detail.
			await ready.getByRole('button', { name: /Long shower/ }).click();
			const dialog = ada.page.locator('wa-dialog');
			await expect(dialog).toContainText('Take your time');
			completed = posted('selfCompleteTask');
			await clickWaButton(ada.page, /^Complete · \+2$/);
			expect((await completed).ok()).toBe(true);
			await expect(undoLine).toBeVisible();

			await ada.page.goto('/home/rewards');
			await expect(ada.page.locator('.balances li').filter({ hasText: 'Yours' })).toContainText(
				'2'
			);
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
			await signUp(ada.page, ada.who);
			await ada.page.goto('/home/tasks/add');
			await waitForHydration(ada.page);
			await ada.page.locator('wa-input[name="title"] input').fill('Stretch');
			await clickWaButton(ada.page, 'Add task');
			await ada.page.waitForURL(/\/home\/tasks$/);

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
			await ada.page.getByRole('button', { name: /Stretch/ }).click();
			await expect.poll(panel).toEqual({ left: 0, width: 390, bottom: expect.closeTo(844, 0) });

			await ada.page.keyboard.press('Escape');
			await expect(ada.page.locator('wa-dialog')).toHaveCount(0);

			await ada.page.setViewportSize({ width: 1280, height: 800 });
			await ada.page.getByRole('button', { name: /Stretch/ }).click();
			await expect.poll(async () => (await panel())?.width).toBe(512);
			const centred = await panel();
			expect(centred?.left).toBeCloseTo((1280 - 512) / 2, 0);
			expect(centred?.bottom).toBeLessThan(800);
		} finally {
			await ada.close();
		}
	});

	/**
	 * The /home cards, which only this level can check.
	 *
	 * Checked against the real page: whether the header link survives the
	 * custom element, and whether the body renders beside it. The accessible
	 * name is the load-bearing part: the
	 * cards replaced `wa-button`s that every other spec here locates by these
	 * exact words.
	 */
	test('the home cards preview what is behind them and still link there', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');

		try {
			await newAccount(ada.page, ada.who);
			await ada.page.waitForURL('**/home');

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
			await ada.page.waitForURL(/\/home\/rewards$/);
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
			await ada.page.waitForURL('**/home');
			const link = await createInvite(ada.page, {
				partnerName: 'Jun',
				yourName: 'Ada',
				control: 'them'
			});

			await newAccount(jun.page, jun.who);
			await jun.page.waitForURL('**/home');
			await jun.page.goto(link);
			await clickWaButton(jun.page, 'Accept and link');
			await jun.page.waitForURL(/\/partner\/[0-9a-f-]{36}$/);
			const partnerPage = new URL(jun.page.url()).pathname.replace('/partner/', '');
			const adaPartnerTasks = `/partner/${partnerPage}/tasks`;

			await jun.page.getByRole('link', { name: 'Tasks' }).click();
			await jun.page.waitForURL(/\/tasks$/);
			await jun.page.getByRole('link', { name: 'Add a task' }).click();
			await jun.page.waitForURL(/\/tasks\/add$/);
			await waitForHydration(jun.page);
			await jun.page.locator('wa-input[name="title"] input').fill('Make tea');
			await fillRichText(jun.page.locator('.task-form'), 'With the good teapot');
			await jun.page.locator('wa-input[name="creditsAwarded"] input').fill('3');
			await jun.page.locator('wa-textarea[name="completionMessagesText"] textarea').fill('Perfect');
			await clickWaButton(jun.page, 'Add task');
			await jun.page.waitForURL(/\/tasks$/);
			// Jun set it, so Jun watches it rather than ticks it.
			const waiting = jun.page.getByRole('region', { name: 'Tasks set for Ada' });
			await expect(waiting.getByRole('button', { name: /Make tea/ })).toBeVisible();
			await expect(jun.page.getByRole('button', { name: 'Complete Make tea' })).toHaveCount(0);

			/**
			 * The bug the home cards shipped with: the tasks card read `selfTasks`
			 * only, so it said "Nothing to do right now." while this very task sat
			 * assigned one tap away. /home is an overview of /home/tasks, and that
			 * page shows your own section plus one per partner.
			 */
			await ada.page.goto('/home');
			const tasksCard = ada.page.locator('wa-card').filter({ hasText: 'Tasks' });
			await expect(tasksCard).toContainText('Make tea');
			// Attributed, because two partners can name a task the same thing.
			await expect(tasksCard).toContainText('Jun');
			await expect(tasksCard).not.toContainText('Nothing to do right now.');

			await ada.page.goto('/home/tasks');
			// In Ada's one list, marked as Jun's.
			const row = ada.page.locator('.item-row').filter({ hasText: 'Make tea' });
			await expect(row.locator('wa-avatar.who')).toHaveJSProperty('label', 'Jun');
			await waitForHydration(ada.page);
			await ada.page.getByRole('button', { name: 'Complete Make tea' }).click();
			// Still in place, though a partner's inactive task is not listed here.
			await expect(row).toContainText('Completed · +3');

			// Done, so it is inactive: on the partner page it waits, folded away.
			await ada.page.goto(adaPartnerTasks);
			await waitForHydration(ada.page);
			await ada.page.locator('wa-details.collapsed').filter({ hasText: 'Inactive' }).click();
			await expect(ada.page.getByRole('button', { name: /Make tea/ })).toBeVisible();
			await ada.page.getByRole('link', { name: 'Completion history' }).click();
			await ada.page.waitForURL(/\/partner\/[0-9a-f-]{36}\/tasks\/history$/);
			await expect(ada.page.getByText('Completed by you')).toBeVisible();

			// History is a sheet over the list, with its own URL; closing it is
			// going back to the list.
			await ada.page.locator('wa-dialog').getByRole('button', { name: 'Close' }).click();
			await ada.page.waitForURL(/\/partner\/[0-9a-f-]{36}\/tasks$/);
			await ada.page.getByRole('link', { name: 'Back to partner' }).click();
			await ada.page.waitForURL(/\/partner\/[0-9a-f-]{36}$/);
			await ada.page.getByRole('link', { name: 'Rewards' }).click();
			await ada.page.waitForURL(/\/rewards$/);
			await expect(ada.page.locator('.balances li').filter({ hasText: 'Yours' })).toContainText(
				'3'
			);
		} finally {
			await ada.close();
			await jun.close();
		}
	});
});
