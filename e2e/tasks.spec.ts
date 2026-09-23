import { expect } from '@playwright/test';
import { defined } from '../src/lib/testing/defined';
import { test } from './fixtures';
import {
	clickWaButton,
	createInvite,
	fillRichText,
	newSide,
	signUp,
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
			await signUp(ada.page, ada.who);
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
			await signUp(ada.page, ada.who);
			await ada.page.waitForURL('**/home');
			await ada.page.getByRole('link', { name: 'Tasks' }).click();
			await ada.page.waitForURL(/\/home\/tasks$/);

			await ada.page.getByRole('link', { name: 'Add a task' }).click();
			await ada.page.waitForURL(/\/home\/tasks\/add$/);
			await waitForHydration(ada.page);
			await ada.page.locator('input[name="title"]').fill('Long shower');
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
			await ada.page.locator('input[name="creditsAwarded"]').fill('2');
			await ada.page.locator('textarea[name="completionMessagesText"]').fill('Nicely done');
			await clickWaButton(ada.page, 'Add task');
			await ada.page.waitForURL(/\/home\/tasks$/);

			await expect(ada.page.getByRole('heading', { name: 'Long shower' })).toBeVisible();
			await clickWaButton(ada.page, 'Complete');
			await expect(ada.page.getByRole('heading', { name: 'Long shower' })).toBeVisible();

			await ada.page.goto('/home/rewards');
			await expect(ada.page.locator('.self .title-row')).toContainText('Credits: 2');
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
			await signUp(ada.page, ada.who);
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
			await signUp(ada.page, ada.who);
			await ada.page.waitForURL('**/home');
			const link = await createInvite(ada.page, {
				partnerName: 'Jun',
				yourName: 'Ada',
				control: 'them'
			});

			await signUp(jun.page, jun.who);
			await jun.page.waitForURL('**/home');
			await jun.page.goto(link);
			await clickWaButton(jun.page, 'Accept and link');
			await jun.page.waitForURL(/\/partner\/[0-9a-f-]{36}$/);

			await jun.page.getByRole('link', { name: 'Tasks' }).click();
			await jun.page.waitForURL(/\/tasks$/);
			await jun.page.getByRole('link', { name: 'Add a task' }).click();
			await jun.page.waitForURL(/\/tasks\/add$/);
			await waitForHydration(jun.page);
			await jun.page.locator('input[name="title"]').fill('Make tea');
			await fillRichText(jun.page.locator('.task-form'), 'With the good teapot');
			await jun.page.locator('input[name="creditsAwarded"]').fill('3');
			await jun.page.locator('textarea[name="completionMessagesText"]').fill('Perfect');
			await clickWaButton(jun.page, 'Add task');
			await jun.page.waitForURL(/\/tasks$/);
			await expect(jun.page.getByRole('heading', { name: 'Make tea' })).toBeVisible();

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
			await expect(ada.page.locator('.partner-sections')).toContainText("Jun's Tasks");
			await clickWaButton(ada.page, 'Complete');
			await expect(ada.page.getByText('Task completed.')).toBeVisible();

			await ada.page.getByRole('link', { name: 'Open full task list' }).click();
			await ada.page.waitForURL(/\/partner\/[0-9a-f-]{36}\/tasks$/);
			await expect(ada.page.getByRole('heading', { name: 'Make tea' })).toBeVisible();
			await ada.page.getByRole('link', { name: 'Completion History' }).click();
			await ada.page.waitForURL(/\/partner\/[0-9a-f-]{36}\/tasks\/history$/);
			await expect(ada.page.getByText('Completed by you')).toBeVisible();

			await ada.page.getByRole('link', { name: 'Back to tasks' }).click();
			await ada.page.waitForURL(/\/partner\/[0-9a-f-]{36}\/tasks$/);
			await ada.page.getByRole('link', { name: 'Back to partner' }).click();
			await ada.page.waitForURL(/\/partner\/[0-9a-f-]{36}$/);
			await ada.page.getByRole('link', { name: 'Rewards' }).click();
			await ada.page.waitForURL(/\/rewards$/);
			await expect(ada.page.locator('.title-row').first()).toContainText('3');
		} finally {
			await ada.close();
			await jun.close();
		}
	});
});
