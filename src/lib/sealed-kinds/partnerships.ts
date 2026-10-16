/**
 * The sealed kinds behind a partnership's names and roles. See docs/partners.md,
 * "Names are sealed", for the whole lifecycle.
 *
 * Two kinds, because the names live under two different keys in turn:
 *
 * - `partnershipInviteKind` — sealed under the **invite key**, a random key that
 *   travels only in the invite link's fragment (`#k=…`). It is all the invitee
 *   has before the partnership exists, so it also carries the inviter's
 *   recipient: a key the invitee learns out of band, from the person who sent
 *   the link, rather than from the server.
 * - `partnershipNamesKind` — the same four fields sealed in the partnership's
 *   vault, once there is one. Where they live from then on.
 *
 * Both are sealed to the partnership's id, so a record moved to another
 * partnership does not open.
 */

import { z } from 'zod';
import { defineSealedKind } from '../sealed';

const name = z.string().trim().min(1).max(60);
const role = z.string().trim().min(1).max(40).nullable();

const names = {
	/** What the invitee calls the inviter. */
	inviterName: name,
	/** What the inviter calls the invitee. */
	inviteeName: name,
	inviterRole: role,
	inviteeRole: role
};

export const partnershipNamesKind = defineSealedKind({
	name: 'partnership-names',
	maxCiphertextLength: 2048,
	versions: [{ version: 1, schema: z.object(names) }]
});

export type PartnershipNames = z.output<typeof partnershipNamesKind.latest>;

export const partnershipInviteKind = defineSealedKind({
	name: 'partnership-invite',
	maxCiphertextLength: 2048,
	versions: [
		{
			version: 1,
			schema: z.object({
				...names,
				/** The inviter's age recipient, as their device knew it when inviting. */
				inviterRecipient: z.string().startsWith('age1').max(200)
			})
		}
	]
});

export type PartnershipInvite = z.output<typeof partnershipInviteKind.latest>;
