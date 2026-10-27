/**
 * Spaces: the pure half. See docs/spaces.md.
 *
 * A space is where scoped data lives. Every account has one solo space, and
 * every partnership is one shared space, whose id is the partnership's own.
 * Who may read and write a space is who its members are, and who may manage
 * it is a flag per member, `can_manage` — never "the other one of two", so
 * nothing here has to change for a space with more than two members.
 *
 * Alias-free (relative imports only), like `partnership.ts`: the Drizzle
 * schema imports `SpaceKind` from here, and drizzle-kit loads the schema
 * outside Vite. Nothing in here touches the database; the queries are in
 * `server/spaces.ts`.
 */

import type { PartnershipControl } from './partnership';

/** A person's own space, or one shared with others. */
export type SpaceKind = 'solo' | 'shared';

/** One member of a space, as far as the permission rules care. */
export type SpaceMember = { userId: string; canManage: boolean };

/** A space as a viewer who is in it sees it: which space, and what they may do there. */
export type SpaceMembership = {
	spaceId: string;
	kind: SpaceKind;
	/** May the viewer set tasks and rewards, change the space's settings and its members' credits? */
	canManage: boolean;
};

/**
 * Who manages a shared space, from a "who's in control?" answer stored
 * against the inviter and invitee roles (`PartnershipControl`).
 *
 * The one place a role-shaped answer becomes per-member flags: an invite's
 * offer when it is made and when it is accepted, and the partner settings
 * form, whose answer is pair-shaped like the invite (docs/spaces.md, "Still
 * pair-shaped"). A pending invite has no invitee yet, so only the inviter's
 * flag is returned for it.
 */
export function managersFromControl(
	control: PartnershipControl,
	members: { inviterId: string; inviteeId: string | null }
): SpaceMember[] {
	const result: SpaceMember[] = [
		{ userId: members.inviterId, canManage: control === 'both' || control === 'inviter' }
	];
	if (members.inviteeId !== null) {
		result.push({
			userId: members.inviteeId,
			canManage: control === 'both' || control === 'invitee'
		});
	}
	return result;
}

/**
 * Whether someone other than `userId` manages the space.
 *
 * The rule for who completes a task and who claims a reward in a shared
 * space: the people a task is set *for* are the ones who did not set it, so
 * a member may act on tasks when someone else could have set them. With two
 * members that is "control is shared, or it is the partner's" — the rule
 * `control` used to say directly.
 */
export function someoneElseManages(members: readonly SpaceMember[], userId: string): boolean {
	return members.some((member) => member.userId !== userId && member.canManage);
}

/** A space as the task and reward rules see it: what kind, and who is in it. */
export type SpaceForRules = { kind: SpaceKind; members: readonly SpaceMember[] };

/**
 * A task or reward as its rules see it: who wrote it, and who it is for —
 * who completes the task or claims the reward.
 */
export type AssignedRecord = { createdByUserId: string; assigneeUserId: string | null };

/**
 * Who a new task or reward is for, written by `creatorId`: in their own space
 * themselves, and in a shared one the first other member — never the
 * creator, because nobody completes or claims what they wrote. Null when
 * there is nobody else yet (a pending invite's space). The same rule copied
 * every partnership task and reward into its space
 * (drizzle/0052_copy_tasks_rewards_into_spaces.sql).
 */
export function assigneeFor(space: SpaceForRules, creatorId: string): string | null {
	if (space.kind === 'solo') {
		return creatorId;
	}
	return space.members.find((member) => member.userId !== creatorId)?.userId ?? null;
}

/**
 * Whether the viewer is someone a space's tasks and rewards can be set for:
 * everyone in their own space, and in a shared one whoever someone else could
 * have set them for (`someoneElseManages`). A member who manages alone sets
 * them and does not do them — which is what `control` used to say.
 */
export function viewerActsIn(space: SpaceForRules, viewerId: string): boolean {
	if (!space.members.some((member) => member.userId === viewerId)) {
		return false;
	}
	return space.kind === 'solo' || someoneElseManages(space.members, viewerId);
}

/**
 * Whether the viewer completes this task, or claims this reward: it is theirs
 * (`assigneeUserId`), they are on the side that acts (`viewerActsIn`), and in
 * a shared space they did not write it. The authorship rule holds whatever
 * the members' `can_manage` says now, so nobody can mint their own credits.
 */
export function actsOn(record: AssignedRecord, space: SpaceForRules, viewerId: string): boolean {
	if (record.assigneeUserId !== viewerId || !viewerActsIn(space, viewerId)) {
		return false;
	}
	return space.kind === 'solo' || record.createdByUserId !== viewerId;
}

/** Whether the viewer may set tasks and rewards in a space (and its other members' credits). */
export function managesSpace(space: SpaceForRules, viewerId: string): boolean {
	return space.members.some((member) => member.userId === viewerId && member.canManage);
}

/**
 * Whether the viewer may edit this task or reward: they manage the space, and
 * it is set for someone else — or, in their own space, it is simply theirs.
 * Nobody edits what is set for them, which in a space of two is the same as
 * "only its creator edits it".
 */
export function managesRecord(
	record: AssignedRecord,
	space: SpaceForRules,
	viewerId: string
): boolean {
	if (!managesSpace(space, viewerId)) {
		return false;
	}
	return space.kind === 'solo' || record.assigneeUserId !== viewerId;
}

/**
 * Whether the viewer may set this member's credits in a space: their own in
 * their own space, and in a shared one another member's when they manage it —
 * never their own, which would be paying themselves.
 */
export function canSetBalance(
	space: SpaceForRules,
	viewerId: string,
	targetUserId: string
): boolean {
	if (!space.members.some((member) => member.userId === targetUserId)) {
		return false;
	}
	if (space.kind === 'solo') {
		return targetUserId === viewerId;
	}
	return targetUserId !== viewerId && managesSpace(space, viewerId);
}
