import { error, json } from '@sveltejs/kit';
import { recoveryStatusSchema } from '$lib/schemas/accountRecovery';
import { recoveryStatus } from '$lib/server/recovery';
import type { RequestHandler } from './$types';

/**
 * Where a partner-assisted sign-in stands, polled by the requester's page.
 *
 * POST rather than GET only so the token travels in a body, not a URL that
 * access logs and browser history would keep. Unauthenticated; the token is
 * the authority, and an unknown one reads as `expired`.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const parsed = recoveryStatusSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'Malformed request');
	}
	return json({ status: await recoveryStatus(locals.db, parsed.data.token) });
};
