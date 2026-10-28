import { error, json } from '@sveltejs/kit';
import { entryTopic } from '$lib/notebook';
import { notebookMoveSchema } from '$lib/schemas/notebook';
import { createMediaStore } from '$lib/server/media/backend';
import {
	entrySpaceId,
	getEntryContext,
	moveEntry,
	resolveScope,
	scopeForSpace
} from '$lib/server/notebook';
import { publishEntryFrame, publishListChange } from '$lib/server/notebook-live';
import { createNotifier } from '$lib/server/realtime/backend';
import { requireSpaceMember } from '$lib/server/spaces';
import type { RequestHandler } from './$types';

/**
 * Commits a move to another space, once every version has been staged
 * (`move/versions/[versionId]`). See `moveEntry` and docs/notebook.md,
 * "Moving an entry".
 *
 * `stale` (409) means something changed while the device was staging, and it
 * starts again from what is stored now. After the move, every open copy is
 * told to reload, members of the old space who are not in the new one are
 * dropped from its stream, and both spaces' lists refresh.
 */
export const POST: RequestHandler = async ({ locals, params, platform, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const userId = locals.user.id;
	const parsed = notebookMoveSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, parsed.error.issues[0]?.message ?? 'Malformed move');
	}
	const { spaceId, ...input } = parsed.data;
	const context = await getEntryContext(locals.db, params.entryId, userId);
	if (!context) {
		error(404, 'Not found');
	}
	const membership = await requireSpaceMember(locals.db, spaceId, userId);
	const target = membership
		? await resolveScope(locals.db, scopeForSpace(membership), userId)
		: null;
	if (!target) {
		error(404, 'Not found');
	}
	const result = await moveEntry(
		locals.db,
		await createMediaStore({ platform }),
		context,
		userId,
		target,
		input
	);
	if (!result.ok) {
		switch (result.reason) {
			case 'stale':
				return json({ stale: true }, { status: 409 });
			case 'read-only':
				error(403, 'Only whoever has the say over this entry can move it.');
				break;
			default:
				error(400, result.reason);
		}
	}
	if (result.purgeFailed) {
		// Reported, not thrown, as a delete's: the entry has moved, and an
		// unreadable leftover under the old space is the smaller problem.
		console.error('[notebook] a moved entry’s old versions could not all be removed', {
			entryId: context.entry.id
		});
	}

	const notifier = await createNotifier({ platform });
	const fromSpaceId = entrySpaceId(context.entry);
	// Told before evicted, as `setAccessAction` does, so an open page hears it
	// and reloads (or leaves) at once.
	await publishEntryFrame(notifier, context.room, context.entry.id, { type: 'moved' });
	const staying = new Set(target.partnership?.members.map((member) => member.userId) ?? [userId]);
	for (const member of context.partnership?.members ?? []) {
		if (!staying.has(member.userId)) {
			await notifier.evict(context.room, {
				userId: member.userId,
				topic: entryTopic(context.entry.id)
			});
		}
	}
	await publishListChange(notifier, locals.db, fromSpaceId);
	await publishListChange(notifier, locals.db, target.spaceId);
	return json({ ok: true, spaceId: target.spaceId });
};
