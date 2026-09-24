import { and, eq, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { KeyWrapParams, KeyWrapType } from '../encryption';
import type { KeyWrapView, PartnerRecipientsView, UnlockBundleView } from '../types';
import type { Db } from './db';
import { partnerships, passkey, userKeys, userKeyWraps } from './db/schema';

/**
 * Every database access for encryption keys.
 *
 * The whole file handles opaque strings. It stores a public recipient, a wrap
 * type, a JSON parameter blob, and a ciphertext, and decides nothing based on
 * them — the one field it reads is a passkey wrap's `credentialId`, which is
 * public and only ties the wrap to its passkey row. Everything that understands those
 * values lives in `src/lib/crypto/`, which is browser-only and must never be
 * imported from here (see AGENTS.md).
 *
 * Kept out of the route files because the same reads are needed from the
 * unlock endpoint, the Security page, the partner page, the messaging board
 * and a partner-assisted sign-in.
 */

/** Only what a screen or the unlock flow needs. D1 bills on bytes read. */
const wrapColumns = {
	id: userKeyWraps.id,
	type: userKeyWraps.type,
	params: userKeyWraps.params,
	blob: userKeyWraps.blob,
	label: userKeyWraps.label,
	createdAt: userKeyWraps.createdAt
} as const;

export type NewWrapInput = {
	type: KeyWrapType;
	params: KeyWrapParams;
	blob: string;
	label?: string | null;
};

/**
 * Records a user's public recipient and their first wrap, together.
 *
 * One `db.batch()` and not two awaits: a recipient with no wrap is the one
 * genuinely dangerous half-state in this feature, because the obvious recovery
 * from it — generate a fresh identity — would silently orphan every message the
 * user had ever received. `db.transaction()` is not an option (invariant 3).
 *
 * Throws on a second call for the same user: `user_keys.user_id` is unique, and
 * that is deliberate. Overwriting a recipient is how history gets lost, so the
 * one place that does it is a partner-assisted sign-in (`server/recovery.ts`).
 */
export async function putUserKeys(
	db: Db,
	userId: string,
	input: { recipient: string; wrap: NewWrapInput }
): Promise<void> {
	await db.batch([
		db.insert(userKeys).values({ userId, recipient: input.recipient }),
		db.insert(userKeyWraps).values({
			userId,
			type: input.wrap.type,
			params: input.wrap.params,
			blob: input.wrap.blob,
			label: input.wrap.label ?? null
		})
	]);
}

/** A user's own recipient, or null for an account with no keys, which is a bug. */
export async function getUserRecipient(db: Db, userId: string): Promise<string | null> {
	const rows = await db
		.select({ recipient: userKeys.recipient })
		.from(userKeys)
		.where(eq(userKeys.userId, userId))
		.limit(1);
	return rows[0]?.recipient ?? null;
}

/** Every wrap for this user, newest last, for the unlock loop to try in turn. */
export async function listWrapsForUser(db: Db, userId: string): Promise<KeyWrapView[]> {
	return await db
		.select(wrapColumns)
		.from(userKeyWraps)
		.where(eq(userKeyWraps.userId, userId))
		.orderBy(userKeyWraps.createdAt, userKeyWraps.id);
}

/**
 * Everything a cold device needs to unlock, in one read.
 *
 * Returned from its own endpoint rather than from the app shell's layout load:
 * in the layout it would add a D1 read and a few hundred bytes of ciphertext to
 * *every* page in the app, for something needed once per lock.
 */
export async function getUnlockBundle(db: Db, userId: string): Promise<UnlockBundleView | null> {
	const [recipient, wraps] = await Promise.all([
		getUserRecipient(db, userId),
		listWrapsForUser(db, userId)
	]);
	// Every account is created with keys, so this is null only for data that is
	// already broken. The endpoint turns it into an error rather than a state
	// for the screens to render.
	return recipient ? { recipient, wraps } : null;
}

/**
 * Stores the wrap a new passkey was sealed to.
 *
 * Checked against the passkey row, scoped to its owner, in the same read: the
 * passkey must be this user's, and the wrap must name that passkey's own
 * credential — which is what sign-in matches on, and what deleting the passkey
 * later finds the wrap by. A wrap naming some other credential would be one
 * nothing could ever open or clean up.
 */
export async function addPasskeyWrap(
	db: Db,
	userId: string,
	input: { passkeyId: string; wrap: NewWrapInput }
): Promise<boolean> {
	const { params } = input.wrap;
	if (params.type === 'password') {
		return false;
	}
	const owned = await db
		.select({ id: passkey.id })
		.from(passkey)
		.where(
			and(
				eq(passkey.id, input.passkeyId),
				eq(passkey.userId, userId),
				eq(passkey.credentialID, params.credentialId)
			)
		)
		.limit(1);
	if (owned.length === 0) {
		return false;
	}
	await addWrap(db, userId, input.wrap);
	return true;
}

/**
 * Deletes a passkey and the wrap sealed to it, together.
 *
 * One `db.batch()`: the wrap is useless without the credential, and a stale
 * wrap left behind would still be handed to every device that fetches the
 * bundle. Scoped to the owner in the statements themselves.
 */
export async function deletePasskeyWithWrap(
	db: Db,
	userId: string,
	passkeyId: string
): Promise<boolean> {
	const rows = await db
		.select({ credentialId: passkey.credentialID })
		.from(passkey)
		.where(and(eq(passkey.id, passkeyId), eq(passkey.userId, userId)))
		.limit(1);
	const [row] = rows;
	if (!row) {
		return false;
	}
	await db.batch([
		db
			.delete(userKeyWraps)
			.where(
				and(
					eq(userKeyWraps.userId, userId),
					ne(userKeyWraps.type, 'password'),
					sql`json_extract(${userKeyWraps.params}, '$.credentialId') = ${row.credentialId}`
				)
			),
		db.delete(passkey).where(and(eq(passkey.id, passkeyId), eq(passkey.userId, userId)))
	]);
	return true;
}

/** Adds another way to unlock: a re-wrap under a new password, or a passkey. */
export async function addWrap(db: Db, userId: string, input: NewWrapInput): Promise<string> {
	const [row] = await db
		.insert(userKeyWraps)
		.values({
			userId,
			type: input.type,
			params: input.params,
			blob: input.blob,
			label: input.label ?? null
		})
		.returning({ id: userKeyWraps.id });
	return row.id;
}

/**
 * Retires every password wrap except the one just written.
 *
 * The last step of a password change, and it runs only after the credential
 * itself has been changed. Ordering matters and is the reason the table has no
 * unique index on (user_id, type): if the process dies before this call, the
 * user has two password wraps of which exactly one opens under their current
 * password, and unlock tries each. If it died before the credential change, the
 * old one still opens. Neither order loses the identity.
 */
export async function deleteOtherPasswordWraps(
	db: Db,
	userId: string,
	keepId: string
): Promise<void> {
	await db
		.delete(userKeyWraps)
		.where(
			and(
				eq(userKeyWraps.userId, userId),
				eq(userKeyWraps.type, 'password'),
				ne(userKeyWraps.id, keepId)
			)
		);
}

/** Removes one wrap — a password change's new wrap, rolled back. Scoped to its owner. */
export async function deleteWrap(db: Db, id: string, userId: string): Promise<boolean> {
	const rows = await db
		.delete(userKeyWraps)
		.where(and(eq(userKeyWraps.id, id), eq(userKeyWraps.userId, userId)))
		.returning({ id: userKeyWraps.id });
	return rows.length > 0;
}

// Two aliases of the same table: a partnership row reaches `user_keys` twice,
// so an unaliased join would be ambiguous. Same shape as the `inviter_user` /
// `invitee_user` pair in `server/partnerships.ts`.
const inviterKeys = alias(userKeys, 'inviter_keys');
const inviteeKeys = alias(userKeys, 'invitee_keys');

/**
 * Both public recipients for one partnership, from the viewer's side.
 *
 * Returns null when the viewer is not a member, so a route can 404 on it —
 * consistent with the existing partner routes, where distinguishing 403 from
 * 404 would confirm the id is real. Inner joins: every account has keys, so a
 * partnership missing one is broken data, and 404s the same way.
 */
export async function getRecipientsForPartnership(
	db: Db,
	partnershipId: string,
	viewerId: string
): Promise<PartnerRecipientsView | null> {
	const rows = await db
		.select({
			inviterId: partnerships.inviterId,
			inviteeId: partnerships.inviteeId,
			inviterRecipient: inviterKeys.recipient,
			inviteeRecipient: inviteeKeys.recipient
		})
		.from(partnerships)
		.innerJoin(inviterKeys, eq(inviterKeys.userId, partnerships.inviterId))
		.innerJoin(inviteeKeys, eq(inviteeKeys.userId, partnerships.inviteeId))
		.where(and(eq(partnerships.id, partnershipId), eq(partnerships.status, 'accepted')))
		.limit(1);

	const [row] = rows;
	if (!row) {
		return null;
	}

	// Which recipient is "mine" flips with who is looking — the same trap as the
	// name columns (invariant 12), so it is resolved here and nowhere else.
	if (row.inviterId === viewerId) {
		return { mine: row.inviterRecipient, theirs: row.inviteeRecipient };
	}
	if (row.inviteeId === viewerId) {
		return { mine: row.inviteeRecipient, theirs: row.inviterRecipient };
	}
	return null;
}
