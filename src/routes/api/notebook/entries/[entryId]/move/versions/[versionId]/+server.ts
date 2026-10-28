import { error, json } from '@sveltejs/kit';
import { notebookMoveStageSchema } from '$lib/schemas/notebook';
import { createMediaStore } from '$lib/server/media/backend';
import {
	getEntryContext,
	resolveScope,
	scopeForSpace,
	stageMovedVersion
} from '$lib/server/notebook';
import { requireSpaceMember } from '$lib/server/spaces';
import { isClientId } from '$lib/vault';
import type { RequestHandler } from './$types';

/**
 * Stages one version's snapshot for a move to another space, re-sealed by
 * the mover's device for that space. Nothing points at it until the move is
 * committed (`../../+server.ts`). See `stageMovedVersion`.
 */
export const PUT: RequestHandler = async ({ locals, params, platform, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const userId = locals.user.id;
	if (!isClientId(params.versionId)) {
		error(400, 'Expected a version id from this device');
	}
	const parsed = notebookMoveStageSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, parsed.error.issues[0]?.message ?? 'Malformed version');
	}
	const { spaceId, ...snapshot } = parsed.data;
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
	const result = await stageMovedVersion(
		locals.db,
		await createMediaStore({ platform }),
		context,
		userId,
		target,
		{ id: params.versionId, snapshot }
	);
	if (!result.ok) {
		error(result.reason === 'read-only' ? 403 : 400, result.reason);
	}
	return json({ ok: true });
};
