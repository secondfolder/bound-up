import { redirect } from '@sveltejs/kit';
import { fail, message, setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import {
	CHECK_EMAIL_COOKIE,
	CHECK_EMAIL_COOKIE_OPTIONS,
	checkEmailCookie,
	cooldownRemaining,
	RESENT_MESSAGE,
	readCheckEmailCookie,
	verifiedCallback
} from '$lib/email-verification';
import { normaliseEmail } from '$lib/encryption';
import { safeRedirect } from '$lib/safe-redirect';
import { resendVerificationFormSchema } from '$lib/schemas/resendVerificationForm';
import { rateLimitMessage } from '$lib/server/rate-limit';
import type { Actions, PageServerLoad } from './$types';

/**
 * Where sign-up ends: "we've sent you a link". See docs/email.md.
 *
 * Reached after every sign-up, including one for an address that already had
 * an account, so nothing here may depend on whether the account exists. The
 * address comes from a cookie sign-up set, not from the database.
 */
export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	const redirectTo = safeRedirect(url.searchParams.get('redirectTo'));
	if (locals.user) {
		redirect(303, redirectTo ?? '/home');
	}
	const sent = readCheckEmailCookie(cookies.get(CHECK_EMAIL_COOKIE));
	const email = sent?.email ?? null;
	// The resend button waits out what is left of the minute since the last
	// link, which the server would refuse anyway. Without the cookie nothing is
	// known to have been sent, and it is offered at once.
	const cooldownSeconds = sent ? cooldownRemaining(sent.sentAt, Date.now()) : 0;
	const resendForm = email
		? await superValidate({ email }, zod4(resendVerificationFormSchema), { errors: false })
		: await superValidate(zod4(resendVerificationFormSchema));
	return { email, resendForm, redirectTo, cooldownSeconds };
};

export const actions: Actions = {
	resend: async ({ locals, request, url, cookies }) => {
		const resendForm = await superValidate(request, zod4(resendVerificationFormSchema));
		if (!resendForm.valid) {
			return fail(400, { resendForm });
		}

		// Per client, like every other auth form, and then per address: each
		// attempt is an email to an address the caller chose, so the second
		// limit is what stops the form being pointed at one person's inbox from
		// many clients. Both count whether or not the account exists.
		//
		// A refusal carries how long to wait, which the page counts down on
		// the button rather than showing as an error.
		const limited = await locals.authRateLimit('verification-email');
		const perAddress = limited.allowed
			? await locals.emailRateLimit(resendForm.data.email)
			: limited;
		if (!perAddress.allowed) {
			setError(resendForm, '', rateLimitMessage(perAddress.retryAfterSeconds));
			return fail(429, { resendForm, retryAfterSeconds: perAddress.retryAfterSeconds });
		}
		const email = normaliseEmail(resendForm.data.email);

		// No headers, so no session: Better Auth then answers the same way for
		// an unknown, an already-confirmed and an unconfirmed address, with a
		// time floor, and only the last gets an email.
		await locals.auth.api.sendVerificationEmail({
			body: { email, callbackURL: verifiedCallback(url.searchParams.get('redirectTo')) }
		});
		// Restarts the countdown a reload would show, as sign-up started it.
		cookies.set(
			CHECK_EMAIL_COOKIE,
			checkEmailCookie(email, Date.now()),
			CHECK_EMAIL_COOKIE_OPTIONS
		);
		return message(resendForm, RESENT_MESSAGE);
	}
};
