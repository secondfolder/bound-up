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
 * Who manages a shared space, from the partnership's `control`.
 *
 * `control` is stored against the permanent inviter/invitee roles; this is
 * the one place it becomes per-member flags. A pending invite has no invitee
 * yet, so only the inviter's flag is returned for it.
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
