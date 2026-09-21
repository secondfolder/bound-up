import { error, json } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { z } from 'zod';
import { authSecretField } from '$lib/schemas/keyWrap';
import { hasPasswordCredential } from '$lib/server/credentials';
import type { RequestHandler } from './$types';

const bodySchema = z.object({ authSecret: authSecretField });

/**
 * "Is this really this account's password?", asked before a passkey is created.
 *
 * Adding a passkey is a re-authentication moment: the new credential can sign
 * in on its own afterwards, so a session someone walked away from should not be
 * enough to mint one. The browser has already checked the password against the
 * stored wrap by then, but that is a check on the device — and invariant 14 is
 * that a permission is enforced on the server, never by what the client did.
 * This is the server half.
 *
 * A no-op `changePassword` is the only way to ask Better Auth this question:
 * there is no verify endpoint, and the same trick is used by
 * `/settings/encryption?/setup` for the same reason. It re-hashes the password
 * with a fresh salt as a side effect, which is harmless.
 *
 * Naming the wrong factor is fine here and would not be on the login screen:
 * the no-leak rule is about the unauthenticated surface, and this caller is
 * already signed in as the account in question.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	// See the note in ../unlock-bundle: endpoints carry their own auth check.
	if (!locals.user) error(401, 'Not signed in');

	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'Malformed request');

	// A passkey-only account has no password to prove, and asking for one would
	// be asking for something that does not exist. The caller does not offer the
	// prompt in that case; this is the matching server-side answer.
	if (!(await hasPasswordCredential(locals.db, locals.user.id))) {
		return json({ verified: true, hasPassword: false });
	}

	try {
		await locals.auth.api.changePassword({
			body: {
				currentPassword: parsed.data.authSecret,
				newPassword: parsed.data.authSecret,
				revokeOtherSessions: false
			},
			headers: request.headers
		});
	} catch (caught) {
		if (caught instanceof APIError && caught.body?.code === 'INVALID_PASSWORD') {
			return json({ verified: false, hasPassword: true }, { status: 403 });
		}
		console.error(caught);
		error(500, 'Could not check your password');
	}

	return json({ verified: true, hasPassword: true });
};
