import { error, fail } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { parseKeyWrapParams } from '$lib/encryption';
import { providerForAaguid } from '$lib/passkey-providers';
import { changePasswordSchema } from '$lib/schemas/encryptionForms';
import { addWrap, deleteOtherPasswordWraps, deleteWrap, getUnlockBundle } from '$lib/server/keys';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}

	const [bundle, passkeys] = await Promise.all([
		getUnlockBundle(locals.db, locals.user.id),
		locals.auth.api.listPasskeys({ headers: request.headers })
	]);
	if (!bundle) {
		// Every account is created with keys; see the unlock-bundle endpoint.
		error(409, 'This account has no message keys. It was created before they existed.');
	}

	return {
		// The password wraps, so adding a passkey and changing the password can
		// open the identity on this device. Opaque here, as everywhere.
		bundle,
		/**
		 * Each passkey, labelled by provider where the AAGUID says.
		 *
		 * No "can it unlock your messages?" badge any more: every passkey can,
		 * because each is created with a PRF or user-handle wrap. `provider` is
		 * resolved here only because the AAGUID is already in hand;
		 * `providerForAaguid` is pure and the add-a-passkey dialog calls it
		 * client-side for the same answer.
		 */
		passkeys: passkeys.map((entry) => ({
			...entry,
			provider: providerForAaguid(entry.aaguid)
		})),
		changeForm: await superValidate(zod4(changePasswordSchema))
	};
};

export const actions: Actions = {
	/**
	 * Changes the account password, and re-seals the message key under it in
	 * the same act — the identity never changes, so nothing already sent is lost.
	 */
	changePassword: async ({ locals, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}
		const form = await superValidate(request, zod4(changePasswordSchema));
		if (!form.valid) {
			return fail(400, { form });
		}

		const params = parseKeyWrapParams(form.data.wrapParams);
		if (params?.type !== 'password') {
			return setError(form, '', 'Could not re-seal your keys');
		}

		const newWrapId = await addWrap(locals.db, locals.user.id, {
			type: 'password',
			params,
			blob: form.data.wrapBlob
		});

		try {
			await locals.auth.api.changePassword({
				body: {
					currentPassword: form.data.currentAuthSecret,
					newPassword: form.data.newAuthSecret,
					// Revoking a session does not revoke a key another device already
					// holds, so a half-revoked fleet of still-decrypting devices would
					// be a worse story than an honest one. See docs/encryption.md.
					revokeOtherSessions: false
				},
				headers: request.headers
			});
		} catch (caught) {
			// The new wrap is now orphaned but harmless — nothing opens it, and the
			// next successful change replaces it. Removing it is still tidier.
			await deleteWrap(locals.db, newWrapId, locals.user.id);
			if (caught instanceof APIError) {
				// Post-authentication, naming the wrong factor is helpful rather than
				// a leak: the no-leak rule is about the unauthenticated login surface.
				if (caught.body?.code === 'INVALID_PASSWORD') {
					return setError(form, 'currentAuthSecret', 'That password is not right');
				}
				return setError(form, '', caught.body?.message ?? 'Could not change your password');
			}

			console.error(caught);
			return setError(form, '', 'Could not change your password');
		}

		await deleteOtherPasswordWraps(locals.db, locals.user.id, newWrapId);
		return { form };
	}
};
