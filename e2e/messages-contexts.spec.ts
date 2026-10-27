import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { sql } from './db';
import { test } from './fixtures';
import {
	clickWaButton,
	fillRichText,
	linkAccounts,
	newAccounts,
	newSide,
	openBoard,
	type Side,
	showContext,
	waitForHydration,
	writeThread
} from './helpers';

/**
 * The messages board follows the context (docs/messaging.md, "The board in
 * each context"): a partnership's board in its context, every partner's
 * threads in Everyone with a chip on each, and an offer to switch in Me. A
 * thread's own page takes its partnership from the thread, and a new thread
 * names its partnership in the send, so nothing the context says moves it.
 */
test.describe('messages in every context', () => {
	const control = (page: Page) => page.getByRole('button', { name: /^Showing / });

	/** Bo, linked with Ada and with Cy, each of whom has written him a thread. */
	async function boWithTwoPartners(browser: Parameters<typeof newSide>[0]) {
		const ada = await newSide(browser, 'Ada');
		const bo = await newSide(browser, 'Bo');
		const cy = await newSide(browser, 'Cy');
		await newAccounts(ada, bo, cy);
		await linkAccounts(ada, bo);
		const withAda = bo.page.url().split('/').at(-1) ?? '';
		await linkAccounts(cy, bo);
		const withCy = bo.page.url().split('/').at(-1) ?? '';

		await ada.page.goto('/home');
		await openBoard(ada.page, 'Bo');
		await writeThread(ada.page, 'from Ada');
		await cy.page.goto('/home');
		await openBoard(cy.page, 'Bo');
		await writeThread(cy.page, 'from Cy');
		return { ada, bo, cy, withAda, withCy };
	}

	async function closeAll(...sides: Side[]) {
		await Promise.all(sides.map((side) => side.close()));
	}

	async function soloSpaceOf(email: string): Promise<string> {
		const { rows } = await sql(
			`SELECT m.space_id AS id FROM space_members m JOIN spaces s ON s.id = m.space_id
			  WHERE s.kind = 'solo' AND m.user_id = (SELECT id FROM user WHERE email = ?)`,
			[email.toLowerCase()]
		);
		return String(rows[0]?.id);
	}

	async function partnershipOfThread(page: Page): Promise<string> {
		const threadId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
		const { rows } = await sql('SELECT partnership_id AS id FROM message_threads WHERE id = ?', [
			threadId
		]);
		return String(rows[0]?.id);
	}

	test('Everyone shows every partner’s threads, each wearing whose it is', async ({ browser }) => {
		const { ada, bo, cy } = await boWithTwoPartners(browser);
		try {
			await showContext(bo.page, 'all');
			await bo.page.goto('/messages');
			await waitForHydration(bo.page);
			await expect(control(bo.page)).toHaveAccessibleName(/^Showing Everyone/);

			const unread = bo.page.getByRole('list', { name: 'Unread' });
			await expect(unread.getByRole('listitem')).toHaveCount(2);
			const chips = unread.getByTestId('sticker-space');
			await expect(chips).toHaveCount(2);
			// Newest first: Cy wrote last.
			await expect(chips.nth(0)).toHaveText('Cy');
			await expect(chips.nth(1)).toHaveText('Ada');
			// Sealed envelopes until opened, but each says whose in its name.
			await expect(unread.getByRole('link', { name: /with Ada/ })).toHaveCount(1);
			await expect(unread.getByRole('link', { name: /with Cy/ })).toHaveCount(1);
		} finally {
			await closeAll(ada, bo, cy);
		}
	});

	test('Me offers to switch, and switching shows that partner’s board', async ({ browser }) => {
		const { ada, bo, cy } = await boWithTwoPartners(browser);
		try {
			await showContext(bo.page, await soloSpaceOf(bo.who.email));
			await bo.page.goto('/messages');
			await waitForHydration(bo.page);
			await expect(bo.page.getByTestId('messages-me')).toBeVisible();
			await expect(bo.page.getByRole('list', { name: 'Unread' })).toHaveCount(0);
			await expect(bo.page.getByRole('button', { name: 'Switch to Cy' })).toBeVisible();

			await clickWaButton(bo.page, 'Switch to Ada');
			await expect(control(bo.page)).toHaveAccessibleName(/^Showing Ada/);
			await expect(bo.page).toHaveURL(/\/messages$/);
			const unread = bo.page.getByRole('list', { name: 'Unread' });
			await expect(unread.getByRole('listitem')).toHaveCount(1);
			await expect(unread.getByTestId('sticker-space')).toHaveCount(0);
			await unread.getByRole('link').click();
			await expect(bo.page.getByText('from Ada')).toBeVisible();
		} finally {
			await closeAll(ada, bo, cy);
		}
	});

	test('a thread’s link opens that thread whatever the context', async ({ browser }) => {
		const { ada, bo, cy, withCy } = await boWithTwoPartners(browser);
		try {
			const { rows } = await sql(
				`SELECT t.id AS id FROM message_threads t JOIN partnerships p ON p.id = t.partnership_id
				  WHERE p.inviter_id = (SELECT id FROM user WHERE email = ?)`,
				[ada.who.email.toLowerCase()]
			);
			const adasThread = String(rows[0]?.id);

			for (const context of ['all', await soloSpaceOf(bo.who.email), withCy]) {
				await showContext(bo.page, context);
				await bo.page.goto(`/messages/${adasThread}`);
				await expect(bo.page.getByText('from Ada')).toBeVisible();
				await expect(bo.page.getByTestId('thread-space')).toContainText('Ada');
				const cookie = (await bo.page.context().cookies()).find((each) => each.name === 'context');
				expect(cookie?.value).toBe(context);
			}
		} finally {
			await closeAll(ada, bo, cy);
		}
	});

	test('a new thread in Everyone asks for whom, and goes there', async ({ browser }) => {
		const { ada, bo, cy, withCy } = await boWithTwoPartners(browser);
		try {
			await showContext(bo.page, 'all');
			await bo.page.goto('/messages');
			await waitForHydration(bo.page);
			await expect(bo.page.getByRole('button', { name: 'Write something' })).toBeVisible();
			await clickWaButton(bo.page, 'Write something');
			await expect(bo.page.getByRole('combobox', { name: 'For whom?' })).toBeVisible();
			// No composer until it is answered.
			await expect(bo.page.locator('wa-dialog.composer-dialog .richtext-editor')).toHaveCount(0);

			await bo.page.locator('wa-select[name="spaceId"]').click();
			await bo.page.getByRole('option', { name: 'Cy' }).click();
			await fillRichText(bo.page, 'for Cy only');
			await expect(bo.page.getByRole('button', { name: 'Send' })).toBeEnabled();
			await clickWaButton(bo.page, 'Send');
			await bo.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
			await expect(bo.page.getByTestId('thread-space')).toContainText('Cy');
			expect(await partnershipOfThread(bo.page)).toBe(withCy);

			// Cy has it; Ada does not.
			await cy.page.goto('/messages');
			await expect(cy.page.getByRole('list', { name: 'Unread' }).getByRole('listitem')).toHaveCount(
				1
			);
		} finally {
			await closeAll(ada, bo, cy);
		}
	});

	/**
	 * The context is one cookie per device, so another tab can change it under
	 * an open dialog. The send still goes where the dialog was opened for,
	 * because it names its partnership itself.
	 */
	test('switching in a second tab does not move the first tab’s send', async ({ browser }) => {
		const { ada, bo, cy, withAda, withCy } = await boWithTwoPartners(browser);
		try {
			await showContext(bo.page, withAda);
			await bo.page.goto('/messages');
			await waitForHydration(bo.page);
			await expect(control(bo.page)).toHaveAccessibleName(/^Showing Ada/);
			await clickWaButton(bo.page, 'Write something');
			await fillRichText(bo.page, 'meant for Ada');

			const second = await bo.page.context().newPage();
			await second.goto('/messages');
			await waitForHydration(second);
			await showContext(second, withCy);
			await second.close();

			// The first tab comes back to the front, sees the cookie moved, and
			// reloads its board in Cy's context — under the open dialog.
			const reloaded = bo.page.waitForResponse(/\/messages(?:\/new)?\/__data\.json/);
			await bo.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
			await reloaded;

			await expect(bo.page.getByRole('button', { name: 'Send' })).toBeEnabled();
			await clickWaButton(bo.page, 'Send');
			await bo.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
			await expect(bo.page.getByText('meant for Ada')).toBeVisible();
			await expect(bo.page.getByTestId('thread-space')).toContainText('Ada');
			expect(await partnershipOfThread(bo.page)).toBe(withAda);
		} finally {
			await closeAll(ada, bo, cy);
		}
	});
});
