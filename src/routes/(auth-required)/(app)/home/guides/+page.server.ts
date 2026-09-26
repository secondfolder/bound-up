import { error } from '@sveltejs/kit';
import { requireFeature } from '$lib/server/features';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { db, user } }) => {
	if (!user) {
		error(401, 'Not signed in');
	}
	// Guides are a feature an account has to be given. Checked here rather than
	// trusted from the layout's `features`, which only decides what is shown.
	await requireFeature(db, user.id, 'guides');

	const guides = await db.query.guides.findMany({
		columns: { id: true, title: true },
		// PocketBase's getFullList() had no sort, so ordering was whatever SQLite
		// returned. `id` is the tiebreaker because createdAt can collide when
		// several rows are seeded in the same millisecond.
		orderBy: (table, { asc }) => [asc(table.createdAt), asc(table.id)]
	});

	return { guides };
};
