import { error, json } from '@sveltejs/kit';
import { notebookPostSchema } from '$lib/schemas/notebook';
import { notebookAwarenessKind } from '$lib/sealed-kinds/notebook';
import { createMediaStore } from '$lib/server/media/backend';
import {
	appendUpdate,
	getEntryContext,
	latestVersion,
	listUpdatesAfter,
	readVersionSnapshot
} from '$lib/server/notebook';
import { publishEntryFrame } from '$lib/server/notebook-live';
import { createNotifier } from '$lib/server/realtime/backend';
import { sealedIsAcceptable } from '$lib/server/sealed-content';
import type { RequestHandler } from './$types';

/**
 * An entry's document, as sealed records: its latest version and every edit
 * after it (`?after=0&snapshot=1`, when a page opens it), or just the edits
 * after a seq (`?after=<seq>`, to catch up after a reconnect).
 *
 * Outside both route groups, like every `api/` route, so each handler checks
 * for itself. An entry the viewer may not read is a 404, the same as one that
 * does not exist.
 */
export const GET: RequestHandler = async ({ locals, params, platform, url }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const context = await getEntryContext(locals.db, params.entryId, locals.user.id);
	if (!context) {
		error(404, 'Not found');
	}

	const after = Number(url.searchParams.get('after') ?? '0');
	if (!(Number.isInteger(after) && after >= 0)) {
		error(400, '`after` is a seq: a whole number, 0 for the beginning');
	}

	if (url.searchParams.get('snapshot') !== '1') {
		return json(await listUpdatesAfter(locals.db, context.entry.id, after));
	}

	// Opening: start from the newest version, then everything after it.
	const version = await latestVersion(locals.db, context.entry.id);
	if (!version) {
		return json({ snapshot: null, ...(await listUpdatesAfter(locals.db, context.entry.id, 0)) });
	}
	const ciphertext = await readVersionSnapshot(
		await createMediaStore({ platform }),
		context.entry,
		version.id
	);
	if (ciphertext === null) {
		// The row is there and its object is not: a purge that half-ran, or a
		// store that lost it. Every edit after the previous version is still
		// stored (see `compactionBound`), but this page cannot rebuild from
		// them alone without that version either, so it says so rather than
		// opening an entry that silently lacks its start.
		error(
			503,
			'Part of this entry’s history is missing from storage. Try again, and if it keeps happening, report it.'
		);
	}
	return json({
		snapshot: { ...version, ciphertext },
		...(await listUpdatesAfter(locals.db, context.entry.id, version.upToSeq))
	});
};

/**
 * One batch of edits and/or this page's cursor.
 *
 * The edit is stored and relayed; the cursor is only relayed, never stored.
 * A reader may send a cursor (so their partner sees them there) but never an
 * edit: that is refused here, from the stored row, whatever the page allowed
 * (AGENTS.md invariant 14).
 */
export const POST: RequestHandler = async ({ locals, params, platform, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const parsed = notebookPostSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, parsed.error.issues[0]?.message ?? 'Malformed edit');
	}
	const context = await getEntryContext(locals.db, params.entryId, locals.user.id);
	if (!context) {
		error(404, 'Not found');
	}
	const { origin, update, awareness } = parsed.data;

	if (
		awareness &&
		!(
			sealedIsAcceptable(notebookAwarenessKind, awareness.ciphertext, awareness.payloadVersion) &&
			awareness.vaultId === context.entry.vaultId
		)
	) {
		error(400, 'That cursor is not sealed for this entry');
	}

	let seq: number | null = null;
	let duplicate = false;
	if (update) {
		const result = await appendUpdate(locals.db, context, locals.user.id, update);
		if (!result.ok) {
			error(result.reason === 'read-only' ? 403 : 400, result.reason);
		}
		({ seq, duplicate } = result);
	}

	const notifier = await createNotifier({ platform });
	// A resend is not relayed again: everyone watching already had it.
	if (update && seq !== null && !duplicate) {
		await publishEntryFrame(notifier, context.room, context.entry.id, {
			type: 'update',
			origin,
			seq,
			...update
		});
	}
	if (awareness) {
		await publishEntryFrame(notifier, context.room, context.entry.id, {
			type: 'awareness',
			origin,
			...awareness
		});
	}
	return json({ seq });
};
