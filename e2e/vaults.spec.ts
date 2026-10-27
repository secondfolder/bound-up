import { expect } from '@playwright/test';
import { sql } from './db';
import { test } from './fixtures';
import { linkAccounts, newAccounts, newSide, waitForKeyring } from './helpers';

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
});
