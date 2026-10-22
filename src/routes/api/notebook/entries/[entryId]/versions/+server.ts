import { error, json } from '@sveltejs/kit';
import { notebookVersionSchema } from '$lib/schemas/notebook';
import { createMediaStore } from '$lib/server/media/backend';
import { createVersion, getEntryContext, listVersions } from '$lib/server/notebook';
import { publishEntryFrame } from '$lib/server/notebook-live';
import { createNotifier } from '$lib/server/realtime/backend';
import type { RequestHandler } from './$types';

/** An entry's history: every automatic version, newest first. Metadata only. */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const context = await getEntryContext(locals.db, params.entryId, locals.user.id);
	if (!context) {
		error(404, 'Not found');
	}
	return json({ versions: await listVersions(locals.db, context.entry.id) });
};

/**
 * Stores an automatic version a page has cut: the sealed snapshot, up to a
 * seq. `stale` (409) is the ordinary outcome of two pages cutting the same
 * version at once, and costs the loser nothing but the upload.
 */
export const POST: RequestHandler = async ({ locals, params, platform, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const parsed = notebookVersionSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, parsed.error.issues[0]?.message ?? 'Malformed version');
	}
	const context = await getEntryContext(locals.db, params.entryId, locals.user.id);
	if (!context) {
		error(404, 'Not found');
	}
	const { id, upToSeq, restoredFromVersionId, ...snapshot } = parsed.data;
	const result = await createVersion(
		locals.db,
		await createMediaStore({ platform }),
		context,
		locals.user.id,
		{ id, upToSeq, snapshot, restoredFromVersionId }
	);
	if (!result.ok) {
		if (result.reason === 'stale') {
			return json({ stale: true }, { status: 409 });
		}
		error(result.reason === 'read-only' ? 403 : 400, result.reason);
	}
	await publishEntryFrame(await createNotifier({ platform }), context.room, context.entry.id, {
		type: 'version',
		id,
		upToSeq
	});
	return json({ ok: true });
};
