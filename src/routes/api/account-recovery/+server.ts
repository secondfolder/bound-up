import { error, json } from '@sveltejs/kit';
import { parseKeyWrapParams } from '$lib/encryption';
import { startRecoverySchema } from '$lib/schemas/accountRecovery';
import { startAccountRecovery } from '$lib/server/recovery';
import type { RequestHandler } from './$types';

/**
 * Opens a partner-assisted sign-in. **Unauthenticated**, by necessity: it is
 * for someone who has lost every way into their account.
 *
 * Returns the same `{ token }` for every well-formed request, whether or not
 * the account exists or has a partner — see `startAccountRecovery` for why
 * that matters more than anything else in this endpoint. The only other answer
 * is 429, and an unknown email reaches it at exactly the same rate.
 */
export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
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

	const result = await startAccountRecovery(locals.db, {
		email: parsed.data.email,
		recipient: parsed.data.recipient,
		wrap: { params, blob: parsed.data.wrapBlob },
		ip,
		secret: (await locals.auth.$context).secret
	});
	if (!result.ok) {
		error(429, 'Too many requests — wait an hour and try again.');
	}
	return json({ token: result.token });
};
