import { error, fail as kitFail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { invitePath } from '$lib/invite-url';
import { controlFromAnswer } from '$lib/partnership';
import {
	formFields,
	partnerInviteFormSchema,
	partnerInviteSealedSchema
} from '$lib/schemas/partnerForm';
import { createInvite } from '$lib/server/partnerships';
import type { Actions, PageServerLoad } from './$types';

/** What the action hands back so the page can open the share sheet. */
export type InviteCreated = { partnershipId: string; path: string };

export const load: PageServerLoad = async ({ locals }) => {
	return {
		// 'mix' rather than the enum's first member: defaulting the permission to
		// "me" would quietly hand control to whoever happened to click Add first.
		partnerInviteForm: await superValidate(
			{
				partnerName: '',
				// Pre-filled from the account so "what do they call you?" starts from
				// the name the rest of the app already shows for this user.
				yourName: locals.user?.name ?? '',
				partnerRole: null,
				yourRole: null,
				control: 'mix' as const
			},
			zod4(partnerInviteFormSchema),
			{ errors: false }
		)
	};
};

export const actions: Actions = {
	// Form actions run BEFORE layout loads, so the (auth-required) group guard
	// has not run yet — the session check here is not redundant.
	default: async ({ locals, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}

		// The names arrive sealed under the invite key, which stays in the
		// browser; see `partnerInviteSealedSchema`.
		const parsed = partnerInviteSealedSchema.safeParse(formFields(await request.formData()));
		if (!parsed.success) {
			return kitFail(400, { error: 'That invite could not be made. Reload and try again.' });
		}
		const { id, control, inviteCiphertext, invitePayloadVersion, inviteKeyWrap } = parsed.data;
		const invite = await createInvite(locals.db, {
			id,
			inviterId: locals.user.id,
			// The person adding the partner is always the inviter, so "me" is
			// 'inviter' here.
			control: controlFromAnswer(control, 'inviter'),
			invite: {
				ciphertext: inviteCiphertext,
				payloadVersion: invitePayloadVersion,
				keyWrap: inviteKeyWrap
			}
		});
		if (!invite.ok) {
			return kitFail(400, { error: 'That invite could not be made. Reload and try again.' });
		}

		// Deliberately NOT a redirect. `navigator.share()` needs transient user
		// activation, and a 303 plus a fresh page load loses it — returning the
		// link to the submitting page keeps the share attempt inside the click
		// that caused it. The page navigates itself afterwards, and makes the
		// link absolute on its own origin and adds the invite key first: the server
		// never has the key, and its idea of the origin can be wrong (`invite-url.ts`).
		return {
			created: {
				partnershipId: invite.id,
				path: invitePath(invite.inviteToken)
			} satisfies InviteCreated
		};
	}
};
