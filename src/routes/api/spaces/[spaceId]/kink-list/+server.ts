import { error, json } from '@sveltejs/kit';
import { kinkListSaveSchema } from '$lib/schemas/kinkListForm';
import {
	describeKinkListRefusal,
	getKinkList,
	type KinkListScope,
	kinkListScopeIn,
	saveKinkList
} from '$lib/server/kink-lists';
import type { RequestHandler } from './$types';

/**
 * The caller's kink list in a space, sealed: their own list in their solo
 * space, the copy they share in a partnership's shared space. `GET` is what a
 * device fetches after losing a save race, to merge into; the pages get their
 * list from their own load.
 *
 * A space the caller is not in is a 404, the same as one that does not
 * exist, so a refusal never confirms an id is real. Outside both route
 * groups, like every `/api` endpoint, so each handler checks the session
 * itself.
 */

async function scopeFor(
	locals: App.Locals,
	spaceId: string
): Promise<{ userId: string; scope: KinkListScope }> {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const scope = await kinkListScopeIn(locals.db, spaceId, locals.user.id);
	if (!scope) {
		error(404, 'Not found');
	}
	return { userId: locals.user.id, scope };
}

export const GET: RequestHandler = async ({ locals, params }) => {
	const { userId, scope } = await scopeFor(locals, params.spaceId);
	const list = await getKinkList(locals.db, userId, scope);
	return json({ list });
};

export const PUT: RequestHandler = async ({ locals, params, request }) => {
	const { userId, scope } = await scopeFor(locals, params.spaceId);
	const parsed = kinkListSaveSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be saved. Reload and try again.');
	}
	const { id, vaultId, ciphertext, payloadVersion, expectedRevision, keepVersion } = parsed.data;
	const result = await saveKinkList(locals.db, userId, {
		scope,
		id,
		content: { vaultId, ciphertext, payloadVersion },
		expectedRevision,
		keepVersion: scope === 'self' && keepVersion === true
	});
	if (!result.ok) {
		const { status, message } = describeKinkListRefusal(result.reason);
		error(status, message);
	}
	return json({ revision: result.revision });
};
