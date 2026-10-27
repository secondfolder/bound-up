import { error, fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { answerFromControl, controlFromAnswer, isInviteUsable, offerGives } from '$lib/partnership';
import {
	formFields,
	partnerAcceptFormSchema,
	partnerAcceptSealedSchema
} from '$lib/schemas/partnerForm';
import { setContextCookie } from '$lib/server/context';
import { getUserRecipient } from '$lib/server/keys';
import {
	acceptInvite,
	findPendingInviteByToken,
	partnershipExistsBetween
} from '$lib/server/partnerships';
import type { Actions, PageServerLoad } from './$types';

/**
 * The invite landing page.
 *
 * Lives under `(public)` because the whole point is that it is opened by
 * someone who may not have an account yet — the auth guard would bounce them to
 * /login and, since the guard carries no redirectTo, lose the invite entirely.
 * The accept action does its own session check instead.
 */

/** Everything the page can be, rather than a pile of independent booleans. */
export type InviteState = 'invalid' | 'sign-in-required' | 'self' | 'already-linked' | 'confirm';

/**
 * What the page is told about the invite: its id, and the invite sealed under
 * the key in the link's fragment, which the server never sees. The names —
 * the inviter's included, even the one shown before sign-in — are opened on
 * the page. See docs/partners.md, "Names are sealed".
 */
type SealedInviteView = { partnershipId: string; ciphertext: string; payloadVersion: number };

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const invite = await findPendingInviteByToken(locals.db, params.token);

	// A missing token and an expired one are reported the same way. There is no
	// value in telling an anonymous visitor which of the two they found. The
	// sealed invite's columns are nullable, so one without them is the same.
	if (
		!(
			invite &&
			isInviteUsable(invite, new Date()) &&
			invite.inviteCiphertext !== null &&
			invite.invitePayloadVersion !== null
		)
	) {
		return { state: 'invalid' as const, invite: null };
	}

	const sealed: SealedInviteView = {
		partnershipId: invite.id,
		ciphertext: invite.inviteCiphertext,
		payloadVersion: invite.invitePayloadVersion
	};

	if (!locals.user) {
		return {
			state: 'sign-in-required' as const,
			invite: sealed,
			// Round-trips through /login and /signup so the visitor lands back
			// here. Validated by `safeRedirect` on the way out. The key in the
			// fragment does not make the trip; the page keeps it on the device.
			redirectTo: url.pathname
		};
	}

	if (locals.user.id === invite.inviterId) {
		return { state: 'self' as const, invite: sealed };
	}

	if (await partnershipExistsBetween(locals.db, invite.inviterId, locals.user.id)) {
		return { state: 'already-linked' as const, invite: sealed };
	}

	// "If their permissions are set to them in control or to mix then the invite
	// should have the names in editable fields, if not they should just be
	// displayed" — the accepter is always the invitee.
	// There is no member to ask yet, so this is the offer's own rule.
	const editable = offerGives(invite.control, 'invitee');

	return {
		state: 'confirm' as const,
		invite: sealed,
		editable,
		// The inviter's public key as the server has it. The page compares it
		// with the one inside the invite, which came from the inviter's own
		// device by way of the link, and refuses to go on if they differ.
		inviterRecipient: await getUserRecipient(locals.db, invite.inviterId),
		partnerAcceptForm: await superValidate(
			{
				// Filled in on the page, once the invite is open.
				partnerName: '',
				yourName: '',
				partnerRole: null,
				yourRole: null,
				control: answerFromControl(invite.control, 'invitee')
			},
			zod4(partnerAcceptFormSchema),
			{ errors: false }
		)
	};
};

export const actions: Actions = {
	default: async ({ locals, params, request, cookies }) => {
		// `(public)` means anyone can reach this, and actions run before layout
		// loads regardless — so this is the only session check there is.
		if (!locals.user) {
			error(401, 'Sign in to accept this invite');
		}

		// The names arrive sealed again under the invite key, or not at all; see
		// `partnerAcceptSealedSchema`.
		const parsed = partnerAcceptSealedSchema.safeParse(formFields(await request.formData()));
		if (!parsed.success) {
			return fail(400, { error: inviteFailureMessage('bad-invite') });
		}

		const { control, inviteCiphertext, invitePayloadVersion } = parsed.data;
		const result = await acceptInvite(locals.db, {
			token: params.token,
			inviteeId: locals.user.id,
			control: control ? controlFromAnswer(control, 'invitee') : undefined,
			invite:
				inviteCiphertext && invitePayloadVersion
					? { ciphertext: inviteCiphertext, payloadVersion: invitePayloadVersion }
					: undefined
		});

		if (!result.ok) {
			// acceptInvite decides whether the submitted names are honoured, so a
			// failure here is about the invite itself, not the fields.
			return fail(result.reason === 'not-found' ? 404 : 400, {
				error: inviteFailureMessage(result.reason)
			});
		}

		// Into Today in the new partnership's context: what the two of you share
		// is the point of having accepted. Setting the context here is the
		// accepter's deliberate choice, like following a card (docs/contexts.md);
		// a partnership's space has the partnership's id.
		setContextCookie(cookies, { kind: 'space', spaceId: result.id });
		redirect(303, '/today');
	}
};

function inviteFailureMessage(
	reason: 'not-found' | 'expired' | 'self' | 'already-linked' | 'bad-invite'
): string {
	switch (reason) {
		case 'expired':
			return 'This invite link has expired. Ask them to send you a new one.';
		case 'self':
			return 'This is your own invite link.';
		case 'already-linked':
			return "You're already linked with this person.";
		case 'bad-invite':
			return 'That could not be saved. Reload the page and try again.';
		default:
			return 'This invite link is no longer valid. Ask them to send you a new one.';
	}
}
