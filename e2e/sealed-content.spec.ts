import { expect } from '@playwright/test';
import { sql } from './db';
import { test } from './fixtures';
import {
	clickWaButton,
	fillRichText,
	newAccount,
	newSide,
	waitForHydration,
	waitForSheetClosed
} from './helpers';

/**
 * Tasks and rewards are sealed in the browser (docs/tasks.md, "What the server
 * can see"). The unit tests show the server stores what it is given; only here
 * does a real browser fill in the real form, so only here can a test show that
 * what reached the database is ciphertext and nothing else.
 */

async function userId(email: string): Promise<string> {
	const { rows } = await sql('SELECT id FROM user WHERE email = ?', [email.toLowerCase()]);
	return String(rows[0]?.id);
}

test.describe('sealed tasks and rewards', () => {
	test('the server stores a new task and reward only as ciphertext', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		try {
			await newAccount(ada.page, ada.who);
			const adaId = await userId(ada.who.email);

			await ada.page.goto('/tasks/add');
			await waitForHydration(ada.page);
			await ada.page.locator('wa-input[name="title"] input').fill('Ninety lengths');
			await fillRichText(ada.page.locator('.task-form'), 'Before breakfast');
			await ada.page
				.locator('wa-textarea[name="completionMessagesText"] textarea')
				.fill('Strong work');
			await clickWaButton(ada.page, 'Add task');
			await waitForSheetClosed(ada.page, /\/tasks$/);
			// Shown, which means opened in the browser: the server never had it.
			await expect(ada.page.getByRole('button', { name: /^Ninety lengths/ })).toBeVisible();

			await ada.page.goto('/rewards/add');
			await waitForHydration(ada.page);
			await ada.page.locator('.add-form wa-input[name="title"] input').fill('Sunday lie-in');
			await fillRichText(ada.page.locator('.add-form'), 'Until noon');
			await ada.page.locator('.add-form wa-input[name="cost"] input').fill('2');
			await clickWaButton(ada.page, 'Add reward');
			await waitForSheetClosed(ada.page, /\/rewards$/);
			await expect(ada.page.getByRole('button', { name: /^Sunday lie-in/ })).toBeVisible();

			const tasks = await sql('SELECT * FROM tasks WHERE created_by_user_id = ?', [adaId]);
			const rewards = await sql('SELECT * FROM rewards WHERE created_by_user_id = ?', [adaId]);
			expect(tasks.rows).toHaveLength(1);
			expect(rewards.rows).toHaveLength(1);
			const [task] = tasks.rows;
			const [reward] = rewards.rows;
			expect(task?.ciphertext).toMatch(/^sb1\./);
			expect(task?.completion_message_count).toBe(1);
			expect(reward?.ciphertext).toMatch(/^sb1\./);

			// Not in any column, under any name.
			const stored = JSON.stringify([...tasks.rows, ...rewards.rows]);
			for (const text of ['Ninety', 'breakfast', 'Strong work', 'lie-in', 'noon']) {
				expect(stored).not.toContain(text);
			}
		} finally {
			await ada.close();
		}
	});
});
