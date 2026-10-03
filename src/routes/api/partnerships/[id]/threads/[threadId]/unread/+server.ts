import { error, json } from '@sveltejs/kit';
import { isThreadUnread, requireThreadMembership } from '$lib/server/messaging';
import type { RequestHandler } from './$types';

/**
 * Whether a thread is unread for the viewer.
 *
 * Asked by a thread page when the live feed says another thread has a new
 * message, to decide whether to show a toast for it: the event cannot say who
 * wrote it, and only a message from the partner is news. See
 * docs/messaging.md, "Toasts for other threads".
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	// The same 404-not-403 and the same re-join as every other thread route.
	const membership = await requireThreadMembership(
		locals.db,
		params.id,
		params.threadId,
		locals.user.id
	);
	if (!membership) {
		error(404, 'Thread not found');
	}
	return json({ unread: await isThreadUnread(locals.db, params.threadId, locals.user.id) });
};
