import { error, json, type RequestHandler } from '@sveltejs/kit';
import { acceptSceneHelp } from '$lib/server/scenes/help';

/**
 * Agreeing to a scene's text going to the model when help is asked for. The
 * `api/` routes sit outside the route groups, so each checks the session
 * itself.
 */
export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	await acceptSceneHelp(locals.db, locals.user.id);
	return json({ accepted: true });
};
