import { and, desc, eq, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import {
	canEditPartnership,
	INVITE_TTL_MS,
	isInviteUsable,
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

const BASE64_PADDING = /[=]+$/;

/**
 * Every database access for the partners feature.
 *
 * Kept out of the route files because the same reads are needed from the app
 * shell layout, the settings screens, the partner page and the invite page, and
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
	inviterName: partnerships.inviterName,
	inviteeName: partnerships.inviteeName,
	inviterRole: partnerships.inviterRole,
	inviteeRole: partnerships.inviteeRole,
	control: partnerships.control,
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

/** Either side of the link. Used by every "my partnerships" read. */
function memberOf(userId: string) {
	return or(eq(partnerships.inviterId, userId), eq(partnerships.inviteeId, userId));
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

/**
 * Creates the pending row and returns it with its fresh token. The names are
 * in `invite`, sealed; the name columns are left empty.
 */
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
	const rows = await db
		.insert(partnerships)
		.values({
			id: input.id,
			inviterId: input.inviterId,
			status: 'pending',
			inviterName: '',
			inviteeName: '',
			control: input.control,
			inviteToken,
			inviteExpiresAt,
			inviteCiphertext: input.invite.ciphertext,
			invitePayloadVersion: input.invite.payloadVersion,
			inviteKeyWrap: input.invite.keyWrap
		})
		.onConflictDoNothing()
		.returning({ id: partnerships.id });
	const [row] = rows;
	if (!row) {
		return { ok: false, reason: 'id-taken' };
	}
	return { ok: true, id: row.id, inviteToken, inviteExpiresAt };
}

/**
 * Issues a new token for a pending invite, invalidating the previous link.
 *
 * Offered rather than done automatically on every re-copy: rotating silently
 * would break a link the inviter had already sent. The invite is sealed again
 * under a new invite key at the same time, so the old link fails on both
 * halves — and an invite from before names were sealed, which has no key at
 * all, gets one, its plaintext names cleared.
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
			inviteKeyWrap: invite.keyWrap,
			inviterName: '',
			inviteeName: '',
			inviterRole: null,
			inviteeRole: null
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
 * the accepter's browser may not even have its keys open on this page. A
 * member's device moves the names into the vault once it has one
 * (`content-sealing.ts`), and clears the invite then.
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
	// An invite from before names were sealed has no invite key, so no link to
	// it can carry one: it is offered again as a new link instead.
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

	const rows = await db
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
		.returning({ id: partnerships.id });

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
		await db
			.update(partnerships)
			.set({
				control: input.control,
				inviteCiphertext: invite.ciphertext,
				invitePayloadVersion: invite.payloadVersion
			})
			.where(and(eq(partnerships.id, id), eq(partnerships.status, 'pending')));
		return { ok: true };
	}
	if (!names) {
		await db.update(partnerships).set({ control: input.control }).where(eq(partnerships.id, id));
		return { ok: true };
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
			control: input.control,
			namesCiphertext: names.ciphertext,
			namesVaultId: names.vaultId,
			namesPayloadVersion: names.payloadVersion,
			namesRevision: names.expectedRevision + 1,
			// Whatever the names were held in before, they are in the vault now.
			inviterName: '',
			inviteeName: '',
			inviterRole: null,
			inviteeRole: null,
			inviteCiphertext: null,
			invitePayloadVersion: null,
			inviteKeyWrap: null
		})
		.where(and(eq(partnerships.id, id), eq(partnerships.namesRevision, names.expectedRevision)))
		.returning({ id: partnerships.id });
	return rows.length > 0 ? { ok: true } : { ok: false, reason: 'conflict' };
}

/**
 * Removes a link (or cancels a pending invite).
 *
 * Deliberately not gated on `control`: a user who handed control to their
 * partner must still be able to leave. Membership is the only requirement.
 */
export async function deletePartnership(db: Db, id: string, userId: string): Promise<boolean> {
	const rows = await db
		.delete(partnerships)
		.where(and(eq(partnerships.id, id), memberOf(userId)))
		.returning({ id: partnerships.id });
	return rows.length > 0;
}
