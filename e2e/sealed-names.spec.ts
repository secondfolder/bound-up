import { expect } from '@playwright/test';
import { generateIdentity, identityToRecipient } from 'age-encryption';
import { sql } from './db';
import { test } from './fixtures';
import { clickWaButton, createInvite, navTabs, newSide, signUp, waitForHydration } from './helpers';

/**
 * Partnership names are end-to-end encrypted (docs/partners.md, "Names are
 * sealed"): under an invite key that travels only in the link's fragment, then
 * in the partnership's vault. Only a real browser can show the fragment doing
 * its job, and only the database can show nothing else did.
 */

async function userId(email: string): Promise<string> {
	const { rows } = await sql('SELECT id FROM user WHERE email = ?', [email.toLowerCase()]);
	return String(rows[0]?.id);
}

test.describe('sealed partnership names', () => {
	test('the server never holds the names, before or after they move into the vault', async ({
		browser
	}) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');
		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			const link = await createInvite(ada.page, {
				partnerName: 'Pup',
				yourName: 'Handler',
				partnerRole: 'pet',
				control: 'mix'
			});

			const adaId = await userId(ada.who.email);
			const pending = await sql('SELECT * FROM partnerships WHERE inviter_id = ?', [adaId]);
			expect(pending.rows[0]).toMatchObject({ inviter_name: '', invitee_name: '' });
			expect(String(pending.rows[0]?.invite_ciphertext)).toMatch(/^sb1\./);
			expect(JSON.stringify(pending.rows)).not.toMatch(/Pup|Handler|pet/);

			await jun.page.goto(link);
			await clickWaButton(jun.page, 'Accept and link');
			await jun.page.waitForURL(/\/partner\//);
			expect(await navTabs(jun.page)).toEqual(['Home', 'Handler', 'Settings']);

			// Jun's device, now in the app with the vault open, moves the names in
			// and the invite goes.
			await expect
				.poll(async () => {
					const { rows } = await sql(
						'SELECT names_ciphertext, invite_ciphertext, invite_key_wrap FROM partnerships WHERE inviter_id = ?',
						[adaId]
					);
					return rows[0];
				})
				.toMatchObject({
					names_ciphertext: expect.stringMatching(/^sb1\./),
					invite_ciphertext: null,
					invite_key_wrap: null
				});
			const linked = await sql('SELECT * FROM partnerships WHERE inviter_id = ?', [adaId]);
			expect(JSON.stringify(linked.rows)).not.toMatch(/Pup|Handler|pet/);

			// Both sides still read them, from the vault.
			await ada.page.goto('/home');
			expect(await navTabs(ada.page)).toEqual(['Home', 'Pup', 'Settings']);
		} finally {
			await Promise.all([ada.close(), jun.close()]);
		}
	});

	test('a link with its fragment cut off says so, and shows nobody', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');
		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			const link = await createInvite(ada.page, {
				partnerName: 'Jun',
				yourName: 'Ada',
				control: 'mix'
			});

			await jun.page.goto(link.split('#')[0] ?? link);
			await waitForHydration(jun.page);
			await expect(
				jun.page.getByRole('heading', { name: 'This link is incomplete' })
			).toBeVisible();
			await expect(jun.page.getByRole('button', { name: 'Accept and link' })).toHaveCount(0);
		} finally {
			await Promise.all([ada.close(), jun.close()]);
		}
	});

	test('an inviter key the server swapped blocks accepting', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');
		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			const link = await createInvite(ada.page, {
				partnerName: 'Jun',
				yourName: 'Ada',
				control: 'mix'
			});

			// What a dishonest server would do: serve a key of its own for Ada.
			const swapped = await identityToRecipient(await generateIdentity());
			await sql('UPDATE user_keys SET recipient = ? WHERE user_id = ?', [
				swapped,
				await userId(ada.who.email)
			]);

			await jun.page.goto(link);
			await expect(jun.page.getByRole('alert')).toContainText("doesn't match");
			await expect(jun.page.getByRole('button', { name: 'Accept and link' })).toHaveCount(0);
		} finally {
			await Promise.all([ada.close(), jun.close()]);
		}
	});

	test('editing a sealed task starts from its content', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		try {
			await signUp(ada.page, ada.who);

			await ada.page.goto('/home/tasks/add');
			await waitForHydration(ada.page);
			await ada.page.locator('wa-input[name="title"] input').fill('Lines, one hundred');
			await clickWaButton(ada.page, 'Add task');
			await ada.page.waitForURL(/\/home\/tasks$/);

			// Edit is in the task's detail, which its row opens.
			await waitForHydration(ada.page);
			await ada.page.getByRole('button', { name: /Lines, one hundred/ }).click();
			const edit = await ada.page
				.locator('wa-dialog')
				.getByRole('link', { name: 'Edit' })
				.getAttribute('href');
			await ada.page.goto(edit ?? '');
			await waitForHydration(ada.page);
			// Opened in the browser and put in the form: the server sent it empty.
			await expect(ada.page.locator('wa-input[name="title"] input')).toHaveValue(
				'Lines, one hundred'
			);
		} finally {
			await ada.close();
		}
	});
});
