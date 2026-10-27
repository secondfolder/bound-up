import { error } from '@sveltejs/kit';
import { ALL_CONTEXT, type AppContext, parseContext } from '$lib/context';
import { setContextCookie } from '$lib/server/context';
import type { RequestHandler } from './$types';

/**
 * Switches this device's context: `{ context: 'all' | <space id> }`. Sets the
 * cookie and answers 204; the page then calls `invalidate('app:context')`, so
 * the loads that depend on it re-run in place. See docs/contexts.md.
 *
 * A space the viewer is not in is a 404 here, unlike the cookie read on a
 * load: this is someone asking for it, so it is an answer, not a fallback.
 */
export const POST: RequestHandler = async ({ locals, request, cookies }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const body: unknown = await request.json().catch(() => null);
	const value =
		typeof body === 'object' && body !== null && 'context' in body ? body.context : undefined;
	if (typeof value !== 'string') {
		error(400, 'Expected a context');
	}
	let context: AppContext;
	if (value === 'all') {
		context = ALL_CONTEXT;
	} else {
		context = parseContext(value);
		if (context.kind !== 'space') {
			error(400, 'Expected `all` or a space id');
		}
		const { spaceId } = context;
		const spaces = await locals.contextSpaces();
		if (!spaces.some((space) => space.spaceId === spaceId)) {
			error(404, 'Not found');
		}
	}
	setContextCookie(cookies, context);
	return new Response(null, { status: 204 });
};
