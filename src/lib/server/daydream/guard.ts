import { error } from '@sveltejs/kit';
import { requireFeature } from '$lib/server/features';

/**
 * The checks every Daydreams API route starts with: a session, and the
 * feature. The `api/` routes sit outside both route groups, so none of them
 * inherits a guard, and each calls this itself (AGENTS.md, "A feature is
 * enforced with `requireFeature`, in every load and action that serves it").
 */
export async function daydreamGuard(locals: App.Locals): Promise<string> {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	await requireFeature(locals.db, locals.user.id, 'daydreams');
	return locals.user.id;
}
