import { error } from '@sveltejs/kit';
import { deleteIqTestResult } from '$lib/server/iq-test';
import type { RequestHandler } from './$types';

/** Remove one result from the signed-in account's history. */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	// 404 for someone else's id as well as a missing one, so ids cannot be probed.
	if (!(await deleteIqTestResult(locals.db, locals.user.id, params.id))) {
		error(404, 'No such result');
	}
	return new Response(null, { status: 204 });
};
