import { redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { fail, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { parseKeyWrapParams } from '$lib/encryption';
import { redirectTargetOrHome, safeRedirect } from '$lib/safe-redirect';
import { signupFormSchema } from '$lib/schemas/signupForm';
import { user } from '$lib/server/db/schema';
import { putUserKeys } from '$lib/server/keys';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	// See the note in the login load: this is how an invite survives signup.
	const redirectTo = safeRedirect(url.searchParams.get('redirectTo'));
	if (locals.user) {
		redirect(303, redirectTo ?? '/home');
	}
	return { signupForm: await superValidate(zod4(signupFormSchema)), redirectTo };
};

export const actions: Actions = {
	default: async ({ locals, request, url }) => {
		const signupForm = await superValidate(request, zod4(signupFormSchema));
		// (the previous console.log here leaked the plaintext password; the form
		// now carries `authSecret` instead, which is a permanent credential and
		// no safer to log)
		if (!signupForm.valid) {
			return fail(400, { signupForm });
		}

		const { name, email, timezone, authSecret, recipient, wrapParams, wrapBlob } = signupForm.data;

		// Validated by the Zod field, parsed again here because the column is
		// typed. `parseKeyWrapParams` is the one definition of "valid params", so
		// the two cannot disagree.
		const params = parseKeyWrapParams(wrapParams);
		if (!params) {
			return setError(signupForm, '', 'Could not set up encryption keys');
		}

		let userId: string;
		try {
			// autoSignIn is on and email verification is off, so this both creates
			// the user and establishes the session — the old create-then-
			// authenticate pair is no longer needed.
			const created = await locals.auth.api.signUpEmail({
				body: { name, email, timezone, password: authSecret },
				headers: request.headers
			});
			userId = created.user.id;
		} catch (error) {
			if (error instanceof APIError) {
				const code = error.body?.code;
				if (code === 'USER_ALREADY_EXISTS' || code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
					return setError(signupForm, 'email', 'An account with that email already exists');
				}
				// A 43-character auth secret can never trip these, so reaching one
				// means a client bug rather than a user mistake — reported at form
				// level, because there is no password field to attach it to.
				if (code === 'PASSWORD_TOO_SHORT' || code === 'PASSWORD_TOO_LONG') {
					return setError(signupForm, '', 'Could not sign up');
				}
				return setError(signupForm, '', error.body?.message ?? 'Could not sign up');
			}
			console.error(error);
			return setError(signupForm, '', 'Could not sign up');
		}

		// After signUpEmail rather than inside it: the user id only exists once
		// that returns. If this half fails, the account is undone rather than left
		// without keys — every account is assumed to have them (sign-in is what
		// unlocks, and there is no longer a screen that sets keys up later), so an
		// account without them could sign in and never read a message. Deleting
		// the user cascades to its credential and the session signUpEmail just
		// made, so the cookie it set points at nothing.
		try {
			await putUserKeys(locals.db, userId, {
				recipient,
				wrap: { type: params.type, params, blob: wrapBlob }
			});
		} catch (error) {
			console.error('signup: could not store encryption keys', error);
			await locals.db.delete(user).where(eq(user.id, userId));
			return setError(signupForm, '', 'Could not sign up — please try again');
		}

		redirect(303, redirectTargetOrHome(url.searchParams.get('redirectTo')));
	}
};
