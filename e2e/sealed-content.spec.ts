import { expect } from '@playwright/test';
import { sql } from './db';
import { test } from './fixtures';
import {
	clickWaButton,
	fillRichText,
	newSide,
	signUp,
	waitForHydration,
	waitForKeyring
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
			await signUp(ada.page, ada.who);
			const adaId = await userId(ada.who.email);

			await ada.page.goto('/home/tasks/add');
			await waitForHydration(ada.page);
			await ada.page.locator('wa-input[name="title"] input').fill('Ninety lengths');
			await fillRichText(ada.page.locator('.task-form'), 'Before breakfast');
			await ada.page
				.locator('wa-textarea[name="completionMessagesText"] textarea')
				.fill('Strong work');
			await clickWaButton(ada.page, 'Add task');
			await ada.page.waitForURL(/\/home\/tasks$/);
			// Shown, which means opened in the browser: the server never had it.
			await expect(ada.page.getByRole('heading', { name: 'Ninety lengths' })).toBeVisible();

			await ada.page.goto('/home/rewards/add');
			await waitForHydration(ada.page);
			await ada.page.locator('.add-form wa-input[name="title"] input').fill('Sunday lie-in');
			await fillRichText(ada.page.locator('.add-form'), 'Until noon');
			await ada.page.locator('.add-form wa-input[name="cost"] input').fill('2');
			await clickWaButton(ada.page, 'Add reward');
			await ada.page.waitForURL(/\/home\/rewards$/);
			await expect(ada.page.getByRole('heading', { name: 'Sunday lie-in' })).toBeVisible();

			const tasks = await sql('SELECT * FROM self_tasks WHERE owner_id = ?', [adaId]);
			const rewards = await sql('SELECT * FROM self_rewards WHERE owner_id = ?', [adaId]);
			expect(tasks.rows).toHaveLength(1);
			expect(rewards.rows).toHaveLength(1);
			const [task] = tasks.rows;
			const [reward] = rewards.rows;
			expect(task).toMatchObject({ title: '', description: null, completion_messages: '[]' });
			expect(task?.ciphertext).toMatch(/^sb1\./);
			expect(task?.completion_message_count).toBe(1);
			expect(reward).toMatchObject({ title: '', description: null });
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

	test('a task stored before sealing is sealed in the background, and still reads', async ({
		browser
	}) => {
		const ada = await newSide(browser, 'Ada');
		try {
			await signUp(ada.page, ada.who);
			const adaId = await userId(ada.who.email);
			const taskId = crypto.randomUUID();
			// What a task looked like before sealing: its text in plaintext columns.
			await sql(
				`INSERT INTO self_tasks
					(id, owner_id, title, description, active, credits_awarded, completion_messages,
					 completion_message_count, schedule, timezone_owner_user_id)
				 VALUES (?, ?, ?, ?, 1, 2, ?, 1, ?, ?)`,
				[
					taskId,
					adaId,
					'Old plank',
					'Two minutes, written before rich text',
					JSON.stringify(['Held it']),
					JSON.stringify({ mode: 'one-off' }),
					adaId
				]
			);

			await ada.page.goto('/home/tasks');
			await waitForKeyring(ada.page);
			await expect(ada.page.getByRole('heading', { name: 'Old plank' })).toBeVisible();

			await expect
				.poll(async () => {
					const { rows } = await sql(
						'SELECT title, description, completion_messages, ciphertext FROM self_tasks WHERE id = ?',
						[taskId]
					);
					return rows[0];
				})
				.toMatchObject({
					title: '',
					description: null,
					completion_messages: '[]',
					ciphertext: expect.stringMatching(/^sb1\./)
				});

			// Read back from the sealed copy now, the plain description converted.
			await ada.page.reload();
			await expect(ada.page.getByRole('heading', { name: 'Old plank' })).toBeVisible();
			await expect(ada.page.getByText('Two minutes, written before rich text')).toBeVisible();
		} finally {
			await ada.close();
		}
	});
});
