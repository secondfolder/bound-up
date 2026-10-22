import { expect } from '@playwright/test';
import { Encrypter } from 'age-encryption';
import { sql } from './db';
import { test } from './fixtures';
import {
	linkAccounts,
	newAccounts,
	newSide,
	openBoard,
	waitForKeyring,
	writeThread
} from './helpers';

/**
 * Vaults are made by the devices, never by the server: the first device to
 * load the app shell after signing up makes the account's own vault, and the
 * first after two accounts link makes their partnership's, wrapped to both.
 * This is the only level that sees that happen against a real server, with
 * two genuinely separate devices.
 */

async function userId(email: string): Promise<string> {
	const { rows } = await sql('SELECT id FROM user WHERE email = ?', [email.toLowerCase()]);
	return String(rows[0]?.id);
}

test.describe('vaults', () => {
	test('each account gets its own, and a linked pair share one both can open', async ({
		browser
	}) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');
		try {
			await newAccounts(ada, jun);
			const adaId = await userId(ada.who.email);
			const junId = await userId(jun.who.email);

			// Each device made its account's vault, wrapped to that account only.
			await expect
				.poll(async () => {
					const { rows } = await sql(
						`SELECT v.owner_user_id AS owner, w.user_id AS holder, w.for_recipient AS forRecipient,
						        k.recipient AS recipient
						   FROM vaults v JOIN vault_wraps w ON w.vault_id = v.id
						   JOIN user_keys k ON k.user_id = w.user_id
						  WHERE v.kind = 'self' AND v.owner_user_id IN (?, ?)`,
						[adaId, junId]
					);
					return rows.map((row) => [row.owner === row.holder, row.forRecipient === row.recipient]);
				})
				.toEqual([
					[true, true],
					[true, true]
				]);

			await linkAccounts(ada, jun);
			// Jun's device is the one that loads the shell first after accepting,
			// so it makes the partnership's vault; Ada's opens it on her next load.
			await ada.page.goto('/home');
			await waitForKeyring(ada.page);

			await expect
				.poll(async () => {
					const { rows } = await sql(
						`SELECT w.user_id AS holder, w.for_recipient = k.recipient AS current
						   FROM vaults v
						   JOIN partnerships p ON p.id = v.partnership_id
						   JOIN vault_wraps w ON w.vault_id = v.id
						   JOIN user_keys k ON k.user_id = w.user_id
						  WHERE p.inviter_id = ? AND p.invitee_id = ?
						  ORDER BY w.user_id = ? DESC`,
						[adaId, junId, adaId]
					);
					return rows.map((row) => [row.holder, Number(row.current)]);
				})
				.toEqual([
					[adaId, 1],
					[junId, 1]
				]);

			// Exactly one partnership vault, whichever device got there first.
			const { rows } = await sql(
				`SELECT COUNT(*) AS n FROM vaults v JOIN partnerships p ON p.id = v.partnership_id
				  WHERE p.inviter_id = ?`,
				[adaId]
			);
			expect(Number(rows[0]?.n)).toBe(1);
		} finally {
			await ada.close();
			await jun.close();
		}
	});

	/**
	 * Before vaults, a message was age-encrypted to both partners. Nothing sends
	 * those any more, so this makes one by hand — the very message Ada just
	 * sent, rewritten into the original scheme as plain text written before rich
	 * text existed — and checks that a device moves it into the vault, as rich
	 * text, and that it reads the same before and after.
	 */
	test('a message from before vaults still reads, and is moved into the vault', async ({
		browser
	}) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');
		try {
			await newAccounts(ada, jun);
			await linkAccounts(ada, jun);
			// Ada's page is still on the invite she sent; the partner tab arrives
			// with a fresh load.
			await ada.page.goto('/home');
			await waitForKeyring(ada.page);
			await openBoard(ada.page, 'Jun');
			await writeThread(ada.page, 'sent through the vault');

			const adaId = await userId(ada.who.email);
			const { rows } = await sql(
				`SELECT m.id AS id FROM messages m
				   JOIN message_threads t ON t.id = m.thread_id
				   JOIN partnerships p ON p.id = t.partnership_id
				  WHERE p.inviter_id = ?`,
				[adaId]
			);
			const messageId = String(rows[0]?.id);
			const keys = await sql(
				`SELECT k.recipient AS recipient FROM user_keys k
				   JOIN user u ON u.id = k.user_id WHERE u.email IN (?, ?)`,
				[ada.who.email.toLowerCase(), jun.who.email.toLowerCase()]
			);
			const encrypter = new Encrypter();
			for (const row of keys.rows) {
				encrypter.addRecipient(String(row.recipient));
			}
			const old = await encrypter.encrypt(
				JSON.stringify({ version: 1, text: 'words from before vaults', attachments: [] })
			);
			await sql(
				`UPDATE messages SET ciphertext = ?, vault_id = NULL, payload_version = NULL,
				        metadata_ciphertext = NULL, metadata_version = NULL, body_format = 'plain'
				  WHERE id = ?`,
				[Buffer.from(old).toString('base64'), messageId]
			);

			// Still readable the old way, by either partner.
			await ada.page.reload();
			await expect(ada.page.getByText('words from before vaults')).toBeVisible();

			// Moved into the vault by a device in the background, and converted
			// to rich text on the way.
			await expect
				.poll(async () => {
					const moved = await sql(
						'SELECT vault_id AS vaultId, body_format AS format FROM messages WHERE id = ?',
						[messageId]
					);
					return [moved.rows[0]?.vaultId !== null, moved.rows[0]?.format];
				})
				.toEqual([true, 'lexical']);

			// And reads the same, sealed, on the other device.
			await openBoard(jun.page, 'Ada');
			await jun.page.goto(ada.page.url());
			await expect(jun.page.getByText('words from before vaults')).toBeVisible();
		} finally {
			await ada.close();
			await jun.close();
		}
	});
});
