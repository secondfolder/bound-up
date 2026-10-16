import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db';
import { defined } from '../testing/defined';
import {
	createTestInvite,
	createTestPartnership,
	createTestUser,
	createTestUserKeys,
	type TestUser
} from '../testing/fixtures';
import { partnerships, userKeys, vaults, vaultWraps } from './db/schema';
import { createVault, listVaultsForUser, putVaultWrap } from './vaults';

/**
 * The server never opens a wrap, so these use stand-in ciphertexts: what is
 * under test is who may write which wrap for which recipient.
 */
const WRAP = 'YWdlIHdyYXA=';
const OTHER_WRAP = 'YW5vdGhlciB3cmFw';
const KEY_CHECK = 'A'.repeat(43);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

let harness: TestDb;
let ada: TestUser;
let jun: TestUser;
let stranger: TestUser;
let adaKey: string;
let junKey: string;

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	jun = await createTestUser(harness.db, { name: 'Jun' });
	stranger = await createTestUser(harness.db, { name: 'Stranger' });
	adaKey = (await createTestUserKeys(harness.db, ada)).recipient;
	junKey = (await createTestUserKeys(harness.db, jun)).recipient;
	await createTestUserKeys(harness.db, stranger);
});

afterEach(() => harness.close());

const selfVault = (user: TestUser, recipient: string, vaultId = id(1)) =>
	createVault(harness.db, user.id, {
		kind: 'self',
		id: vaultId,
		keyCheck: KEY_CHECK,
		wraps: [{ userId: user.id, ciphertext: WRAP, forRecipient: recipient }]
	});

const partnershipVault = (actor: TestUser, partnershipId: string, vaultId = id(2)) =>
	createVault(harness.db, actor.id, {
		kind: 'partnership',
		id: vaultId,
		partnershipId,
		keyCheck: KEY_CHECK,
		wraps: [
			{ userId: ada.id, ciphertext: WRAP, forRecipient: adaKey },
			{ userId: jun.id, ciphertext: WRAP, forRecipient: junKey }
		]
	});

describe('listVaultsForUser', () => {
	it('lists the self vault as missing and every accepted partnership, from the viewer’s side', async () => {
		const { id: partnershipId } = await createTestPartnership(harness.db, ada, jun);
		await createTestInvite(harness.db, ada);

		const forAda = defined(await listVaultsForUser(harness.db, ada.id), 'listing');
		expect(forAda.recipient).toBe(adaKey);
		expect(forAda.self).toBeNull();
		// The pending invite is not there: it has nobody to share a vault with.
		expect(forAda.partnerships).toEqual([
			{
				partnershipId,
				partnerId: jun.id,
				recipients: { mine: adaKey, theirs: junKey, vaultCheck: null },
				vault: null
			}
		]);

		const forJun = defined(await listVaultsForUser(harness.db, jun.id), 'listing');
		expect(forJun.partnerships[0]?.recipients).toEqual({
			mine: junKey,
			theirs: adaKey,
			vaultCheck: null
		});
	});

	it('shows what each member holds of a partnership vault', async () => {
		const { id: partnershipId } = await createTestPartnership(harness.db, ada, jun);
		expect(await partnershipVault(ada, partnershipId)).toEqual({ ok: true });

		const listing = defined(await listVaultsForUser(harness.db, jun.id), 'listing');
		expect(listing.partnerships[0]?.vault).toEqual({
			id: id(2),
			kind: 'partnership',
			partnershipId,
			keyCheck: KEY_CHECK,
			wrap: { ciphertext: WRAP, forRecipient: junKey },
			partnerWrapFor: adaKey
		});
	});

	it('is null for a user with no keys, which is broken data', async () => {
		const keyless = await createTestUser(harness.db);
		expect(await listVaultsForUser(harness.db, keyless.id)).toBeNull();
	});
});

describe('createVault', () => {
	it('creates a self vault with the owner’s wrap', async () => {
		expect(await selfVault(ada, adaKey)).toEqual({ ok: true });
		const listing = defined(await listVaultsForUser(harness.db, ada.id), 'listing');
		expect(listing.self).toEqual({
			id: id(1),
			kind: 'self',
			partnershipId: null,
			keyCheck: KEY_CHECK,
			wrap: { ciphertext: WRAP, forRecipient: adaKey }
		});
	});

	/** Two devices racing: the second loses cleanly and opens the first's. */
	it('refuses a second vault for the same scope as `exists`, and keeps the first', async () => {
		await selfVault(ada, adaKey, id(1));
		expect(await selfVault(ada, adaKey, id(3))).toEqual({ ok: false, reason: 'exists' });

		const { id: partnershipId } = await createTestPartnership(harness.db, ada, jun);
		await partnershipVault(ada, partnershipId, id(4));
		expect(await partnershipVault(jun, partnershipId, id(5))).toEqual({
			ok: false,
			reason: 'exists'
		});

		const rows = await harness.db.select({ id: vaults.id }).from(vaults);
		expect(rows.map((row) => row.id).sort()).toEqual([id(1), id(4)]);
		// The loser's wraps went nowhere: the batch was all or nothing.
		expect(
			await harness.db
				.select()
				.from(vaultWraps)
				.where(eq(vaultWraps.vaultId, id(5)))
		).toEqual([]);
	});

	it('refuses a wrap made for anything but the member’s current recipient', async () => {
		expect(await selfVault(ada, junKey)).toEqual({ ok: false, reason: 'invalid-wraps' });
		const { id: partnershipId } = await createTestPartnership(harness.db, ada, jun);
		expect(
			await createVault(harness.db, ada.id, {
				kind: 'partnership',
				id: id(2),
				partnershipId,
				keyCheck: KEY_CHECK,
				wraps: [
					{ userId: ada.id, ciphertext: WRAP, forRecipient: adaKey },
					{ userId: ada.id, ciphertext: WRAP, forRecipient: adaKey }
				]
			})
		).toEqual({ ok: false, reason: 'invalid-wraps' });
	});

	it('refuses a self vault wrapped for someone else', async () => {
		expect(
			await createVault(harness.db, ada.id, {
				kind: 'self',
				id: id(1),
				keyCheck: KEY_CHECK,
				wraps: [{ userId: jun.id, ciphertext: WRAP, forRecipient: junKey }]
			})
		).toEqual({ ok: false, reason: 'invalid-wraps' });
	});

	it('will not create a vault for a partnership the actor is not in, or one still pending', async () => {
		const { id: partnershipId } = await createTestPartnership(harness.db, ada, jun);
		expect(await partnershipVault(stranger, partnershipId)).toEqual({
			ok: false,
			reason: 'not-found'
		});
		const invite = await createTestInvite(harness.db, ada);
		expect(await partnershipVault(ada, invite.id)).toEqual({ ok: false, reason: 'not-found' });
	});

	it('goes when its partnership does', async () => {
		const { id: partnershipId } = await createTestPartnership(harness.db, ada, jun);
		await partnershipVault(ada, partnershipId);
		await harness.db.delete(partnerships).where(eq(partnerships.id, partnershipId));
		expect(await harness.db.select().from(vaults)).toEqual([]);
		expect(await harness.db.select().from(vaultWraps)).toEqual([]);
	});

	/** The check constraint, for a row that bypasses `createVault`. */
	it('cannot store a vault whose scope does not match its kind', async () => {
		const { id: partnershipId } = await createTestPartnership(harness.db, ada, jun);
		await expect(
			harness.db.insert(vaults).values({
				id: id(9),
				kind: 'self',
				ownerUserId: ada.id,
				partnershipId,
				keyCheck: KEY_CHECK
			})
		).rejects.toThrow();
	});
});

describe('putVaultWrap', () => {
	let partnershipId: string;

	beforeEach(async () => {
		partnershipId = (await createTestPartnership(harness.db, ada, jun)).id;
		await partnershipVault(ada, partnershipId);
	});

	async function giveJunANewKey(): Promise<string> {
		// What a partner-assisted sign-in leaves behind: a new recipient, and a
		// wrap still made for the old one.
		const { recipient } = await createTestUserKeys(harness.db, await createTestUser(harness.db));
		await harness.db.update(userKeys).set({ recipient }).where(eq(userKeys.userId, jun.id));
		junKey = recipient;
		return recipient;
	}

	it('lets a member re-wrap for a partner whose wrap is for a key they no longer have', async () => {
		const fresh = await giveJunANewKey();
		expect(
			await putVaultWrap(harness.db, ada.id, id(2), {
				userId: jun.id,
				ciphertext: OTHER_WRAP,
				forRecipient: fresh
			})
		).toEqual({ ok: true });
		const listing = defined(await listVaultsForUser(harness.db, jun.id), 'listing');
		expect(listing.partnerships[0]?.vault?.wrap).toEqual({
			ciphertext: OTHER_WRAP,
			forRecipient: fresh
		});
	});

	it('will not replace a partner’s wrap that still opens', async () => {
		expect(
			await putVaultWrap(harness.db, ada.id, id(2), {
				userId: jun.id,
				ciphertext: OTHER_WRAP,
				forRecipient: junKey
			})
		).toEqual({ ok: false, reason: 'current' });
	});

	it('lets a member replace their own', async () => {
		expect(
			await putVaultWrap(harness.db, ada.id, id(2), {
				userId: ada.id,
				ciphertext: OTHER_WRAP,
				forRecipient: adaKey
			})
		).toEqual({ ok: true });
	});

	it('refuses a wrap for a recipient the member does not have', async () => {
		await giveJunANewKey();
		expect(
			await putVaultWrap(harness.db, ada.id, id(2), {
				userId: jun.id,
				ciphertext: OTHER_WRAP,
				forRecipient: adaKey
			})
		).toEqual({ ok: false, reason: 'invalid-wrap' });
	});

	it('is not found for a stranger, a stranger as the target, or a vault that does not exist', async () => {
		expect(
			await putVaultWrap(harness.db, stranger.id, id(2), {
				userId: stranger.id,
				ciphertext: WRAP,
				forRecipient: adaKey
			})
		).toEqual({ ok: false, reason: 'not-found' });
		expect(
			await putVaultWrap(harness.db, ada.id, id(2), {
				userId: stranger.id,
				ciphertext: WRAP,
				forRecipient: adaKey
			})
		).toEqual({ ok: false, reason: 'invalid-wrap' });
		expect(
			await putVaultWrap(harness.db, ada.id, id(99), {
				userId: ada.id,
				ciphertext: WRAP,
				forRecipient: adaKey
			})
		).toEqual({ ok: false, reason: 'not-found' });
	});

	it('will not let anyone but the owner touch a self vault', async () => {
		await selfVault(jun, junKey, id(7));
		expect(
			await putVaultWrap(harness.db, ada.id, id(7), {
				userId: jun.id,
				ciphertext: WRAP,
				forRecipient: junKey
			})
		).toEqual({ ok: false, reason: 'not-found' });
	});
});
