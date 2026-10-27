/**
 * The partnership domain rules, shared by server code and components.
 *
 * Deliberately alias-free (relative imports only) for the same reason as
 * `src/lib/types.ts`: the Drizzle schema imports the two union types from here
 * and drizzle-kit loads the schema outside Vite, where `$lib` does not resolve.
 *
 * Nothing in here touches the database. The permission questions ("may this
 * viewer edit?") are pure functions of a row plus a viewer id so that they can
 * be answered identically on the server, where they are enforced, and in a
 * component, where they only decide what to render.
 */

import { managesSpace, type SpaceMember } from './spaces';

/**
 * Who an invite offers control to, once accepted: stored against the
 * permanent roles as `partnerships.control`.
 *
 * Only the invite's offer. Once a partnership is accepted, who manages it is
 * each member's `space_members.can_manage`, and every rule reads that
 * (docs/partners.md, "Control"); the column is read only while the invite is
 * pending and at the moment it is accepted.
 */
export type PartnershipControl = 'inviter' | 'invitee' | 'both';

export type PartnershipStatus = 'pending' | 'accepted';

/** The half of the "who's in control?" answer the asker picks, from their side. */
export type ControlAnswer = 'me' | 'them' | 'mix';

/** Either end of a link. Stable for the life of the row — see schema/app.ts. */
export type PartnershipRole = 'inviter' | 'invitee';

/**
 * The four names and roles, stored per *role*: `inviterName` is what the
 * invitee calls the inviter, and so on. Which of them is "theirs" flips with
 * who is looking, so nothing reads them except through `namesForViewer`.
 */
export type StoredNames = {
	inviterName: string;
	inviteeName: string;
	inviterRole: string | null;
	inviteeRole: string | null;
};

/** The names as one member sees them. */
export type ViewerNames = {
	/** What the viewer calls the other person. */
	partnerName: string;
	/** What the other person calls the viewer. */
	yourName: string;
	/** The other person's role in the connection. Optional. */
	partnerRole: string | null;
	/** The viewer's role in the connection. Optional. */
	yourRole: string | null;
};

/**
 * Where a partnership's names can be read from, for one viewer.
 *
 * The names are end-to-end encrypted (docs/partners.md, "Names are sealed"),
 * so the server hands this over and the browser opens it
 * (`partner-names.svelte.ts`). At most one of the two is set:
 *
 * - `sealed` — sealed in the partnership's vault: where they live for good.
 * - `invite` — sealed under the invite key, before a member's device has moved
 *   them into the vault. `keyWrap` is the key wrapped to the inviter, and is
 *   only ever handed to the inviter; the invitee keeps the key from the link.
 */
export type PartnerNamesSource = {
	partnershipId: string;
	/** The viewer's end of the link: which stored name is whose. */
	role: PartnershipRole;
	sealed: { vaultId: string; ciphertext: string; payloadVersion: number; revision: number } | null;
	invite: { ciphertext: string; payloadVersion: number; keyWrap: string | null } | null;
};

/** The stored columns `viewPartnership` needs. A subset of the Drizzle row. */
export type PartnershipRecord = {
	id: string;
	status: PartnershipStatus;
	inviterId: string;
	inviteeId: string | null;
	/** The invite's offer; see `PartnershipControl`. Not a permission once accepted. */
	control: PartnershipControl;
	/** The partnership's space's members and who manages it: what every permission reads. */
	members: SpaceMember[];
	namesCiphertext: string | null;
	namesVaultId: string | null;
	namesPayloadVersion: number | null;
	namesRevision: number;
	inviteCiphertext: string | null;
	invitePayloadVersion: number | null;
	inviteKeyWrap: string | null;
};

/** The other person in the link, as much of them as a screen may show. */
export type PartnershipCounterpart = {
	/** The counterpart's *user* id. Not the partnership id. */
	userId: string;
	image: string | null;
	timezone: string;
};

/**
 * One partnership as seen by one of its two members.
 *
 * `id` is the partnership id, not a user id: it is what
 * `/settings/partners/[id]` and the partnership's space are keyed on, so that a link can be addressed
 * before the second user exists and so that neither member's user id is ever
 * put in a URL.
 *
 * The names are not here: the server cannot read them. `names` says where the
 * viewer's browser can.
 */
export type PartnershipView = {
	id: string;
	status: PartnershipStatus;
	role: PartnershipRole;
	/** Who manages the partnership's space: the inviter alone while it is an invite. */
	members: SpaceMember[];
	/** What a pending invite offers once accepted; null once it has been. */
	offer: PartnershipControl | null;
	names: PartnerNamesSource;
	/** Null while the invite is still pending — there is no other person yet. */
	counterpart: PartnershipCounterpart | null;
	/** May the viewer change names, label and control? */
	canEdit: boolean;
};

/** Which end of the link `userId` is on, or null if they are on neither. */
export function roleOf(
	record: Pick<PartnershipRecord, 'inviterId' | 'inviteeId'>,
	userId: string
): PartnershipRole | null {
	if (record.inviterId === userId) {
		return 'inviter';
	}
	if (record.inviteeId === userId) {
		return 'invitee';
	}
	return null;
}

/**
 * True when `userId` may edit the shared settings: they manage the
 * partnership's space (`can_manage`). A pending invite's only member is its
 * inviter, who manages it when the offer keeps control with them.
 *
 * Note this is NOT the rule for disconnecting: leaving a link is never gated,
 * or a user handed control away could not get out. See `canDisconnect`.
 */
export function canEditPartnership(
	record: Pick<PartnershipRecord, 'members'>,
	userId: string
): boolean {
	return managesSpace({ kind: 'shared', members: record.members }, userId);
}

/**
 * Whether an invite's offer gives `role` control once it is accepted. The
 * invite's own rule, for before there is a member to ask: what the invitee
 * may change while accepting, and who manages the space the moment they do.
 */
export function offerGives(control: PartnershipControl, role: PartnershipRole): boolean {
	return control === 'both' || control === role;
}

/** Either member may always disconnect, whoever holds control. */
export function canDisconnect(record: PartnershipRecord, userId: string): boolean {
	return roleOf(record, userId) !== null;
}

/**
 * The names as `role` sees them. The one place the per-role mapping lives:
 * which stored name is "theirs" flips with the viewer, and getting that
 * backwards is the easiest bug in the feature.
 */
export function namesForViewer(names: StoredNames, role: PartnershipRole): ViewerNames {
	const viewerIsInviter = role === 'inviter';
	return {
		partnerName: viewerIsInviter ? names.inviteeName : names.inviterName,
		yourName: viewerIsInviter ? names.inviterName : names.inviteeName,
		partnerRole: viewerIsInviter ? names.inviteeRole : names.inviterRole,
		yourRole: viewerIsInviter ? names.inviterRole : names.inviteeRole
	};
}

/** The inverse: what `role` typed, as it is stored. */
export function storedNamesFrom(names: ViewerNames, role: PartnershipRole): StoredNames {
	const viewerIsInviter = role === 'inviter';
	return {
		inviterName: viewerIsInviter ? names.yourName : names.partnerName,
		inviteeName: viewerIsInviter ? names.partnerName : names.yourName,
		inviterRole: viewerIsInviter ? names.yourRole : names.partnerRole,
		inviteeRole: viewerIsInviter ? names.partnerRole : names.yourRole
	};
}

/** Where `role` can read the names of `record` from. See `PartnerNamesSource`. */
export function namesSourceFor(
	record: PartnershipRecord,
	role: PartnershipRole
): PartnerNamesSource {
	const sealed =
		record.namesCiphertext !== null &&
		record.namesVaultId !== null &&
		record.namesPayloadVersion !== null
			? {
					vaultId: record.namesVaultId,
					ciphertext: record.namesCiphertext,
					payloadVersion: record.namesPayloadVersion,
					revision: record.namesRevision
				}
			: null;
	const invite =
		sealed === null && record.inviteCiphertext !== null && record.invitePayloadVersion !== null
			? {
					ciphertext: record.inviteCiphertext,
					payloadVersion: record.invitePayloadVersion,
					keyWrap: role === 'inviter' ? record.inviteKeyWrap : null
				}
			: null;
	return { partnershipId: record.id, role, sealed, invite };
}

/** Turns a row plus a viewer into the shape every partner screen renders from. */
export function viewPartnership(
	record: PartnershipRecord,
	userId: string,
	counterpart: PartnershipCounterpart | null = null
): PartnershipView {
	const role = roleOf(record, userId);
	if (!role) {
		throw new Error(`User ${userId} is not a member of partnership ${record.id}`);
	}
	return {
		id: record.id,
		status: record.status,
		role,
		members: record.members,
		offer: record.status === 'pending' ? record.control : null,
		names: namesSourceFor(record, role),
		counterpart,
		canEdit: canEditPartnership(record, userId)
	};
}

/**
 * Maps the "who's in control?" answer onto storage.
 *
 * The question is asked from the answerer's side ("me"/"them"), but `control`
 * is stored against the permanent inviter/invitee roles so the row reads the
 * same from both ends.
 */
export function controlFromAnswer(
	answer: ControlAnswer,
	answerRole: PartnershipRole
): PartnershipControl {
	if (answer === 'mix') {
		return 'both';
	}
	const otherRole: PartnershipRole = answerRole === 'inviter' ? 'invitee' : 'inviter';
	return answer === 'me' ? answerRole : otherRole;
}

/**
 * The "who's in control?" answer as `viewerId` would give it now, for
 * pre-filling a form: from the offer while it is an invite, and from who
 * manages the space once it is not.
 */
export function controlAnswerFor(
	view: Pick<PartnershipView, 'offer' | 'members' | 'role'>,
	viewerId: string
): ControlAnswer {
	if (view.offer !== null) {
		return answerFromControl(view.offer, view.role);
	}
	const viewerManages = view.members.some(
		(member) => member.userId === viewerId && member.canManage
	);
	const othersManage = view.members.some(
		(member) => member.userId !== viewerId && member.canManage
	);
	if (viewerManages && othersManage) {
		return 'mix';
	}
	return viewerManages ? 'me' : 'them';
}

/** The inverse of `controlFromAnswer`, for an invite's offer. */
export function answerFromControl(
	control: PartnershipControl,
	answerRole: PartnershipRole
): ControlAnswer {
	if (control === 'both') {
		return 'mix';
	}
	return control === answerRole ? 'me' : 'them';
}

/** How long a fresh invite link stays usable. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** True when a pending invite is still within its window. */
export function isInviteUsable(
	record: Pick<PartnershipRecord, 'status'> & {
		inviteToken: string | null;
		inviteExpiresAt: Date | null;
	},
	now: Date = new Date()
): boolean {
	if (record.status !== 'pending') {
		return false;
	}
	if (!record.inviteToken) {
		return false;
	}
	if (!record.inviteExpiresAt) {
		return false;
	}
	return record.inviteExpiresAt.getTime() > now.getTime();
}
