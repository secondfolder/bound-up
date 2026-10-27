import { error, json } from '@sveltejs/kit';
import { notebookHeaderSchema } from '$lib/schemas/notebook';
import { entrySpaceId, getEntryContext, saveHeader } from '$lib/server/notebook';
import { publishListChange } from '$lib/server/notebook-live';
import { createNotifier } from '$lib/server/realtime/backend';
import type { RequestHandler } from './$types';

/**
 * Rewrites an entry's sealed title and excerpt: the cache lists read, kept by
 * whichever page is editing. A lost compare-and-swap is a 409 carrying the
 * current revision, so the page can write once more over it. See
 * `saveHeader`.
 */
export const POST: RequestHandler = async ({ locals, params, platform, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const parsed = notebookHeaderSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, parsed.error.issues[0]?.message ?? 'Malformed title');
	}
	const context = await getEntryContext(locals.db, params.entryId, locals.user.id);
	if (!context) {
		error(404, 'Not found');
	}
	const { expectedRevision, ...header } = parsed.data;
	const result = await saveHeader(locals.db, context, header, expectedRevision);
	if (!result.ok) {
		if (result.reason === 'conflict') {
			return json({ revision: result.revision }, { status: 409 });
		}
		error(result.reason === 'read-only' ? 403 : 400, result.reason);
	}
	await publishListChange(
		await createNotifier({ platform }),
		locals.db,
		entrySpaceId(context.entry)
	);
	return json({ revision: result.revision });
};
