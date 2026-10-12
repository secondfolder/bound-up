import { error, json } from '@sveltejs/kit';
import { iqTestResultSchema } from '$lib/schemas/iqTestResult';
import { signSharedResult } from '$lib/server/iq-test-share';
import type { RequestHandler } from './$types';

/**
 * Sign a signed-out visitor's finished result, so it can be shared as a link.
 *
 * Nothing is stored: the token *is* the result, signed so the score in the
 * link cannot be edited by hand (see `iq-test-share.ts`). Public, like the
 * test, and stateless, so there is nothing here to rate-limit.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const body: unknown = await request.json().catch(() => null);
	const parsed = iqTestResultSchema.safeParse(body);
	if (!parsed.success) {
		error(400, 'That is not a test result');
	}
	const { seed: _seed, ...result } = parsed.data;
	const createdAt = new Date();
	const token = await signSharedResult((await locals.auth.$context).secret, {
		...result,
		createdAt
	});
	return json({ token, createdAt }, { status: 201 });
};
