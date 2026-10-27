import { error, fail as kitFail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { inviteUrl } from '$lib/invite-url';
import { answerFromControl, controlFromAnswer, isInviteUsable } from '$lib/partnership';
import {
	formFields,
	partnerEditFormSchema,
	partnerEditSealedSchema,
	partnerRotateSealedSchema
} from '$lib/schemas/partnerForm';
import { spaceColourFormSchema } from '$lib/schemas/spaceColourForm';
import { contextSpaceViews, setSpaceColour } from '$lib/server/context';
import { createMediaStore } from '$lib/server/media/backend';
import { purgePartnershipMedia } from '$lib/server/messaging';
import {
	deletePartnership,
	getPartnershipForUser,
	rotateInviteToken,
	updatePartnership
} from '$lib/server/partnerships';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}

	const partnership = await getPartnershipForUser(locals.db, params.id, locals.user.id);
	// 404 rather than 403 for a partnership that exists but is someone else's:
	// distinguishing the two would confirm the id is real.
	if (!partnership) {
		error(404, 'Partner not found');
	}

	const usable = isInviteUsable(partnership, new Date());

	// The colour as the switcher shows it now: the viewer's own choice, or
	// the default by order, so the picker starts on what they see. Only for a
	// linked partnership, which is the only kind the switcher shows.
	const spaceView =
		partnership.status === 'accepted'
			? contextSpaceViews(await locals.contextSpaces(), [partnership]).find(
					(space) => space.id === partnership.id
				)
			: undefined;
	const colour = spaceView && spaceView.colour !== 'me' ? spaceView.colour : null;

	return {
		partnership: {
			id: partnership.id,
			status: partnership.status,
			role: partnership.role,
			// The names are opened in the browser (`partner-names.svelte.ts`):
			// the server cannot read them, so the form's text fields start empty
			// here and are filled in by the page.
			names: partnership.names,
			canEdit: partnership.canEdit,
			counterpartImage: partnership.counterpart?.image ?? null,
			inviteExpiresAt: partnership.inviteExpiresAt
		},
		// Only ever sent to the inviter, and only while the link is live: the
		// token is the whole authorisation to join, so it must not travel in the
		// page data of anyone who cannot already use it. Without its key: the
		// page adds the fragment from the inviter's own wrap of it.
		inviteUrl:
			usable && partnership.role === 'inviter' && partnership.inviteToken
				? inviteUrl(url.origin, partnership.inviteToken)
				: null,
		inviteExpired: partnership.status === 'pending' && !usable,
		partnerEditForm: await superValidate(
			{
				partnerName: '',
				yourName: '',
				partnerRole: null,
				yourRole: null,
				control: answerFromControl(partnership.control, partnership.role)
			},
			zod4(partnerEditFormSchema),
			{ errors: false }
		),
		colourForm: colour
			? await superValidate({ colour }, zod4(spaceColourFormSchema), { errors: false })
			: null
	};
};

export const actions: Actions = {
	// The (auth-required) guard is a layout load, which does not run before an
	// action — every action here checks the session itself.
	update: async ({ locals, params, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}

		// The names arrive sealed; see `partnerEditSealedSchema`.
		const parsed = partnerEditSealedSchema.safeParse(formFields(await request.formData()));
		if (!parsed.success) {
			return kitFail(400, { error: 'Those changes could not be saved. Reload and try again.' });
		}

		const current = await getPartnershipForUser(locals.db, params.id, locals.user.id);
		if (!current) {
			error(404, 'Partner not found');
		}

		const form = parsed.data;
		const result = await updatePartnership(locals.db, params.id, locals.user.id, {
			control: controlFromAnswer(form.control, current.role),
			names:
				form.namesVaultId && form.namesCiphertext && form.namesPayloadVersion
					? {
							vaultId: form.namesVaultId,
							ciphertext: form.namesCiphertext,
							payloadVersion: form.namesPayloadVersion,
							expectedRevision: form.expectedRevision ?? 0
						}
					: undefined,
			invite:
				form.inviteCiphertext && form.invitePayloadVersion
					? { ciphertext: form.inviteCiphertext, payloadVersion: form.invitePayloadVersion }
					: undefined
		});

		// Re-checked against the stored row rather than trusting the page having
		// hidden the form: control can have changed since it was rendered.
		if (!result.ok) {
			if (result.reason === 'forbidden') {
				return kitFail(403, { denied: true, error: "They're in control of this link." });
			}
			return kitFail(result.reason === 'conflict' ? 409 : 400, {
				error:
					result.reason === 'conflict'
						? 'These were changed somewhere else since you opened them. Reload to see the latest, then make your change again.'
						: 'Those changes could not be saved. Reload and try again.'
			});
		}

		redirect(303, '/settings/partners');
	},

	/**
	 * How this partnership looks to the viewer. Their own membership row
	 * only: the colour is per viewer, never the partnership's. Re-checks that
	 * they are in a linked partnership rather than trusting the form having
	 * been shown (invariant 14).
	 */
	colour: async ({ locals, params, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}
		const colourForm = await superValidate(request, zod4(spaceColourFormSchema));
		if (!colourForm.valid) {
			return kitFail(400, { colourForm });
		}
		const partnership = await getPartnershipForUser(locals.db, params.id, locals.user.id);
		if (partnership?.status !== 'accepted') {
			error(404, 'Partner not found');
		}
		if (!(await setSpaceColour(locals.db, params.id, locals.user.id, colourForm.data.colour))) {
			error(404, 'Partner not found');
		}
		return { colourForm };
	},

	/**
	 * Issues a replacement invite link.
	 *
	 * Returns the URL instead of redirecting so the page can put it straight
	 * into the share sheet while the click's user activation is still live.
	 */
	rotate: async ({ locals, params, request, url }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}

		// A new link has a new invite key, so the invite arrives sealed afresh.
		const parsed = partnerRotateSealedSchema.safeParse(formFields(await request.formData()));
		if (!parsed.success) {
			return kitFail(400, { rotateError: 'That invite can no longer be renewed.' });
		}
		const rotated = await rotateInviteToken(locals.db, params.id, locals.user.id, {
			ciphertext: parsed.data.inviteCiphertext,
			payloadVersion: parsed.data.invitePayloadVersion,
			keyWrap: parsed.data.inviteKeyWrap
		});
		if (!rotated) {
			return kitFail(400, { rotateError: 'That invite can no longer be renewed.' });
		}

		return { url: inviteUrl(url.origin, rotated.inviteToken) };
	},

	/**
	 * Leaves the link, or cancels it if it was never accepted.
	 *
	 * Not gated on `control` on purpose — a user who handed control to their
	 * partner must still be able to get out. See `deletePartnership`.
	 */
	disconnect: async ({ locals, params, platform }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}

		const removed = await deletePartnership(locals.db, params.id, locals.user.id);
		if (!removed) {
			error(404, 'Partner not found');
		}

		// After the delete, not before: the delete is what proves membership, so
		// nobody can purge a partnership's media without being in it. Nothing
		// cascades from D1 into the store, and without this every file ever sent
		// stayed in R2, billed, for good. The purge works by prefix, so the rows
		// being gone does not matter, and it reports failure rather than throwing
		// — leaving never waits on storage.
		const purge = await purgePartnershipMedia(await createMediaStore({ platform }), params.id);
		if (purge.failed) {
			console.error(`could not purge media for partnership ${params.id}`);
		}

		redirect(303, '/settings/partners');
	}
};
