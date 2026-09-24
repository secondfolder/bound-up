import { error, json } from '@sveltejs/kit';
import { completeRecoverySchema } from '$lib/schemas/accountRecovery';
import { completeAccountRecovery } from '$lib/server/recovery';
import type { RequestHandler } from './$types';

/**
 * Finishes an approved partner-assisted sign-in, and sets the new password.
 *
 * The `authSecret` for the new password arrives only here, and is hashed with
 * Better Auth's own password hasher so sign-in verifies it like any other. The
 * page then signs in through Better Auth's ordinary email sign-in — this
 * endpoint sets no session, so there is no second way to mint one.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const parsed = completeRecoverySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'Malformed request');
	}

	const context = await locals.auth.$context;
	const result = await completeAccountRecovery(locals.db, {
		token: parsed.data.token,
		passwordHash: await context.password.hash(parsed.data.authSecret)
	});
	if (!result.ok) {
		error(result.reason === 'not-approved' ? 409 : 410, 'That request is no longer open.');
	}
	return json({ ok: true });
};
