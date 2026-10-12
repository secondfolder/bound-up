import { error, json } from '@sveltejs/kit';
import { iqTestResultSchema } from '$lib/schemas/iqTestResult';
import { saveIqTestResult } from '$lib/server/iq-test';
import type { RequestHandler } from './$types';

/**
 * Save a finished IQ test to the signed-in account's history.
 *
 * The test page is public, but only an account has a history to add to; a
 * signed-out visitor's results stay on their device and never come here.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const body: unknown = await request.json().catch(() => null);
	const parsed = iqTestResultSchema.safeParse(body);
	if (!parsed.success) {
		error(400, 'That is not a test result');
	}
	const saved = await saveIqTestResult(locals.db, locals.user.id, parsed.data);
	return json(saved, { status: 201 });
};
