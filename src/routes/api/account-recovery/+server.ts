import { error, json } from '@sveltejs/kit';
import { parseKeyWrapParams } from '$lib/encryption';
import { startRecoverySchema } from '$lib/schemas/accountRecovery';
import { sendInBackground } from '$lib/server/mail';
import { recoveryConfirmEmail } from '$lib/server/mail/templates';
import { startAccountRecovery } from '$lib/server/recovery';
import {
	holdUntilFloor,
	RECOVERY_START_RESPONSE_FLOOR_MS,
	startTimer
} from '$lib/server/response-floor';
import type { RequestHandler } from './$types';

/**
 * Opens a partner-assisted sign-in. **Unauthenticated**, by necessity: it is
 * for someone who has lost every way into their account.
 *
 * Returns the same `{ token }` for every well-formed request, whether or not
 * the account exists or has a partner — see `startAccountRecovery` for why
 * that matters more than anything else in this endpoint. The only other answer
 * is 429, and an unknown email reaches it at exactly the same rate. An account
 * that exists is also emailed a link, which the requester has to follow before
 * the request can finish. And every answer waits out the same floor, since an
 * account that exists costs one more read to find (`response-floor.ts`).
 */
export const POST: RequestHandler = async ({
	locals,
	request,
	getClientAddress,
	platform,
	url
}) => {
	const parsed = startRecoverySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, parsed.error.issues[0]?.message ?? 'Malformed request');
	}
	const params = parseKeyWrapParams(parsed.data.wrapParams);
	if (params?.type !== 'password') {
		error(400, 'Malformed key wrap parameters');
	}

	let ip: string | null = null;
	try {
		ip = getClientAddress();
	} catch {
		// Not every adapter can say (prerender, some test harnesses). The email
		// limit still applies.
	}

	const started = startTimer();
	const result = await startAccountRecovery(locals.db, {
		email: parsed.data.email,
		recipient: parsed.data.recipient,
		wrap: { params, blob: parsed.data.wrapBlob },
		ip,
		secret: (await locals.auth.$context).secret
	});
	await holdUntilFloor(started, RECOVERY_START_RESPONSE_FLOOR_MS);
	if (!result.ok) {
		error(429, 'Too many requests — wait an hour and try again.');
	}
	// The emailed half, sent only when the account exists and only to its own
	// address. In the background, so how long this takes says nothing either.
	// The token goes in the fragment, which browsers never send to a server:
	// it stays out of access logs, and the page posts it from there.
	if (result.confirmation) {
		const link = `${url.origin}/login/recover/confirm#token=${result.confirmation.token}`;
		sendInBackground(
			platform,
			locals.mailer,
			recoveryConfirmEmail(result.confirmation.email, link),
			'recovery confirmation'
		);
	}
	return json({ token: result.token });
};
