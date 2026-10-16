import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db';
import { defined } from '../testing/defined';
import {
	createTestInvite,
	createTestPartnership,
	createTestRestoreRequest,
	createTestSelfReward,
	createTestSelfTask,
	createTestUser,
	createTestUserKeys,
	type TestUser
} from '../testing/fixtures';
import {
	accountRecoveryRequests,
	partnerships,
	selfRewards,
	selfTaskCompletions,
	selfTasks,
	userKeys,
	vaultEscrowRelays,
	vaultEscrows,
	vaults,
	vaultWraps
} from './db/schema';
import { restoreVaultAccess } from './messaging';
import { completeSelfTask } from './tasks';
import {
	createVault,
	deleteLostSelfVault,
	escrowShare,
	issueEscrowShare,
	listVaultsForUser,
	putEscrow,
	putVaultWrap,
	releaseEscrow
} from './vaults';

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
			wrap: { ciphertext: WRAP, forRecipient: adaKey },
			escrowPartnershipIds: []
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

describe('escrow', () => {
	const Secret = 'escrow-test-secret';
	let partnershipId: string;

	beforeEach(async () => {
		partnershipId = (await createTestPartnership(harness.db, ada, jun)).id;
		await selfVault(ada, adaKey);
		await partnershipVault(ada, partnershipId);
	});

	/** What a partner-assisted sign-in leaves: a completed, email-confirmed recovery. */
	async function completedRecovery() {
		const request = await createTestRestoreRequest(harness.db, {
			partnershipId,
			requesterId: ada.id,
			recipient: junKey
		});
		await harness.db
			.update(accountRecoveryRequests)
			.set({ status: 'approved', approvedBy: jun.id })
			.where(eq(accountRecoveryRequests.id, request.recoveryRequestId));
		return request;
	}

	async function finish(
		recoveryRequestId: string,
		options: { emailConfirmed?: boolean; resolvedAt?: Date } = {}
	) {
		await harness.db
			.update(accountRecoveryRequests)
			.set({
				status: 'completed',
				emailConfirmedAt: options.emailConfirmed === false ? null : new Date(),
				resolvedAt: options.resolvedAt ?? new Date()
			})
			.where(eq(accountRecoveryRequests.id, recoveryRequestId));
	}

	it('hands out the share only for an escrow that does not exist yet', async () => {
		const escrowId = id(30);
		expect(await issueEscrowShare(harness.db, Secret, ada.id, escrowId)).toBe(
			await escrowShare(Secret, escrowId)
		);
		await putEscrow(harness.db, ada.id, { id: escrowId, partnershipId, ciphertext: WRAP });
		// A stolen session plus a willing partner must not be enough.
		expect(await issueEscrowShare(harness.db, Secret, ada.id, escrowId)).toBeNull();
		// And nobody without an own vault gets one at all.
		expect(await issueEscrowShare(harness.db, Secret, stranger.id, id(31))).toBeNull();
	});

	it('is held only with a partner the user really has, one per partner', async () => {
		expect(
			await putEscrow(harness.db, stranger.id, { id: id(30), partnershipId, ciphertext: WRAP })
		).toBe(false);
		await putEscrow(harness.db, ada.id, { id: id(30), partnershipId, ciphertext: WRAP });
		await putEscrow(harness.db, ada.id, { id: id(32), partnershipId, ciphertext: OTHER_WRAP });
		const rows = await harness.db.select({ id: vaultEscrows.id }).from(vaultEscrows);
		expect(rows).toEqual([{ id: id(32) }]);
		const listing = defined(await listVaultsForUser(harness.db, ada.id), 'listing');
		expect(listing.self?.escrowPartnershipIds).toEqual([partnershipId]);
	});

	describe('release', () => {
		/** Ada's escrow with Jun, and Jun's relay of it, as a restore leaves them. */
		async function relayed() {
			await putEscrow(harness.db, ada.id, { id: id(30), partnershipId, ciphertext: WRAP });
			const request = await completedRecovery();
			const restored = await restoreVaultAccess(harness.db, {
				partnershipId,
				requestId: request.id,
				actorId: jun.id,
				vaultWrap: WRAP,
				escrowRelay: { escrowId: id(30), ciphertext: 'cmVsYXk=' }
			});
			if (!restored.ok) {
				throw new Error(`fixture could not relay: ${restored.reason}`);
			}
			return request;
		}

		it('gives the account the relay and the share, once the sign-in completed by email', async () => {
			const request = await relayed();
			// Approved, not completed: nothing yet.
			expect(await releaseEscrow(harness.db, Secret, ada.id)).toEqual([]);

			await finish(request.recoveryRequestId);
			expect(await releaseEscrow(harness.db, Secret, ada.id)).toEqual([
				{
					escrowId: id(30),
					vaultId: id(1),
					ciphertext: 'cmVsYXk=',
					share: await escrowShare(Secret, id(30))
				}
			]);
			// To the account itself only: the partner who relayed gets nothing.
			expect(await releaseEscrow(harness.db, Secret, jun.id)).toEqual([]);
		});

		it('gives nothing for a sign-in that skipped the email, or long ago', async () => {
			const request = await relayed();
			await finish(request.recoveryRequestId, { emailConfirmed: false });
			expect(await releaseEscrow(harness.db, Secret, ada.id)).toEqual([]);

			await finish(request.recoveryRequestId, {
				resolvedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
			});
			expect(await releaseEscrow(harness.db, Secret, ada.id)).toEqual([]);
		});

		it('takes a relay only for the requester’s escrow with this partner', async () => {
			const cas = await createTestUser(harness.db, { name: 'Cas' });
			const casKey = (await createTestUserKeys(harness.db, cas)).recipient;
			const other = await createTestPartnership(harness.db, ada, cas);
			await createVault(harness.db, ada.id, {
				kind: 'partnership',
				id: id(40),
				partnershipId: other.id,
				keyCheck: KEY_CHECK,
				wraps: [
					{ userId: ada.id, ciphertext: WRAP, forRecipient: adaKey },
					{ userId: cas.id, ciphertext: WRAP, forRecipient: casKey }
				]
			});
			await putEscrow(harness.db, ada.id, {
				id: id(41),
				partnershipId: other.id,
				ciphertext: WRAP
			});
			const request = await completedRecovery();
			// Jun cannot pass on the escrow Cas holds.
			await expect(
				restoreVaultAccess(harness.db, {
					partnershipId,
					requestId: request.id,
					actorId: jun.id,
					vaultWrap: WRAP,
					escrowRelay: { escrowId: id(41), ciphertext: 'cmVsYXk=' }
				})
			).resolves.toEqual({ ok: false, reason: 'no-such-escrow' });
			expect(await harness.db.select().from(vaultEscrowRelays)).toEqual([]);
		});
	});

	describe('replacing an own vault that is lost', () => {
		async function loseAdasKey() {
			const { recipient } = await createTestUserKeys(harness.db, await createTestUser(harness.db));
			await harness.db.update(userKeys).set({ recipient }).where(eq(userKeys.userId, ada.id));
		}

		it('is refused while the account still holds a wrap that opens it', async () => {
			await expect(deleteLostSelfVault(harness.db, ada.id)).resolves.toBe(false);
		});

		it('is allowed when nothing held it in escrow', async () => {
			await loseAdasKey();
			await expect(deleteLostSelfVault(harness.db, ada.id)).resolves.toBe(true);
			const rows = await harness.db.select().from(vaults).where(eq(vaults.ownerUserId, ada.id));
			expect(rows).toEqual([]);
		});

		it('takes what was sealed in it along, which nothing could open again', async () => {
			const task = await createTestSelfTask(harness.db, ada);
			const reward = await createTestSelfReward(harness.db, ada);
			const completed = await completeSelfTask(harness.db, ada.id, ada.timezone, task.id);
			expect(completed).toMatchObject({ ok: true });
			await loseAdasKey();

			// The sealed columns' foreign keys have no ON DELETE action in the
			// database (they were added by ALTER TABLE), so this would be refused
			// if the rows were left for the vault delete to take.
			await expect(deleteLostSelfVault(harness.db, ada.id)).resolves.toBe(true);
			expect(await harness.db.select().from(selfTasks)).toEqual([]);
			expect(await harness.db.select().from(selfTaskCompletions)).toEqual([]);
			expect(
				await harness.db.select().from(selfRewards).where(eq(selfRewards.id, reward.id))
			).toEqual([]);
		});

		it('waits while an escrow could still bring it back, and not after', async () => {
			await putEscrow(harness.db, ada.id, { id: id(30), partnershipId, ciphertext: WRAP });
			const request = await completedRecovery();
			await finish(request.recoveryRequestId);
			await loseAdasKey();
			await expect(deleteLostSelfVault(harness.db, ada.id)).resolves.toBe(false);

			await finish(request.recoveryRequestId, {
				resolvedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
			});
			await expect(deleteLostSelfVault(harness.db, ada.id)).resolves.toBe(true);
		});
	});
});
