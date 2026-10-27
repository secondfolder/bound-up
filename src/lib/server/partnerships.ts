import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import {
	canEditPartnership,
	INVITE_TTL_MS,
	isInviteUsable,
	type PartnerNamesSource,
	type PartnershipControl,
	type PartnershipRecord,
	type PartnershipView,
	roleOf,
	viewPartnership
} from '../partnership';
import { partnershipInviteKind, partnershipNamesKind } from '../sealed-kinds/partnerships';
import type { PartnerView } from '../types';
import type { Db } from './db';
import { partnerships, user } from './db/schema';
import { partnershipVaultIdFor, sealedIsAcceptable } from './sealed-content';
import {
	createSharedSpace,
	deleteSpace,
	isSpaceMember,
	partnershipControl,
	spaceExists,
	syncSharedSpaceMembers
} from './spaces';

const BASE64_PADDING = /[=]+$/;

/**
 * Every database access for the partners feature.
 *
 * Kept out of the route files because the same reads are needed from the app
 * shell layout, the settings screens, Today and the invite page, and
 * because the two-foreign-keys-to-`user` join below is the kind of thing that
 * should exist exactly once.
 */

// Two aliases of the same table: a partnership row points at `user` twice, so
// an unaliased join would be ambiguous. See the note in schema/app.ts about why
// this is done with joins rather than drizzle's relational query API.
const inviterUser = alias(user, 'inviter_user');
const inviteeUser = alias(user, 'invitee_user');

/** Only the columns any partner screen needs. D1 bills on bytes read. */
const partnershipColumns = {
	id: partnerships.id,
	status: partnerships.status,
	inviterId: partnerships.inviterId,
	inviteeId: partnerships.inviteeId,
	// What the members' `can_manage` says, not the column; see `partnershipControl`.
	control: partnershipControl(),
	namesCiphertext: partnerships.namesCiphertext,
	namesVaultId: partnerships.namesVaultId,
	namesPayloadVersion: partnerships.namesPayloadVersion,
	namesRevision: partnerships.namesRevision,
	inviteCiphertext: partnerships.inviteCiphertext,
	invitePayloadVersion: partnerships.invitePayloadVersion,
	inviteKeyWrap: partnerships.inviteKeyWrap,
	inviteToken: partnerships.inviteToken,
	inviteExpiresAt: partnerships.inviteExpiresAt,
	createdAt: partnerships.createdAt,
	inviterImage: inviterUser.image,
	inviteeImage: inviteeUser.image,
	inviterTimezone: inviterUser.timezone,
	inviteeTimezone: inviteeUser.timezone
} as const;

type PartnershipRow = PartnershipRecord & {
	inviteToken: string | null;
	inviteExpiresAt: Date | null;
	createdAt: Date;
	inviterImage: string | null;
	inviteeImage: string | null;
	inviterTimezone: string;
	inviteeTimezone: string;
};

function baseQuery(db: Db) {
	return db
		.select(partnershipColumns)
		.from(partnerships)
		.leftJoin(inviterUser, eq(partnerships.inviterId, inviterUser.id))
		.leftJoin(inviteeUser, eq(partnerships.inviteeId, inviteeUser.id));
}

/**
 * Either side of the link. Used by every "my partnerships" read.
 *
 * Asked of the partnership's space, whose members are the inviter and, once
 * accepted, the invitee — the same people the row's two columns name.
 */
function memberOf(userId: string) {
	return isSpaceMember(partnerships.id, userId);
}

function toView(row: PartnershipRow, userId: string): PartnershipView {
	const role = roleOf(row, userId);
	const counterpartId = role === 'inviter' ? row.inviteeId : row.inviterId;
	const counterpartImage = role === 'inviter' ? row.inviteeImage : row.inviterImage;
	const counterpartTimezone = role === 'inviter' ? row.inviteeTimezone : row.inviterTimezone;
	return viewPartnership(
		row,
		userId,
		counterpartId
			? { userId: counterpartId, image: counterpartImage, timezone: counterpartTimezone }
			: null
	);
}

/**
 * The accepted partnerships to show as tabs in the bottom nav.
 *
 * Pending invites are excluded deliberately: until the other person accepts
 * there is nobody behind the tab, and a nav item that opens an empty page reads
 * as a bug. They are visible in settings instead.
 */
export async function listPartnersForNav(db: Db, userId: string): Promise<PartnerView[]> {
	const rows = (await baseQuery(db)
		.where(and(memberOf(userId), eq(partnerships.status, 'accepted')))
		.orderBy(partnerships.createdAt, partnerships.id)) as PartnershipRow[];

	return rows.map((row) => {
		const view = toView(row, userId);
		return { id: view.id, names: view.names, image: view.counterpart?.image ?? null };
	});
}

/** Everything for the settings list: accepted first-class, pending included. */
export async function listPartnershipsForUser(db: Db, userId: string): Promise<PartnershipView[]> {
	const rows = (await baseQuery(db)
		.where(memberOf(userId))
		.orderBy(desc(partnerships.createdAt), partnerships.id)) as PartnershipRow[];
	return rows.map((row) => toView(row, userId));
}

/** One partnership, but only if `userId` is actually in it. Null otherwise. */
export async function getPartnershipForUser(
	db: Db,
	id: string,
	userId: string
): Promise<
	(PartnershipView & { inviteToken: string | null; inviteExpiresAt: Date | null }) | null
> {
	const rows = (await baseQuery(db)
		.where(and(eq(partnerships.id, id), memberOf(userId)))
		.limit(1)) as PartnershipRow[];
	const [row] = rows;
	if (!row) {
		return null;
	}
	return {
		...toView(row, userId),
		inviteToken: row.inviteToken,
		inviteExpiresAt: row.inviteExpiresAt
	};
}

/**
 * Looks an invite up by the secret in its URL.
 *
 * Returns the raw-ish row rather than a view, because the caller is not
 * necessarily a member yet — `viewPartnership` would throw for them.
 */
export async function findPendingInviteByToken(
	db: Db,
	token: string
): Promise<
	| (PartnershipRecord & {
			inviteToken: string | null;
			inviteExpiresAt: Date | null;
			inviterImage: string | null;
	  })
	| null
> {
	const rows = (await baseQuery(db)
		.where(eq(partnerships.inviteToken, token))
		.limit(1)) as PartnershipRow[];
	const [row] = rows;
	if (!row) {
		return null;
	}
	return row;
}

/**
 * 32 bytes of CSPRNG as URL-safe base64.
 *
 * `crypto.getRandomValues` rather than `randomUUID`: a UUIDv4 carries only 122
 * bits and has a recognisable shape, and this value is the entire authorisation
 * to join someone's account graph.
 */
export function generateInviteToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	let binary = '';
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(BASE64_PADDING, '');
}

/**
 * The invite as it is posted: sealed under the invite key, which the server
 * never sees (it travels in the link's fragment), with that key wrapped to
 * the inviter's own recipient so their devices can open it again.
 */
export type SealedInvite = { ciphertext: string; payloadVersion: number; keyWrap: string };

/** An age-encrypted blob, base64: what `wrapVaultKey` produces. Shape only. */
const KEY_WRAP = /^[A-Za-z0-9+/]+={0,2}$/;

function inviteIsAcceptable(invite: { ciphertext: string; payloadVersion: number }): boolean {
	return sealedIsAcceptable(partnershipInviteKind, invite.ciphertext, invite.payloadVersion);
}

export type CreateInviteInput = {
	/** Chosen by the inviter's browser: the invite is sealed to it. */
	id: string;
	inviterId: string;
	control: PartnershipControl;
	invite: SealedInvite;
};

/** Creates the pending row and returns it with its fresh token. The names are in `invite`, sealed. */
export async function createInvite(
	db: Db,
	input: CreateInviteInput,
	now: Date = new Date()
): Promise<
	| { ok: true; id: string; inviteToken: string; inviteExpiresAt: Date }
	| { ok: false; reason: 'bad-invite' | 'id-taken' }
> {
	if (!(inviteIsAcceptable(input.invite) && KEY_WRAP.test(input.invite.keyWrap))) {
		return { ok: false, reason: 'bad-invite' };
	}
	const inviteToken = generateInviteToken();
	const inviteExpiresAt = new Date(now.getTime() + INVITE_TTL_MS);
	// The partnership and its space in one batch, under the id the browser
	// chose. Any clash — with a partnership or with any space — fails the lot,
	// and is told apart from a real failure by looking, as `createVault` does.
	const [spaceInsert, memberInsert] = createSharedSpace(db, {
		id: input.id,
		inviterId: input.inviterId,
		control: input.control
	});
	try {
		await db.batch([
			spaceInsert,
			db.insert(partnerships).values({
				id: input.id,
				inviterId: input.inviterId,
				status: 'pending',
				control: input.control,
				inviteToken,
				inviteExpiresAt,
				inviteCiphertext: input.invite.ciphertext,
				invitePayloadVersion: input.invite.payloadVersion,
				inviteKeyWrap: input.invite.keyWrap
			}),
			...(memberInsert ? [memberInsert] : [])
		]);
	} catch (error) {
		if (await spaceExists(db, input.id)) {
			return { ok: false, reason: 'id-taken' };
		}
		throw error;
	}
	return { ok: true, id: input.id, inviteToken, inviteExpiresAt };
}

/**
 * Issues a new token for a pending invite, invalidating the previous link.
 *
 * Offered rather than done automatically on every re-copy: rotating silently
 * would break a link the inviter had already sent. The invite is sealed again
 * under a new invite key at the same time, so the old link fails on both
 * halves.
 */
export async function rotateInviteToken(
	db: Db,
	id: string,
	inviterId: string,
	invite: SealedInvite,
	now: Date = new Date()
): Promise<{ inviteToken: string; inviteExpiresAt: Date } | null> {
	if (!(inviteIsAcceptable(invite) && KEY_WRAP.test(invite.keyWrap))) {
		return null;
	}
	const inviteToken = generateInviteToken();
	const inviteExpiresAt = new Date(now.getTime() + INVITE_TTL_MS);
	const rows = await db
		.update(partnerships)
		.set({
			inviteToken,
			inviteExpiresAt,
			inviteCiphertext: invite.ciphertext,
			invitePayloadVersion: invite.payloadVersion,
			inviteKeyWrap: invite.keyWrap
		})
		.where(
			and(
				eq(partnerships.id, id),
				eq(partnerships.inviterId, inviterId),
				eq(partnerships.status, 'pending')
			)
		)
		.returning({ id: partnerships.id });

	return rows.length > 0 ? { inviteToken, inviteExpiresAt } : null;
}

export type AcceptInviteInput = {
	token: string;
	inviteeId: string;
	/**
	 * The names as the accepter left them, sealed again under the same invite
	 * key, and the control answer. Only honoured when the accepter is allowed
	 * to edit; see the action.
	 */
	invite?: { ciphertext: string; payloadVersion: number };
	control?: PartnershipControl;
};

export type AcceptInviteResult =
	| { ok: true; id: string }
	| { ok: false; reason: 'not-found' | 'expired' | 'self' | 'already-linked' | 'bad-invite' };

/**
 * Consumes an invite.
 *
 * The token is matched again inside the UPDATE's WHERE rather than trusted from
 * the earlier read, so two accepts racing on the same link cannot both win: the
 * first clears `invite_token` and the second matches no rows.
 *
 * The sealed invite stays on the row: there is no partnership vault yet, and
 * the accepter's browser may not even have its keys open on this page. The
 * device of a member who holds control moves the names into the vault once it
 * has one (`moveInviteNamesIntoVault`), and clears the invite then.
 */
export async function acceptInvite(
	db: Db,
	input: AcceptInviteInput,
	now: Date = new Date()
): Promise<AcceptInviteResult> {
	const existing = await findPendingInviteByToken(db, input.token);
	if (!existing) {
		return { ok: false, reason: 'not-found' };
	}
	// An invite with no sealed names has nothing a link could open.
	if (!isInviteUsable(existing, now) || existing.inviteCiphertext === null) {
		return { ok: false, reason: existing.status === 'accepted' ? 'not-found' : 'expired' };
	}
	if (existing.inviterId === input.inviteeId) {
		return { ok: false, reason: 'self' };
	}
	if (input.invite && !inviteIsAcceptable(input.invite)) {
		return { ok: false, reason: 'bad-invite' };
	}

	if (await partnershipExistsBetween(db, existing.inviterId, input.inviteeId)) {
		return { ok: false, reason: 'already-linked' };
	}

	// The accepter may only rewrite the names when control is theirs or shared.
	// Checked here as well as in the action so the rule cannot be bypassed by a
	// future caller that forgets. What the server cannot check is what the
	// re-sealed names say — only that this accepter may write them at all.
	const accepterMayEdit = canEditPartnership(
		{ ...existing, inviteeId: input.inviteeId },
		input.inviteeId
	);

	const [rows] = await db.batch([
		db
			.update(partnerships)
			.set({
				inviteeId: input.inviteeId,
				status: 'accepted',
				acceptedAt: now,
				// Clearing the token both consumes the link and releases the unique
				// index, so the same inviter can send another invite later.
				inviteToken: null,
				inviteExpiresAt: null,
				...(accepterMayEdit
					? {
							control: input.control ?? existing.control,
							...(input.invite
								? {
										inviteCiphertext: input.invite.ciphertext,
										invitePayloadVersion: input.invite.payloadVersion
									}
								: {})
						}
					: {})
			})
			.where(and(eq(partnerships.inviteToken, input.token), eq(partnerships.status, 'pending')))
			.returning({ id: partnerships.id }),
		// The invitee joins the space in the same batch, and only if the
		// update above is what made them the invitee.
		...syncSharedSpaceMembers(db, existing.id)
	]);

	const [row] = rows;
	if (!row) {
		return { ok: false, reason: 'not-found' };
	}
	return { ok: true, id: row.id };
}

/** True when these two are already linked, in either direction. */
export async function partnershipExistsBetween(db: Db, a: string, b: string): Promise<boolean> {
	const rows = await db
		.select({ id: partnerships.id })
		.from(partnerships)
		.where(
			and(
				eq(partnerships.status, 'accepted'),
				or(
					and(eq(partnerships.inviterId, a), eq(partnerships.inviteeId, b)),
					and(eq(partnerships.inviterId, b), eq(partnerships.inviteeId, a))
				)
			)
		)
		.limit(1);
	return rows.length > 0;
}

export type UpdatePartnershipInput = {
	control: PartnershipControl;
	/**
	 * The names, sealed in the partnership's vault, and the revision the editor
	 * opened. Absent on a pending invite, which has no vault: its names change
	 * by sealing a new invite (`rotateInviteToken`).
	 */
	names?: { vaultId: string; ciphertext: string; payloadVersion: number; expectedRevision: number };
	/** A pending invite's names, sealed again under its invite key by the inviter. */
	invite?: { ciphertext: string; payloadVersion: number };
};

export type UpdatePartnershipResult =
	| { ok: true }
	| { ok: false; reason: 'forbidden' | 'bad-names' | 'conflict' };

/**
 * Applies an edit, re-checking the permission against the stored row.
 *
 * Refused when the viewer is not a member or does not hold control — the page
 * hides the form in that case, but the action must not rely on that. The
 * names are compare-and-swap on their revision, so one member's edit cannot
 * silently replace the other's: the server cannot merge what it cannot read.
 */
export async function updatePartnership(
	db: Db,
	id: string,
	userId: string,
	input: UpdatePartnershipInput
): Promise<UpdatePartnershipResult> {
	const current = await getPartnershipForUser(db, id, userId);
	if (!current?.canEdit) {
		return { ok: false, reason: 'forbidden' };
	}
	const { names, invite } = input;
	if (invite) {
		// Only the inviter holds the invite key, and only while it is an invite.
		if (current.status !== 'pending' || current.role !== 'inviter' || !inviteIsAcceptable(invite)) {
			return { ok: false, reason: 'bad-names' };
		}
		await db.batch([
			db
				.update(partnerships)
				.set({
					control: input.control,
					inviteCiphertext: invite.ciphertext,
					invitePayloadVersion: invite.payloadVersion
				})
				.where(and(eq(partnerships.id, id), eq(partnerships.status, 'pending'))),
			...syncSharedSpaceMembers(db, id)
		]);
		return { ok: true };
	}
	if (!names) {
		await db.batch([
			db.update(partnerships).set({ control: input.control }).where(eq(partnerships.id, id)),
			...syncSharedSpaceMembers(db, id)
		]);
		return { ok: true };
	}
	if (
		current.status !== 'accepted' ||
		names.vaultId !== (await partnershipVaultIdFor(db, id)) ||
		!sealedIsAcceptable(partnershipNamesKind, names.ciphertext, names.payloadVersion)
	) {
		return { ok: false, reason: 'bad-names' };
	}
	const [rows] = await db.batch([
		db
			.update(partnerships)
			.set({
				control: input.control,
				namesCiphertext: names.ciphertext,
				namesVaultId: names.vaultId,
				namesPayloadVersion: names.payloadVersion,
				namesRevision: names.expectedRevision + 1,
				// If the names were still under the invite's key, they are in the
				// vault now, and the invite has nothing left to open.
				inviteCiphertext: null,
				invitePayloadVersion: null,
				inviteKeyWrap: null
			})
			.where(and(eq(partnerships.id, id), eq(partnerships.namesRevision, names.expectedRevision)))
			.returning({ id: partnerships.id }),
		// A lost compare-and-swap left `control` as it was, so this then changes nothing.
		...syncSharedSpaceMembers(db, id)
	]);
	return rows.length > 0 ? { ok: true } : { ok: false, reason: 'conflict' };
}

/**
 * Where a member who holds control can read a partnership's names from while
 * they are still under the accepted invite's key, for their device to move
 * them into the vault (`invite-names.ts`). `{ names: null }` when there is
 * nothing to move — they are in the vault already, the link is still pending,
 * or the viewer may not write them. Null when the viewer is not a member.
 *
 * Only for a member who holds control, because moving the names is writing
 * them: the server cannot compare the sealed copy with the invite, so a
 * read-only member allowed to move them could rewrite them (invariant 14).
 */
export async function inviteNamesToMove(
	db: Db,
	id: string,
	userId: string
): Promise<{ names: PartnerNamesSource | null } | null> {
	const current = await getPartnershipForUser(db, id, userId);
	if (!current) {
		return null;
	}
	const movable =
		current.canEdit &&
		current.status === 'accepted' &&
		current.names.sealed === null &&
		current.names.invite !== null;
	return { names: movable ? current.names : null };
}

export type MoveInviteNamesResult =
	| { ok: true; moved: boolean }
	| { ok: false; reason: 'forbidden' | 'bad-names' };

/**
 * Stores a partnership's names, sealed in its vault by a device that opened
 * them from the accepted invite, and clears the invite in the same write.
 *
 * Once only: the update matches a row whose names are not in the vault yet,
 * so two devices moving them at once write them at most once between them,
 * and this can never stand in for an edit, which is compare-and-swap on the
 * revision (`updatePartnership`). `moved` is false when the other got there
 * first. `control` is re-read from the stored row, as for any write of the
 * names.
 */
export async function moveInviteNamesIntoVault(
	db: Db,
	id: string,
	userId: string,
	names: { vaultId: string; ciphertext: string; payloadVersion: number }
): Promise<MoveInviteNamesResult> {
	const current = await getPartnershipForUser(db, id, userId);
	if (!current?.canEdit) {
		return { ok: false, reason: 'forbidden' };
	}
	if (
		current.status !== 'accepted' ||
		names.vaultId !== (await partnershipVaultIdFor(db, id)) ||
		!sealedIsAcceptable(partnershipNamesKind, names.ciphertext, names.payloadVersion)
	) {
		return { ok: false, reason: 'bad-names' };
	}
	const rows = await db
		.update(partnerships)
		.set({
			namesCiphertext: names.ciphertext,
			namesVaultId: names.vaultId,
			namesPayloadVersion: names.payloadVersion,
			namesRevision: sql`${partnerships.namesRevision} + 1`,
			inviteCiphertext: null,
			invitePayloadVersion: null,
			inviteKeyWrap: null
		})
		.where(
			and(
				eq(partnerships.id, id),
				eq(partnerships.status, 'accepted'),
				isNull(partnerships.namesCiphertext)
			)
		)
		.returning({ id: partnerships.id });
	return { ok: true, moved: rows.length > 0 };
}

/**
 * Removes a link (or cancels a pending invite), and with it the shared space
 * and everything in it (`deleteSpace`).
 *
 * Deliberately not gated on `control`: a user who handed control to their
 * partner must still be able to leave. Membership is the only requirement.
 */
export async function deletePartnership(db: Db, id: string, userId: string): Promise<boolean> {
	const [member] = await db
		.select({ id: partnerships.id })
		.from(partnerships)
		.where(and(eq(partnerships.id, id), memberOf(userId)))
		.limit(1);
	if (!member) {
		return false;
	}
	await deleteSpace(db, id);
	return true;
}
