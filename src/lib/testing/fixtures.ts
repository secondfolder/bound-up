import { and, eq } from 'drizzle-orm';
import { generateAgeIdentity } from '../crypto/identity';
import type { DaydreamTurnRole } from '../daydream';
import type { ThreadIcon } from '../messaging';
import type { ControlAnswer } from '../partnership';
import { controlFromAnswer } from '../partnership';
import { appendTurn, createDaydream } from '../server/daydreams';
import type { Db } from '../server/db';
import {
	accountRecoveryRequests,
	daydreams,
	daydreamTurns,
	historyRestoreRequests,
	messageAttachments,
	messages,
	messageThreads,
	partnershipRewardClaims,
	partnershipRewardCredits,
	partnershipRewards,
	partnerships,
	partnershipTaskCompletions,
	partnershipTasks,
	selfRewardClaims,
	selfRewardCredits,
	selfRewards,
	selfTaskCompletions,
	selfTasks,
	threadReads,
	user,
	userKeys,
	userKeyWraps,
	vaults
} from '../server/db/schema';
import { grantFeature } from '../server/features';
import { putUserKeys } from '../server/keys';
import type { MediaStore } from '../server/media';
import { type OutgoingAttachment, sendMessage, startThread } from '../server/messaging';
import { acceptInvite, createInvite } from '../server/partnerships';
import {
	claimPartnershipReward,
	claimSelfReward,
	createPartnershipReward,
	createSelfReward,
	setPartnershipRewardCredits,
	setSelfRewardCredits
} from '../server/rewards';
import { createPartnershipTask, createSelfTask } from '../server/tasks';
import type { TaskSettings } from '../tasks';
import type { TaskSchedule } from '../types';
import { FAKE_WRAP_BLOB, PASSWORD_WRAP_PARAMS } from './crypto';
import { createTestMediaStore } from './media';

/**
 * Fixtures for the partners tests.
 *
 * Users are inserted straight into the `user` table rather than going through
 * Better Auth: nothing under test reads a password, a session or an account
 * row, and booting the auth instance would drag in `sveltekitCookies`, which
 * needs a live request context. The e2e suite covers the real signup path.
 */

let counter = 0;

/**
 * A strictly increasing clock for fixtures that do not pin their own time.
 *
 * `new Date()` is the obvious default and it is subtly wrong here: two writes
 * in the same millisecond fall back to the `id` tiebreak, which is a UUID, so
 * the order becomes arbitrary and a test that reads `messages[1]` passes or
 * fails depending on which UUID sorted first. That produced a genuine flake
 * that only appeared when the whole suite ran.
 *
 * Starts well in the past so a fixture time never collides with a real
 * `new Date()` written by code under test.
 */
let fixtureClock = new Date('2020-01-01T00:00:00.000Z').getTime();

function nextFixtureTime(): Date {
	fixtureClock += 1000;
	return new Date(fixtureClock);
}

export type TestUser = {
	id: string;
	name: string;
	email: string;
	image: string | null;
	timezone: string;
	/** Better Auth's admin plugin role. `'admin'` or `'user'`. */
	role: string;
};

export async function createTestUser(db: Db, overrides: Partial<TestUser> = {}): Promise<TestUser> {
	counter += 1;
	const row: TestUser = {
		id: overrides.id ?? `user-${counter}`,
		name: overrides.name ?? `Test User ${counter}`,
		email: overrides.email ?? `user-${counter}@example.test`,
		image: overrides.image ?? null,
		timezone: overrides.timezone ?? 'UTC',
		role: overrides.role ?? 'user'
	};

	await db.insert(user).values({
		id: row.id,
		name: row.name,
		email: row.email,
		emailVerified: false,
		image: row.image,
		timezone: row.timezone,
		createdAt: new Date(),
		updatedAt: new Date()
	});
	// Written after the insert, not with it: the migrations' first-account
	// trigger makes whichever fixture user is inserted first an admin, and a
	// test's roles should be what it asked for, not an accident of order.
	await db.update(user).set({ role: row.role }).where(eq(user.id, row.id));

	return row;
}

/**
 * A pending invite, as `/settings/partners/new` would create it: sealed under
 * an invite key the server never sees, so a stand-in ciphertext does. A test
 * that wants a partnership from before names were sealed, with plaintext
 * names, asks for `legacyNames`.
 */
export async function createTestInvite(
	db: Db,
	inviter: TestUser,
	options: {
		/** Answered from the inviter's side, exactly as the form asks it. */
		control?: ControlAnswer;
		now?: Date;
		/** The stand-in for the sealed invite. */
		inviteCiphertext?: string;
		/** Store these in the clear instead, as a row from before sealing would. */
		legacyNames?: {
			inviterName: string;
			inviteeName: string;
			inviterRole?: string | null;
			inviteeRole?: string | null;
		};
	} = {}
): Promise<{ id: string; inviteToken: string; inviteExpiresAt: Date; inviteCiphertext: string }> {
	const inviteCiphertext = options.inviteCiphertext ?? fakeSealed('invite');
	const result = await createInvite(
		db,
		{
			id: crypto.randomUUID(),
			inviterId: inviter.id,
			control: controlFromAnswer(options.control ?? 'mix', 'inviter'),
			invite: { ciphertext: inviteCiphertext, payloadVersion: 1, keyWrap: FAKE_INVITE_KEY_WRAP }
		},
		options.now ?? new Date()
	);
	if (!result.ok) {
		throw new Error(`fixture could not create invite: ${result.reason}`);
	}
	if (options.legacyNames) {
		const { legacyNames } = options;
		await db
			.update(partnerships)
			.set({
				inviterName: legacyNames.inviterName,
				inviteeName: legacyNames.inviteeName,
				inviterRole: legacyNames.inviterRole ?? null,
				inviteeRole: legacyNames.inviteeRole ?? null,
				inviteCiphertext: null,
				invitePayloadVersion: null,
				inviteKeyWrap: null
			})
			.where(eq(partnerships.id, result.id));
	}
	return {
		id: result.id,
		inviteToken: result.inviteToken,
		inviteExpiresAt: result.inviteExpiresAt,
		inviteCiphertext
	};
}

/** Stands in for an invite key wrapped to the inviter: base64, as the server checks it. */
export const FAKE_INVITE_KEY_WRAP = 'ZmFrZS1pbnZpdGUta2V5LXdyYXA=';

/** A fully linked pair, created through the real invite → accept path. */
export async function createTestPartnership(
	db: Db,
	inviter: TestUser,
	invitee: TestUser,
	options: Parameters<typeof createTestInvite>[2] = {}
): Promise<{ id: string }> {
	// Accepted as a sealed invite, since only those can be; a legacy one gets
	// its plaintext names afterwards, as a row accepted before sealing has.
	const { legacyNames, ...rest } = options;
	const invite = await createTestInvite(db, inviter, rest);
	const result = await acceptInvite(db, { token: invite.inviteToken, inviteeId: invitee.id });
	if (!result.ok) {
		throw new Error(`fixture could not accept invite: ${result.reason}`);
	}
	if (legacyNames) {
		await db
			.update(partnerships)
			.set({
				inviterName: legacyNames.inviterName,
				inviteeName: legacyNames.inviteeName,
				inviterRole: legacyNames.inviterRole ?? null,
				inviteeRole: legacyNames.inviteeRole ?? null,
				inviteCiphertext: null,
				invitePayloadVersion: null,
				inviteKeyWrap: null
			})
			.where(eq(partnerships.id, result.id));
	}
	return { id: result.id };
}

/** Pushes a pending invite's expiry into the past. */
export async function expireInvite(db: Db, partnershipId: string): Promise<void> {
	await db
		.update(partnerships)
		.set({ inviteExpiresAt: new Date(Date.now() - 1000) })
		.where(eq(partnerships.id, partnershipId));
}

/** The raw row, for assertions about columns the view layer hides. */
export async function readPartnershipRow(db: Db, id: string) {
	const rows = await db.select().from(partnerships).where(eq(partnerships.id, id)).limit(1);
	return rows[0];
}

/**
 * Gives a user a recipient and one password wrap, as signup would.
 *
 * Generates a genuine age keypair rather than a synthetic string, because a
 * recipient is bech32 with a checksum and a made-up one would pass a regex but
 * fail anything that actually decoded it. X25519 keygen is about a millisecond,
 * so this is cheaper than the class of confusing failure it avoids.
 *
 * Goes through `putUserKeys` so a test relying on the unique constraint or the
 * batch is exercising the real path.
 */
export async function createTestUserKeys(
	db: Db,
	owner: TestUser,
	options: { recipient?: string } = {}
): Promise<{ identity: string; recipient: string }> {
	const generated = await generateAgeIdentity();
	const recipient = options.recipient ?? generated.recipient;
	await putUserKeys(db, owner.id, {
		recipient,
		wrap: { type: 'password', params: PASSWORD_WRAP_PARAMS, blob: FAKE_WRAP_BLOB }
	});
	return { identity: generated.identity, recipient };
}

/**
 * A restore request, as a partner-assisted sign-in opens one.
 *
 * Inserted directly — a pending `account_recovery_requests` row with its one
 * restore request — rather than through `startAccountRecovery`, which needs an
 * auth secret and derives hashes that no messaging test cares about. The
 * recovery flow itself is tested through the real function in
 * `server/recovery.test.ts`.
 */
export async function createTestRestoreRequest(
	db: Db,
	input: {
		partnershipId: string;
		requesterId: string;
		recipient: string;
		expiresAt?: Date;
	}
): Promise<{ id: string; recoveryRequestId: string }> {
	const recoveryRequestId = crypto.randomUUID();
	const id = crypto.randomUUID();
	await db.batch([
		db.insert(accountRecoveryRequests).values({
			id: recoveryRequestId,
			userId: input.requesterId,
			emailHash: `test-${recoveryRequestId}`,
			tokenHash: `test-${recoveryRequestId}`,
			recipient: input.recipient,
			wrapParams: PASSWORD_WRAP_PARAMS,
			wrapBlob: FAKE_WRAP_BLOB,
			expiresAt: input.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000)
		}),
		db.insert(historyRestoreRequests).values({
			id,
			partnershipId: input.partnershipId,
			requesterId: input.requesterId,
			requestedRecipient: input.recipient,
			recoveryRequestId
		})
	]);
	return { id, recoveryRequestId };
}

/** The raw key row, for assertions about columns the view layer hides. */
export async function readUserKeysRow(db: Db, userId: string) {
	const rows = await db.select().from(userKeys).where(eq(userKeys.userId, userId)).limit(1);
	return rows[0];
}

/** Every wrap row for a user, for counting after a password change. */
export async function readWrapRows(db: Db, userId: string) {
	return await db.select().from(userKeyWraps).where(eq(userKeyWraps.userId, userId));
}

/**
 * What a fixture task or reward is made from: the plain settings, and a
 * stand-in for the sealed content. The server never reads the content, so a
 * test names the ciphertext it expects to get back rather than a title.
 */
export type TestRewardInput = { cost?: number; active?: boolean; ciphertext?: string };

export type TestTaskInput = Partial<TaskSettings> & {
	ciphertext?: string;
	completionMessageCount?: number;
};

export async function createTestSelfReward(
	db: Db,
	owner: TestUser,
	input: TestRewardInput = {}
): Promise<{ id: string; ciphertext: string }> {
	const id = crypto.randomUUID();
	const ciphertext = input.ciphertext ?? fakeSealed('reward');
	const result = await createSelfReward(db, owner.id, id, {
		cost: input.cost ?? 3,
		active: input.active ?? true,
		content: { vaultId: await ensureTestSelfVault(db, owner.id), ciphertext, payloadVersion: 1 }
	});
	if (!result.ok) {
		throw new Error(`fixture could not create self reward: ${result.reason}`);
	}
	return { id, ciphertext };
}

export async function setTestSelfRewardCredits(
	db: Db,
	owner: TestUser,
	credits: number
): Promise<void> {
	await setSelfRewardCredits(db, owner.id, credits);
}

export async function claimTestSelfReward(
	db: Db,
	owner: TestUser,
	rewardId: string
): Promise<void> {
	const result = await claimSelfReward(db, owner.id, rewardId);
	if (!result.ok) {
		throw new Error(`fixture could not claim self reward: ${result.reason}`);
	}
}

export async function readSelfRewardRow(db: Db, id: string) {
	const rows = await db.select().from(selfRewards).where(eq(selfRewards.id, id)).limit(1);
	return rows[0];
}

export async function readSelfRewardCreditRow(db: Db, ownerId: string) {
	const rows = await db
		.select()
		.from(selfRewardCredits)
		.where(eq(selfRewardCredits.ownerId, ownerId))
		.limit(1);
	return rows[0];
}

export async function readSelfRewardClaimRows(db: Db, ownerId: string) {
	return await db
		.select()
		.from(selfRewardClaims)
		.where(eq(selfRewardClaims.ownerId, ownerId))
		.orderBy(selfRewardClaims.createdAt, selfRewardClaims.id);
}

export async function createTestPartnershipReward(
	db: Db,
	partnershipId: string,
	owner: TestUser,
	input: TestRewardInput = {}
): Promise<{ id: string; ciphertext: string }> {
	const id = crypto.randomUUID();
	const ciphertext = input.ciphertext ?? fakeSealed('reward');
	const result = await createPartnershipReward(db, partnershipId, owner.id, id, {
		cost: input.cost ?? 2,
		active: input.active ?? true,
		content: {
			vaultId: await ensureTestPartnershipVault(db, partnershipId),
			ciphertext,
			payloadVersion: 1
		}
	});
	if (!result.ok) {
		throw new Error(`fixture could not create partnership reward: ${result.reason}`);
	}
	return { id, ciphertext };
}

export async function setTestPartnershipRewardCredits(
	db: Db,
	partnershipId: string,
	actor: TestUser,
	target: TestUser,
	credits: number
): Promise<void> {
	const result = await setPartnershipRewardCredits(db, partnershipId, actor.id, target.id, credits);
	if (!result.ok) {
		throw new Error(`fixture could not set partnership credits: ${result.reason}`);
	}
}

export async function claimTestPartnershipReward(
	db: Db,
	partnershipId: string,
	viewer: TestUser,
	rewardId: string
): Promise<void> {
	const result = await claimPartnershipReward(db, { partnershipId, rewardId, userId: viewer.id });
	if (!result.ok) {
		throw new Error(`fixture could not claim partnership reward: ${result.reason}`);
	}
}

export async function readPartnershipRewardRow(db: Db, id: string) {
	const rows = await db
		.select()
		.from(partnershipRewards)
		.where(eq(partnershipRewards.id, id))
		.limit(1);
	return rows[0];
}

export async function readPartnershipRewardRows(db: Db, partnershipId: string) {
	return await db
		.select()
		.from(partnershipRewards)
		.where(eq(partnershipRewards.partnershipId, partnershipId))
		.orderBy(partnershipRewards.createdAt, partnershipRewards.id);
}

export async function readPartnershipRewardCreditRow(
	db: Db,
	partnershipId: string,
	userId: string
) {
	const rows = await db
		.select()
		.from(partnershipRewardCredits)
		.where(
			and(
				eq(partnershipRewardCredits.partnershipId, partnershipId),
				eq(partnershipRewardCredits.userId, userId)
			)
		)
		.limit(1);
	return rows[0];
}

export async function readPartnershipRewardClaimRows(db: Db, partnershipId: string) {
	return await db
		.select()
		.from(partnershipRewardClaims)
		.where(eq(partnershipRewardClaims.partnershipId, partnershipId))
		.orderBy(partnershipRewardClaims.createdAt, partnershipRewardClaims.id);
}

function defaultTaskSchedule(): TaskSchedule {
	return { mode: 'one-off' };
}

export async function createTestSelfTask(
	db: Db,
	owner: TestUser,
	input: TestTaskInput = {}
): Promise<{ id: string; ciphertext: string }> {
	const id = crypto.randomUUID();
	const ciphertext = input.ciphertext ?? fakeSealed('task');
	const result = await createSelfTask(db, owner.id, owner.timezone, id, {
		active: input.active ?? true,
		creditsAwarded: input.creditsAwarded ?? 2,
		schedule: input.schedule ?? defaultTaskSchedule(),
		timezoneOwnerUserId: input.timezoneOwnerUserId ?? owner.id,
		content: {
			vaultId: await ensureTestSelfVault(db, owner.id),
			ciphertext,
			payloadVersion: 1,
			completionMessageCount: input.completionMessageCount ?? 1
		}
	});
	if (!result.ok) {
		throw new Error(`fixture could not create self task: ${result.reason}`);
	}
	return { id, ciphertext };
}

export async function createTestPartnershipTask(
	db: Db,
	partnershipId: string,
	viewer: TestUser,
	input: TestTaskInput = {}
): Promise<{ id: string; ciphertext: string }> {
	const id = crypto.randomUUID();
	const ciphertext = input.ciphertext ?? fakeSealed('task');
	const result = await createPartnershipTask(db, partnershipId, viewer.id, viewer.timezone, id, {
		active: input.active ?? true,
		creditsAwarded: input.creditsAwarded ?? 2,
		schedule: input.schedule ?? defaultTaskSchedule(),
		timezoneOwnerUserId: input.timezoneOwnerUserId ?? viewer.id,
		content: {
			vaultId: await ensureTestPartnershipVault(db, partnershipId),
			ciphertext,
			payloadVersion: 1,
			completionMessageCount: input.completionMessageCount ?? 1
		}
	});
	if (!result.ok) {
		throw new Error(`fixture could not create partnership task: ${result.reason}`);
	}
	return { id, ciphertext };
}

export async function readSelfTaskRow(db: Db, id: string) {
	const rows = await db.select().from(selfTasks).where(eq(selfTasks.id, id)).limit(1);
	return rows[0];
}

export async function readSelfTaskCompletionRows(db: Db, ownerId: string) {
	return await db
		.select()
		.from(selfTaskCompletions)
		.where(eq(selfTaskCompletions.ownerId, ownerId))
		.orderBy(selfTaskCompletions.createdAt, selfTaskCompletions.id);
}

export async function readPartnershipTaskRow(db: Db, id: string) {
	const rows = await db.select().from(partnershipTasks).where(eq(partnershipTasks.id, id)).limit(1);
	return rows[0];
}

export async function readPartnershipTaskRows(db: Db, partnershipId: string) {
	return await db
		.select()
		.from(partnershipTasks)
		.where(eq(partnershipTasks.partnershipId, partnershipId))
		.orderBy(partnershipTasks.createdAt, partnershipTasks.id);
}

export async function readPartnershipTaskCompletionRows(db: Db, partnershipId: string) {
	return await db
		.select()
		.from(partnershipTaskCompletions)
		.where(eq(partnershipTaskCompletions.partnershipId, partnershipId))
		.orderBy(partnershipTaskCompletions.createdAt, partnershipTaskCompletions.id);
}

/**
 * A thread with one message, through the real `startThread` path.
 *
 * `at` sets both the thread's `last_message_at` and the message's timestamp, so
 * a test can lay out a board in a known order without sleeping.
 */
/**
 * The partnership's vault, made if it has none — directly, with no wraps, since
 * the server never opens anything sealed in it. For tests of what the server
 * stores; the vault flow itself is tested in `server/vaults.test.ts`.
 */
export async function ensureTestPartnershipVault(db: Db, partnershipId: string): Promise<string> {
	const [existing] = await db
		.select({ id: vaults.id })
		.from(vaults)
		.where(eq(vaults.partnershipId, partnershipId))
		.limit(1);
	if (existing) {
		return existing.id;
	}
	const id = crypto.randomUUID();
	await db
		.insert(vaults)
		.values({ id, kind: 'partnership', partnershipId, keyCheck: 'K'.repeat(43) });
	return id;
}

/** The user's own vault, made if they have none, as `ensureTestPartnershipVault`. */
export async function ensureTestSelfVault(db: Db, userId: string): Promise<string> {
	const [existing] = await db
		.select({ id: vaults.id })
		.from(vaults)
		.where(eq(vaults.ownerUserId, userId))
		.limit(1);
	if (existing) {
		return existing.id;
	}
	const id = crypto.randomUUID();
	await db
		.insert(vaults)
		.values({ id, kind: 'self', ownerUserId: userId, keyCheck: 'K'.repeat(43) });
	return id;
}

/** A stand-in sealed ciphertext. The server checks only its shape, never its content. */
export function fakeSealed(label = 'body'): string {
	return `sb1.${label.replace(/[^A-Za-z0-9_-]/g, '')}${crypto.randomUUID().replaceAll('-', '')}`;
}

/** The sealed half of a send, for a partnership's vault. */
export async function testSealedSend(
	db: Db,
	partnershipId: string,
	options: { ciphertext?: string; metadataCiphertext?: string } = {}
) {
	return {
		messageId: crypto.randomUUID(),
		vaultId: await ensureTestPartnershipVault(db, partnershipId),
		ciphertext: options.ciphertext ?? fakeSealed(),
		payloadVersion: 1,
		metadataCiphertext: options.metadataCiphertext,
		metadataVersion: options.metadataCiphertext === undefined ? undefined : 1
	};
}

export async function createTestThread(
	db: Db,
	partnershipId: string,
	sender: TestUser,
	options: {
		icon?: ThreadIcon;
		ciphertext?: string;
		metadataCiphertext?: string;
		at?: Date;
		attachments?: OutgoingAttachment[];
		store?: MediaStore;
	} = {}
): Promise<{ threadId: string; messageId: string }> {
	const result = await startThread(
		db,
		options.store ?? createTestMediaStore(),
		{
			partnershipId,
			senderId: sender.id,
			icon: options.icon ?? 'envelope',
			...(await testSealedSend(db, partnershipId, options)),
			attachments: options.attachments ?? []
		},
		options.at ?? nextFixtureTime()
	);
	if (!result.ok) {
		throw new Error(`fixture could not start a thread: ${result.reason}`);
	}
	return { threadId: result.threadId, messageId: result.messageId };
}

/** A reply, through the real `sendMessage` path. */
export async function createTestMessage(
	db: Db,
	partnershipId: string,
	threadId: string,
	sender: TestUser,
	options: {
		ciphertext?: string;
		metadataCiphertext?: string;
		at?: Date;
		attachments?: OutgoingAttachment[];
		store?: MediaStore;
	} = {}
): Promise<{ messageId: string }> {
	const result = await sendMessage(
		db,
		options.store ?? createTestMediaStore(),
		{
			partnershipId,
			threadId,
			senderId: sender.id,
			...(await testSealedSend(db, partnershipId, options)),
			attachments: options.attachments ?? []
		},
		options.at ?? nextFixtureTime()
	);
	if (!result.ok) {
		throw new Error(`fixture could not send a message: ${result.reason}`);
	}
	return { messageId: result.messageId };
}

/** The raw thread row, for assertions about the denormalised columns. */
export async function readThreadRow(db: Db, threadId: string) {
	const rows = await db
		.select()
		.from(messageThreads)
		.where(eq(messageThreads.id, threadId))
		.limit(1);
	return rows[0];
}

/** Every read-state row for a thread, for counting who has opened it. */
export async function readThreadReadRows(db: Db, threadId: string) {
	return await db.select().from(threadReads).where(eq(threadReads.threadId, threadId));
}

/** All attachment rows for a message. */
export async function readAttachmentRows(db: Db, messageId: string) {
	return await db
		.select()
		.from(messageAttachments)
		.where(eq(messageAttachments.messageId, messageId));
}

/** Every message row in a thread, oldest first. */
export async function readMessageRows(db: Db, threadId: string) {
	return await db
		.select()
		.from(messages)
		.where(eq(messages.threadId, threadId))
		.orderBy(messages.createdAt, messages.id);
}

/**
 * Turns a message back into a row in the original scheme: an age ciphertext
 * to both partners, no vault. Nothing sends those any more, so a test of the
 * migration into the vault has to make them.
 */
export async function makeMessageLegacy(
	db: Db,
	messageId: string,
	options: { ciphertext?: string; metadataCiphertext?: string | null; plain?: boolean } = {}
): Promise<void> {
	await db
		.update(messages)
		.set({
			ciphertext: options.ciphertext ?? 'YWdlIGJvZHk=',
			metadataCiphertext: options.metadataCiphertext ?? null,
			vaultId: null,
			payloadVersion: null,
			metadataVersion: null,
			bodyFormat: options.plain ? 'plain' : 'lexical'
		})
		.where(eq(messages.id, messageId));
}

// ── daydreams ────────────────────────────────────────────────────────────────

/** Gives a user the Daydreams feature, granted by themselves, which nothing reads. */
export async function grantTestDaydreams(db: Db, userId: string): Promise<void> {
	await grantFeature(db, { userId, feature: 'daydreams', grantedByUserId: userId });
}

/**
 * A daydream with a stand-in sealed setup, and these turns one after another
 * (each the child of the last), through the same functions the endpoints use.
 * Returns the daydream's id and its turns' ids.
 */
export async function createTestDaydream(
	db: Db,
	ownerId: string,
	turns: readonly DaydreamTurnRole[] = []
): Promise<{ id: string; turnIds: string[] }> {
	const vaultId = await ensureTestSelfVault(db, ownerId);
	const id = crypto.randomUUID();
	const created = await createDaydream(db, ownerId, id, {
		vaultId,
		ciphertext: fakeSealed('setup'),
		payloadVersion: 2
	});
	if (!created.ok) {
		throw new Error(`createTestDaydream: ${created.reason}`);
	}
	const turnIds: string[] = [];
	for (const role of turns) {
		const turnId = await appendTestTurn(db, ownerId, id, turnIds.at(-1) ?? null, role);
		turnIds.push(turnId);
	}
	return { id, turnIds };
}

/** One more turn, after `parentId` (null for a root), with a stand-in sealed body. */
export async function appendTestTurn(
	db: Db,
	ownerId: string,
	daydreamId: string,
	parentId: string | null,
	role: DaydreamTurnRole = 'story'
): Promise<string> {
	const turnId = crypto.randomUUID();
	const appended = await appendTurn(
		db,
		ownerId,
		daydreamId,
		{
			id: turnId,
			parentId,
			role,
			content: {
				vaultId: await ensureTestSelfVault(db, ownerId),
				ciphertext: fakeSealed('turn'),
				payloadVersion: 2
			}
		},
		nextFixtureTime()
	);
	if (!appended.ok) {
		throw new Error(`appendTestTurn: ${appended.reason}`);
	}
	return turnId;
}

export async function readDaydreamRow(db: Db, id: string) {
	return await db.query.daydreams.findFirst({ where: eq(daydreams.id, id) });
}

export async function readDaydreamTurnRows(db: Db, daydreamId: string) {
	return await db.query.daydreamTurns.findMany({
		where: eq(daydreamTurns.daydreamId, daydreamId),
		orderBy: (turn, { asc }) => [asc(turn.position), asc(turn.id)]
	});
}
