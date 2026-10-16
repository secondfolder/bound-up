import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db';
import { defined } from '../testing/defined';
import {
	createTestInvite,
	createTestPartnership,
	createTestSelfReward,
	createTestSelfTask,
	createTestUser,
	ensureTestPartnershipVault,
	ensureTestSelfVault,
	fakeSealed,
	readPartnershipRewardRow,
	readPartnershipRow,
	readPartnershipTaskRow,
	readSelfRewardClaimRows,
	readSelfRewardRow,
	readSelfTaskCompletionRows,
	readSelfTaskRow,
	type TestUser
} from '../testing/fixtures';
import {
	type ContentScope,
	listUnsealedContent,
	type SealedContentBatch,
	sealUnsealedContent
} from './content-sealing';
import {
	partnershipRewardClaims,
	partnershipRewards,
	partnershipTaskCompletions,
	partnershipTasks,
	selfRewardClaims,
	selfRewards,
	selfTaskCompletions,
	selfTasks
} from './db/schema';
import { acceptInvite } from './partnerships';

let harness: TestDb;
let ada: TestUser;
let jun: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	jun = await createTestUser(harness.db, { name: 'Jun' });
});

afterEach(() => harness.close());

const SELF: ContentScope = { kind: 'self' };

/**
 * A self task, completion, reward and claim as they were written before
 * sealing: plaintext, no ciphertext. Nothing writes these any more, so they
 * are inserted directly.
 */
async function insertLegacySelfRows(owner: TestUser) {
	const taskId = crypto.randomUUID();
	const completionId = crypto.randomUUID();
	const rewardId = crypto.randomUUID();
	const claimId = crypto.randomUUID();
	await harness.db.batch([
		harness.db.insert(selfTasks).values({
			id: taskId,
			ownerId: owner.id,
			title: 'Old task',
			description: null,
			completionMessages: ['Well done'],
			schedule: { mode: 'one-off' },
			timezoneOwnerUserId: owner.id
		}),
		harness.db.insert(selfTaskCompletions).values({
			id: completionId,
			ownerId: owner.id,
			taskId,
			taskTitle: 'Old task',
			creditsAwarded: 1,
			completionMessage: 'Well done'
		}),
		harness.db.insert(selfRewards).values({
			id: rewardId,
			ownerId: owner.id,
			title: 'Old reward',
			description: 'A treat',
			cost: 2
		}),
		harness.db.insert(selfRewardClaims).values({
			id: claimId,
			ownerId: owner.id,
			rewardId,
			rewardTitle: 'Old reward',
			rewardDescription: 'A treat',
			rewardCost: 2
		})
	]);
	return { taskId, completionId, rewardId, claimId };
}

/** The same, for a partnership, with `author` as the creator and `other` as the completer. */
async function insertLegacyPartnershipRows(
	partnershipId: string,
	author: TestUser,
	other: TestUser
) {
	const taskId = crypto.randomUUID();
	const completionId = crypto.randomUUID();
	const rewardId = crypto.randomUUID();
	const claimId = crypto.randomUUID();
	await harness.db.batch([
		harness.db.insert(partnershipTasks).values({
			id: taskId,
			partnershipId,
			createdByUserId: author.id,
			timezoneOwnerUserId: author.id,
			title: 'Shared task',
			description: null,
			completionMessages: [],
			schedule: { mode: 'one-off' }
		}),
		harness.db.insert(partnershipTaskCompletions).values({
			id: completionId,
			partnershipId,
			taskId,
			completedByUserId: other.id,
			createdByUserId: author.id,
			taskTitle: 'Shared task',
			creditsAwarded: 1
		}),
		harness.db.insert(partnershipRewards).values({
			id: rewardId,
			partnershipId,
			createdByUserId: author.id,
			title: 'Shared reward',
			cost: 1
		}),
		harness.db.insert(partnershipRewardClaims).values({
			id: claimId,
			partnershipId,
			rewardId,
			claimedByUserId: other.id,
			createdByUserId: author.id,
			rewardTitle: 'Shared reward',
			rewardCost: 1
		})
	]);
	return { taskId, completionId, rewardId, claimId };
}

/** A batch sealing every one of `ids`, under `vaultId`. */
function batchFor(
	vaultId: string,
	ids: { taskId: string; completionId: string; rewardId: string; claimId: string }
): SealedContentBatch {
	return {
		vaultId,
		tasks: [
			{
				id: ids.taskId,
				ciphertext: fakeSealed('task'),
				payloadVersion: 1,
				completionMessageCount: 1
			}
		],
		completions: [
			{
				id: ids.completionId,
				ciphertext: fakeSealed('completion'),
				payloadVersion: 1,
				completionMessageIndex: 0
			}
		],
		rewards: [{ id: ids.rewardId, ciphertext: fakeSealed('reward'), payloadVersion: 1 }],
		claims: [{ id: ids.claimId, ciphertext: fakeSealed('claim'), payloadVersion: 1 }]
	};
}

const EMPTY_BATCH = { tasks: [], completions: [], rewards: [], claims: [] };

describe('listUnsealedContent', () => {
	it("lists the user's own plaintext rows, and not their sealed ones", async () => {
		const ids = await insertLegacySelfRows(ada);
		await createTestSelfTask(harness.db, ada);
		await createTestSelfReward(harness.db, ada);

		const page = defined(await listUnsealedContent(harness.db, ada.id, SELF), 'page');
		expect(page).toEqual({
			tasks: [
				{ id: ids.taskId, title: 'Old task', description: null, completionMessages: ['Well done'] }
			],
			completions: [
				{
					id: ids.completionId,
					taskTitle: 'Old task',
					taskDescription: null,
					completionMessage: 'Well done'
				}
			],
			rewards: [{ id: ids.rewardId, title: 'Old reward', description: 'A treat' }],
			claims: [{ id: ids.claimId, rewardTitle: 'Old reward', rewardDescription: 'A treat' }],
			tags: [],
			// The self scope has no names to seal.
			names: null,
			next: null
		});
	});

	it("never lists another user's self rows", async () => {
		await insertLegacySelfRows(jun);

		await expect(listUnsealedContent(harness.db, ada.id, SELF)).resolves.toMatchObject({
			tasks: [],
			completions: [],
			rewards: [],
			claims: []
		});
	});

	it("lists a partnership's plaintext rows to either member", async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, jun)).id;
		const ids = await insertLegacyPartnershipRows(partnershipId, ada, jun);
		const scope: ContentScope = { kind: 'partnership', partnershipId };

		for (const member of [ada, jun]) {
			const page = defined(await listUnsealedContent(harness.db, member.id, scope), 'page');
			expect(page.tasks.map((row) => row.id)).toEqual([ids.taskId]);
			expect(page.completions.map((row) => row.id)).toEqual([ids.completionId]);
			expect(page.rewards.map((row) => row.id)).toEqual([ids.rewardId]);
			expect(page.claims.map((row) => row.id)).toEqual([ids.claimId]);
		}
	});

	it('refuses someone outside the partnership', async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, jun)).id;
		await insertLegacyPartnershipRows(partnershipId, ada, jun);
		const stranger = await createTestUser(harness.db, { name: 'Stranger' });

		await expect(
			listUnsealedContent(harness.db, stranger.id, { kind: 'partnership', partnershipId })
		).resolves.toBeNull();
	});
});

describe('sealUnsealedContent', () => {
	it('writes the sealed copies, clears the plaintext and bumps the revision', async () => {
		const ids = await insertLegacySelfRows(ada);
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		const batch = batchFor(vaultId, ids);

		await expect(sealUnsealedContent(harness.db, ada.id, SELF, batch)).resolves.toEqual({
			ok: true,
			sealed: 4
		});

		await expect(readSelfTaskRow(harness.db, ids.taskId)).resolves.toMatchObject({
			ciphertext: batch.tasks[0]?.ciphertext,
			vaultId,
			payloadVersion: 1,
			completionMessageCount: 1,
			revision: 1,
			title: '',
			description: null,
			completionMessages: []
		});
		const [completion] = await readSelfTaskCompletionRows(harness.db, ada.id);
		expect(defined(completion, 'completion row')).toMatchObject({
			snapshotCiphertext: batch.completions[0]?.ciphertext,
			snapshotVaultId: vaultId,
			snapshotVersion: 1,
			snapshotRecordId: ids.completionId,
			completionMessageIndex: 0,
			taskTitle: '',
			taskDescription: null,
			completionMessage: null
		});
		await expect(readSelfRewardRow(harness.db, ids.rewardId)).resolves.toMatchObject({
			ciphertext: batch.rewards[0]?.ciphertext,
			vaultId,
			revision: 1,
			title: '',
			description: null
		});
		const [claim] = await readSelfRewardClaimRows(harness.db, ada.id);
		expect(defined(claim, 'claim row')).toMatchObject({
			snapshotCiphertext: batch.claims[0]?.ciphertext,
			snapshotVaultId: vaultId,
			snapshotRecordId: ids.claimId,
			rewardTitle: '',
			rewardDescription: null
		});

		// And there is nothing left to hand out.
		await expect(listUnsealedContent(harness.db, ada.id, SELF)).resolves.toMatchObject({
			tasks: [],
			completions: [],
			rewards: [],
			claims: [],
			next: null
		});
	});

	it("seals a partnership's rows for a member who did not write them", async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, jun)).id;
		const ids = await insertLegacyPartnershipRows(partnershipId, ada, jun);
		const vaultId = await ensureTestPartnershipVault(harness.db, partnershipId);
		const batch = batchFor(vaultId, ids);

		await expect(
			sealUnsealedContent(harness.db, jun.id, { kind: 'partnership', partnershipId }, batch)
		).resolves.toEqual({ ok: true, sealed: 4 });
		await expect(readPartnershipTaskRow(harness.db, ids.taskId)).resolves.toMatchObject({
			ciphertext: batch.tasks[0]?.ciphertext,
			vaultId,
			revision: 1,
			title: ''
		});
		await expect(readPartnershipRewardRow(harness.db, ids.rewardId)).resolves.toMatchObject({
			ciphertext: batch.rewards[0]?.ciphertext,
			vaultId,
			revision: 1,
			title: ''
		});
	});

	it("refuses a batch naming any vault but the scope's own", async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, jun)).id;
		const partnershipVault = await ensureTestPartnershipVault(harness.db, partnershipId);
		const junsVault = await ensureTestSelfVault(harness.db, jun.id);
		await ensureTestSelfVault(harness.db, ada.id);
		const ids = await insertLegacySelfRows(ada);

		for (const vaultId of [partnershipVault, junsVault]) {
			await expect(
				sealUnsealedContent(harness.db, ada.id, SELF, batchFor(vaultId, ids))
			).resolves.toEqual({ ok: false, reason: 'invalid' });
		}
		await expect(readSelfTaskRow(harness.db, ids.taskId)).resolves.toMatchObject({
			ciphertext: null,
			title: 'Old task'
		});
	});

	it('refuses a batch with a malformed ciphertext, and writes none of it', async () => {
		const ids = await insertLegacySelfRows(ada);
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		const batch = batchFor(vaultId, ids);
		batch.rewards = [{ id: ids.rewardId, ciphertext: 'Old reward', payloadVersion: 1 }];

		await expect(sealUnsealedContent(harness.db, ada.id, SELF, batch)).resolves.toEqual({
			ok: false,
			reason: 'invalid'
		});
		await expect(readSelfTaskRow(harness.db, ids.taskId)).resolves.toMatchObject({
			ciphertext: null,
			title: 'Old task'
		});
	});

	it('refuses an unknown payload version', async () => {
		const ids = await insertLegacySelfRows(ada);
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		const batch = batchFor(vaultId, ids);
		batch.tasks = [
			{
				id: ids.taskId,
				ciphertext: fakeSealed('task'),
				payloadVersion: 99,
				completionMessageCount: 0
			}
		];

		await expect(sealUnsealedContent(harness.db, ada.id, SELF, batch)).resolves.toEqual({
			ok: false,
			reason: 'invalid'
		});
	});

	it('refuses a scope the actor has no vault in', async () => {
		const ids = await insertLegacySelfRows(ada);
		const partnershipId = (await createTestPartnership(harness.db, ada, jun)).id;
		const vaultId = await ensureTestPartnershipVault(harness.db, partnershipId);
		const stranger = await createTestUser(harness.db, { name: 'Stranger' });

		await expect(
			sealUnsealedContent(
				harness.db,
				stranger.id,
				{ kind: 'partnership', partnershipId },
				{ vaultId, ...EMPTY_BATCH }
			)
		).resolves.toEqual({ ok: false, reason: 'not-found' });
		// Ada has no self vault yet, so there is nothing her rows could be sealed under.
		await expect(
			sealUnsealedContent(harness.db, ada.id, SELF, batchFor(vaultId, ids))
		).resolves.toEqual({ ok: false, reason: 'not-found' });
	});

	it('never overwrites a row that is already sealed', async () => {
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		const task = await createTestSelfTask(harness.db, ada);
		const reward = await createTestSelfReward(harness.db, ada);

		await expect(
			sealUnsealedContent(harness.db, ada.id, SELF, {
				vaultId,
				tasks: [
					{
						id: task.id,
						ciphertext: fakeSealed('over'),
						payloadVersion: 1,
						completionMessageCount: 0
					}
				],
				completions: [],
				rewards: [{ id: reward.id, ciphertext: fakeSealed('over'), payloadVersion: 1 }],
				claims: []
			})
		).resolves.toEqual({ ok: true, sealed: 0 });
		await expect(readSelfTaskRow(harness.db, task.id)).resolves.toMatchObject({
			ciphertext: task.ciphertext,
			revision: 0
		});
		await expect(readSelfRewardRow(harness.db, reward.id)).resolves.toMatchObject({
			ciphertext: reward.ciphertext,
			revision: 0
		});
	});

	it('seals each row once, so a second device sealing the same rows changes nothing', async () => {
		const ids = await insertLegacySelfRows(ada);
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		const first = batchFor(vaultId, ids);

		await sealUnsealedContent(harness.db, ada.id, SELF, first);
		await expect(
			sealUnsealedContent(harness.db, ada.id, SELF, batchFor(vaultId, ids))
		).resolves.toEqual({ ok: true, sealed: 0 });
		await expect(readSelfTaskRow(harness.db, ids.taskId)).resolves.toMatchObject({
			ciphertext: first.tasks[0]?.ciphertext,
			revision: 1
		});
	});

	it("cannot seal another user's rows, even under the actor's own vault", async () => {
		const juns = await insertLegacySelfRows(jun);
		const adasVault = await ensureTestSelfVault(harness.db, ada.id);

		await expect(
			sealUnsealedContent(harness.db, ada.id, SELF, batchFor(adasVault, juns))
		).resolves.toEqual({ ok: true, sealed: 0 });
		await expect(readSelfTaskRow(harness.db, juns.taskId)).resolves.toMatchObject({
			ciphertext: null,
			title: 'Old task'
		});
		await expect(readSelfRewardRow(harness.db, juns.rewardId)).resolves.toMatchObject({
			ciphertext: null,
			title: 'Old reward'
		});
	});

	it("cannot seal another partnership's rows through a partnership it is in", async () => {
		const cas = await createTestUser(harness.db, { name: 'Cas' });
		const mine = (await createTestPartnership(harness.db, ada, jun)).id;
		const theirs = (await createTestPartnership(harness.db, jun, cas)).id;
		const theirRows = await insertLegacyPartnershipRows(theirs, jun, cas);
		const myVault = await ensureTestPartnershipVault(harness.db, mine);

		await expect(
			sealUnsealedContent(
				harness.db,
				ada.id,
				{ kind: 'partnership', partnershipId: mine },
				batchFor(myVault, theirRows)
			)
		).resolves.toEqual({ ok: true, sealed: 0 });
		await expect(readPartnershipTaskRow(harness.db, theirRows.taskId)).resolves.toMatchObject({
			ciphertext: null,
			title: 'Shared task'
		});
	});
});

describe('partnership names', () => {
	const Legacy = { inviterName: 'Ada', inviteeName: 'Jun', inviterRole: 'dom', inviteeRole: null };

	/** A partnership accepted through a sealed invite, its names still under the invite key. */
	async function acceptedInvite() {
		const invite = await createTestInvite(harness.db, ada);
		const accepted = await acceptInvite(harness.db, {
			token: invite.inviteToken,
			inviteeId: jun.id
		});
		if (!accepted.ok) {
			throw new Error(`could not accept: ${accepted.reason}`);
		}
		return { partnershipId: invite.id, inviteCiphertext: invite.inviteCiphertext };
	}

	/** Seals only the names, as a device with no other unsealed rows would. */
	function namesBatch(vaultId: string, ciphertext = fakeSealed('names')): SealedContentBatch {
		return { vaultId, ...EMPTY_BATCH, names: { ciphertext, payloadVersion: 1 } };
	}

	it('lists plaintext names from before sealing, from the actor’s end', async () => {
		const partnershipId = (
			await createTestPartnership(harness.db, ada, jun, { legacyNames: Legacy })
		).id;
		const scope: ContentScope = { kind: 'partnership', partnershipId };

		const forJun = defined(await listUnsealedContent(harness.db, jun.id, scope), 'page');
		expect(forJun.names).toEqual({
			partnershipId,
			role: 'invitee',
			sealed: null,
			invite: null,
			legacy: Legacy
		});
		const forAda = defined(await listUnsealedContent(harness.db, ada.id, scope), 'page');
		expect(forAda.names?.role).toBe('inviter');
	});

	it('lists names still under an accepted invite’s key, its wrap to the inviter only', async () => {
		const { partnershipId, inviteCiphertext } = await acceptedInvite();
		const scope: ContentScope = { kind: 'partnership', partnershipId };

		const forAda = defined(await listUnsealedContent(harness.db, ada.id, scope), 'page');
		expect(forAda.names?.invite).toMatchObject({ ciphertext: inviteCiphertext, payloadVersion: 1 });
		expect(forAda.names?.invite?.keyWrap).not.toBeNull();
		const forJun = defined(await listUnsealedContent(harness.db, jun.id, scope), 'page');
		expect(forJun.names?.invite).toEqual({
			ciphertext: inviteCiphertext,
			payloadVersion: 1,
			keyWrap: null
		});
	});

	it('lists nothing once the names are in the vault', async () => {
		const { partnershipId } = await acceptedInvite();
		const vaultId = await ensureTestPartnershipVault(harness.db, partnershipId);
		const scope: ContentScope = { kind: 'partnership', partnershipId };
		await sealUnsealedContent(harness.db, jun.id, scope, namesBatch(vaultId));

		const page = defined(await listUnsealedContent(harness.db, ada.id, scope), 'page');
		expect(page.names).toBeNull();
	});

	it('seals the names into the vault, clearing the invite and any plaintext', async () => {
		const partnershipId = (
			await createTestPartnership(harness.db, ada, jun, { legacyNames: Legacy })
		).id;
		const vaultId = await ensureTestPartnershipVault(harness.db, partnershipId);
		const batch = namesBatch(vaultId);

		await expect(
			sealUnsealedContent(harness.db, jun.id, { kind: 'partnership', partnershipId }, batch)
		).resolves.toEqual({ ok: true, sealed: 1 });
		await expect(readPartnershipRow(harness.db, partnershipId)).resolves.toMatchObject({
			namesCiphertext: batch.names?.ciphertext,
			namesVaultId: vaultId,
			namesPayloadVersion: 1,
			namesRevision: 1,
			inviterName: '',
			inviteeName: '',
			inviterRole: null,
			inviteeRole: null,
			inviteCiphertext: null,
			invitePayloadVersion: null,
			inviteKeyWrap: null
		});
	});

	it('clears an accepted invite’s ciphertext and key wrap as it seals', async () => {
		const { partnershipId } = await acceptedInvite();
		const vaultId = await ensureTestPartnershipVault(harness.db, partnershipId);
		const batch = namesBatch(vaultId);

		await expect(
			sealUnsealedContent(harness.db, ada.id, { kind: 'partnership', partnershipId }, batch)
		).resolves.toEqual({ ok: true, sealed: 1 });
		await expect(readPartnershipRow(harness.db, partnershipId)).resolves.toMatchObject({
			namesCiphertext: batch.names?.ciphertext,
			inviteCiphertext: null,
			invitePayloadVersion: null,
			inviteKeyWrap: null
		});
	});

	it('never overwrites names already in the vault', async () => {
		const { partnershipId } = await acceptedInvite();
		const vaultId = await ensureTestPartnershipVault(harness.db, partnershipId);
		const scope: ContentScope = { kind: 'partnership', partnershipId };
		const first = namesBatch(vaultId);
		await sealUnsealedContent(harness.db, ada.id, scope, first);

		await expect(
			sealUnsealedContent(harness.db, jun.id, scope, namesBatch(vaultId))
		).resolves.toEqual({ ok: true, sealed: 0 });
		await expect(readPartnershipRow(harness.db, partnershipId)).resolves.toMatchObject({
			namesCiphertext: first.names?.ciphertext,
			namesRevision: 1
		});
	});

	it('refuses a malformed names ciphertext, and writes none of the batch', async () => {
		const partnershipId = (
			await createTestPartnership(harness.db, ada, jun, { legacyNames: Legacy })
		).id;
		const ids = await insertLegacyPartnershipRows(partnershipId, ada, jun);
		const vaultId = await ensureTestPartnershipVault(harness.db, partnershipId);
		const scope: ContentScope = { kind: 'partnership', partnershipId };

		for (const names of [
			{ ciphertext: 'Ada and Jun', payloadVersion: 1 },
			{ ciphertext: fakeSealed('names'), payloadVersion: 99 }
		]) {
			await expect(
				sealUnsealedContent(harness.db, ada.id, scope, { ...batchFor(vaultId, ids), names })
			).resolves.toEqual({ ok: false, reason: 'invalid' });
		}
		await expect(readPartnershipRow(harness.db, partnershipId)).resolves.toMatchObject({
			namesCiphertext: null,
			inviterName: 'Ada'
		});
		await expect(readPartnershipTaskRow(harness.db, ids.taskId)).resolves.toMatchObject({
			ciphertext: null
		});
	});

	it('refuses names in the self scope, which has none', async () => {
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		await expect(
			sealUnsealedContent(harness.db, ada.id, SELF, namesBatch(vaultId))
		).resolves.toEqual({ ok: false, reason: 'invalid' });
	});
});
