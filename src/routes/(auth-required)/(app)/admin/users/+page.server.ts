import { requireAdmin, searchUsers } from '$lib/server/admin';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	requireAdmin(locals);
	// A GET `?q=` rather than a superform: searching is navigation, not a
	// mutation, so it belongs in the URL where back and reload keep it.
	const query = url.searchParams.get('q')?.trim() ?? '';
	return { query, users: await searchUsers(locals.db, query) };
};
