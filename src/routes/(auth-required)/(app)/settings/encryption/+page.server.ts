import { error, fail } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { parseKeyWrapParams } from '$lib/encryption';
import { wrapBlobField } from '$lib/schemas/keyWrap';
import { encryptionSetupSchema } from '$lib/schemas/encryptionForms';
import { clearPasswordCredential, hasPasswordCredential } from '$lib/server/credentials';
import {
	addWrap,
	deleteWrap,
	getUnlockBundle,
	putUserKeys,
	replaceUserKeys
} from '$lib/server/keys';
import { listPartnershipsForUser } from '$lib/server/partnerships';
import { requestHistoryRestore } from '$lib/server/messaging';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, request }) => {
	// The group guard has already run for a layout load, but narrowing here also
	// means this page degrades rather than throwing if that ever changes.
	if (!locals.user) error(401, 'Not signed in');

	const [bundle, hasPassword, passkeys] = await Promise.all([
		getUnlockBundle(locals.db, locals.user.id),
		hasPasswordCredential(locals.db, locals.user.id),
		locals.auth.api.listPasskeys({ headers: request.headers })
	]);

	return {
		hasPassword,
		// `blob` is deliberately included: the browser needs it to open the
		// identity, and it is useless without a key the server does not have.
		bundle,
		/**
		 * Passkey names by id, so a wrap can be listed under the *current* name
		 * of the passkey it is sealed to rather than the label frozen into it
		 * when it was made. Only wraps carrying a `passkeyId` can be matched;
		 * ones sealed through the platform chooser are not bound to a known
		 * credential and keep their label.
		 */
		passkeyNames: Object.fromEntries(
			passkeys.map((entry) => [entry.id, entry.name ?? null]).filter(([, name]) => name)
		) as Record<string, string>,
		setupForm: await superValidate(zod4(encryptionSetupSchema))
	};
};

export const actions: Actions = {
	/**
	 * Creates the message identity, and settles the password at the same time.
	 *
	 * Covers three situations that need the same writes: a passkey-first account
	 * choosing a password for the first time, an account whose signup stored a
	 * credential but not a key row, and a forgotten-password reset. Which one it
	 * is decided by whether a password credential already exists.
	 */
	setup: async ({ locals, request }) => {
		// Actions run BEFORE layout loads, so the group guard does not gate this.
		if (!locals.user) error(401, 'Not signed in');
		const form = await superValidate(request, zod4(encryptionSetupSchema));
		if (!form.valid) return fail(400, { form });

		const params = parseKeyWrapParams(form.data.wrapParams);
		if (!params) return setError(form, '', 'Could not set up encryption keys');

		const userId = locals.user.id;
		const hadPassword = await hasPasswordCredential(locals.db, userId);

		try {
			if (hadPassword) {
				// Prove the submitted secret really is this account's password before
				// sealing anything to it. Otherwise a typo here would produce a wrap
				// that the user's actual password can never open — a key that looks
				// fine and is permanently useless.
				//
				// A no-op change is the only way to ask Better Auth "is this the
				// current password?"; there is no verify endpoint.
				await locals.auth.api.changePassword({
					body: {
						currentPassword: form.data.authSecret,
						newPassword: form.data.authSecret,
						revokeOtherSessions: false
					},
					headers: request.headers
				});
			} else {
				// No credential yet, so this is the first password. `setPassword` is
				// server-only, which is why it lives in an action.
				await locals.auth.api.setPassword({
					body: { newPassword: form.data.authSecret },
					headers: request.headers
				});
			}
		} catch (caught) {
			if (caught instanceof APIError) {
				if (caught.body?.code === 'INVALID_PASSWORD') {
					return setError(form, 'authSecret', 'That is not your current password');
				}
				return setError(form, '', caught.body?.message ?? 'Could not set your password');
			}
			console.error(caught);
			return setError(form, '', 'Could not set your password');
		}

		const existing = await getUnlockBundle(locals.db, userId);
		const wrap = { type: params.type, params, blob: form.data.wrapBlob } as const;

		if (existing.recipient) {
			// Replacing an identity abandons everything encrypted to the old one, so
			// each partner is asked to re-encrypt the shared history to the new key.
			await replaceUserKeys(locals.db, userId, { recipient: form.data.recipient, wrap });
			for (const partnership of await listPartnershipsForUser(locals.db, userId)) {
				if (partnership.status !== 'accepted') continue;
				await requestHistoryRestore(locals.db, {
					partnershipId: partnership.id,
					requesterId: userId,
					recipient: form.data.recipient
				});
			}
		} else {
			await putUserKeys(locals.db, userId, { recipient: form.data.recipient, wrap });
		}

		return { form };
	},

	/** Starts a forgotten-password reset by removing the unusable credential. */
	forgetPassword: async ({ locals, request }) => {
		if (!locals.user) error(401, 'Not signed in');
		// Only reachable for someone already signed in — today that means a
		// passkey. It does not let anyone in; it lets someone already in choose a
		// new password. See the comment on clearPasswordCredential.
		await clearPasswordCredential(locals.db, locals.user.id);
		void request;
		return { forgotten: true };
	},

	/**
	 * Adds another way to unlock. Today that means a passkey.
	 *
	 * Everything that matters already happened in the browser: it opened the
	 * identity with the password and re-sealed it to a credential. What arrives
	 * here is what always arrives here — a type, an opaque params blob, and a
	 * ciphertext — so this validates their shape and nothing about their
	 * meaning, which it has no way to check and no business checking.
	 */
	addWrap: async ({ locals, request }) => {
		if (!locals.user) error(401, 'Not signed in');
		const data = await request.formData();

		const params = parseKeyWrapParams(String(data.get('wrapParams') ?? ''));
		const blob = wrapBlobField.safeParse(String(data.get('wrapBlob') ?? ''));
		if (!params || !blob.success) {
			return fail(400, { addWrapError: 'Could not add that unlock method' });
		}

		// A wrap with no identity behind it is a blob nobody will ever be able to
		// check against anything, and it would make the list of ways to unlock a
		// lie. Setup is what creates the first one.
		const { recipient } = await getUnlockBundle(locals.db, locals.user.id);
		if (!recipient) {
			return fail(400, { addWrapError: 'Set up encrypted messages first' });
		}

		const label = String(data.get('label') ?? '').slice(0, 100);
		await addWrap(locals.db, locals.user.id, {
			type: params.type,
			params,
			blob: blob.data,
			label: label || null
		});
		return { wrapAdded: true };
	},

	/** Removes one unlock method — a revoked passkey, say. */
	revokeWrap: async ({ locals, request }) => {
		if (!locals.user) error(401, 'Not signed in');
		const data = await request.formData();
		const wrapId = String(data.get('wrapId') ?? '');

		const bundle = await getUnlockBundle(locals.db, locals.user.id);
		// Refusing to remove the last one is the whole point: a recipient with no
		// wraps is an identity nobody can ever open again, and the tempting
		// recovery from it — generate a fresh key — silently orphans every message
		// the user has ever received.
		if (bundle.wraps.length <= 1) {
			return fail(400, { revokeError: 'That is the only way you can unlock your messages' });
		}

		const removed = await deleteWrap(locals.db, wrapId, locals.user.id);
		if (!removed) return fail(404, { revokeError: 'That unlock method is already gone' });
		return { revoked: true };
	}
};
