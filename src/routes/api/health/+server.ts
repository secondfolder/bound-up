import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';

/**
 * Liveness for the Docker `HEALTHCHECK` and the CI smoke test: 200 once the
 * server answers and its database does, 503 when the database does not.
 *
 * Public on purpose and says nothing but yes or no. Runs through the auth hook
 * like any request, but an anonymous one skips the session lookup there, so a
 * probe every half minute costs one `select 1`.
 */
export const GET: RequestHandler = async ({ locals }) => {
	try {
		await locals.db.run(sql`select 1`);
		return json({ ok: true });
	} catch (error) {
		console.error('health check: database unreachable', error);
		return json({ ok: false }, { status: 503 });
	}
};
