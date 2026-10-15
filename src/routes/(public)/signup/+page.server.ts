import { redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { fail, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import {
	CHECK_EMAIL_COOKIE,
	CHECK_EMAIL_COOKIE_OPTIONS,
	checkEmailCookie,
	checkEmailPath,
	verifiedCallback
} from '$lib/email-verification';
import { parseKeyWrapParams } from '$lib/encryption';
import { safeRedirect } from '$lib/safe-redirect';
import { signupFormSchema } from '$lib/schemas/signupForm';
import { user } from '$lib/server/db/schema';
import { putUserKeys } from '$lib/server/keys';
import { rateLimitMessage } from '$lib/server/rate-limit';
import { holdUntilFloor, SIGN_UP_RESPONSE_FLOOR_MS, startTimer } from '$lib/server/response-floor';
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
	default: async (event) => {
		const { locals, request, url } = event;
		const signupForm = await superValidate(request, zod4(signupFormSchema));
		// (the previous console.log here leaked the plaintext password; the form
		// now carries `authSecret` instead, which is a permanent credential and
		// no safer to log)
		if (!signupForm.valid) {
			return fail(400, { signupForm });
		}

		// See the login action: this bypasses Better Auth's HTTP endpoints, so
		// it is limited here rather than there.
		const limited = await locals.authRateLimit('sign-up');
		if (!limited.allowed) {
			return setError(signupForm, '', rateLimitMessage(limited.retryAfterSeconds), {
				status: 429
			});
		}

		const { name, email, timezone, authSecret, recipient, wrapParams, wrapBlob } = signupForm.data;

		// Validated by the Zod field, parsed again here because the column is
		// typed. `parseKeyWrapParams` is the one definition of "valid params", so
		// the two cannot disagree.
		const params = parseKeyWrapParams(wrapParams);
		if (!params) {
			return setError(signupForm, '', 'Could not set up encryption keys');
		}

		const redirectTo = url.searchParams.get('redirectTo');
		/** Everything whose length could say whether the address was taken. A failure, or null. */
		const createAccount = async () => {
			let userId: string;
			try {
				// Creates the account and sends the verification link, and makes no
				// session: an account cannot sign in until its address is confirmed
				// (see `emailAndPassword` in auth.ts). The link comes back to the
				// login page, carrying `redirectTo` so an invite survives the trip.
				const created = await locals.auth.api.signUpEmail({
					body: {
						name,
						email,
						timezone,
						password: authSecret,
						callbackURL: verifiedCallback(redirectTo)
					},
					headers: request.headers
				});
				userId = created.user.id;
			} catch (error) {
				if (error instanceof APIError) {
					const code = error.body?.code;
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

			// An address that already has an account is not an error any more. With
			// verification required, Better Auth answers it with a made-up user that
			// was never stored, and emails the real owner instead — so this page
			// cannot be used to find out who has an account. Telling the two apart
			// here is only so that no keys are written for a user that does not
			// exist; both end on the same page.
			const [stored] = await locals.db
				.select({ id: user.id })
				.from(user)
				.where(eq(user.id, userId))
				.limit(1);

			// After signUpEmail rather than inside it: the user id only exists once
			// that returns. If this half fails, the account is undone rather than left
			// without keys — every account is assumed to have them (sign-in is what
			// unlocks, and there is no longer a screen that sets keys up later), so an
			// account without them could sign in and never read a message. Deleting
			// the user cascades to its credential.
			if (stored) {
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
			}

			// The link just sent is counted against the address's limit where
			// Better Auth sends it (`sendLimited` in auth.ts), so the check-email
			// page cannot send a second one within the minute.
			return null;
		};

		// From here on, how long this takes would depend on whether the
		// address has an account, so every outcome waits out the same floor.
		const started = startTimer();
		const outcome = await createAccount();
		await holdUntilFloor(started, SIGN_UP_RESPONSE_FLOOR_MS);
		if (outcome) {
			return outcome;
		}

		// So the next page can say where the link went and fill in the resend
		// form. Scoped to that page and short-lived; it holds nothing the person
		// did not just type. `sentAt` is what the page counts its wait from.
		event.cookies.set(
			CHECK_EMAIL_COOKIE,
			checkEmailCookie(email, Date.now()),
			CHECK_EMAIL_COOKIE_OPTIONS
		);
		redirect(303, checkEmailPath(redirectTo));
	}
};
