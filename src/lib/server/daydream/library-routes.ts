import { error, json, type RequestHandler } from '@sveltejs/kit';
import { createLibraryItemSchema, updateLibraryItemSchema } from '$lib/schemas/daydreamForm';
import {
	createLibraryItem,
	deleteLibraryItem,
	describeRefusal,
	type LibraryKind,
	updateLibraryItem
} from '$lib/server/daydreams';
import { daydreamGuard } from './guard';

/**
 * The handlers behind `api/daydreams/characters` and `api/daydreams/scenes`,
 * which differ only in which library they touch. Each record is sealed in the
 * user's own vault; the server checks the envelope, the vault and the owner.
 */

const NOT_SAVED = 'That could not be saved. Reload and try again.';

/** `POST` to the collection: a new item, under the id the browser sealed it to. */
export function createHandler(kind: LibraryKind): RequestHandler {
	return async ({ locals, request }) => {
		const userId = await daydreamGuard(locals);
		const parsed = createLibraryItemSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			error(400, NOT_SAVED);
		}
		const { id, vaultId, ciphertext, payloadVersion } = parsed.data;
		const result = await createLibraryItem(locals.db, userId, kind, {
			id,
			content: { vaultId, ciphertext, payloadVersion }
		});
		if (!result.ok) {
			const { status, message } = describeRefusal(result.reason);
			error(status, message);
		}
		return json({ revision: result.revision }, { status: 201 });
	};
}

/** `PUT` to an item: an edit, compare-and-swap on its revision. */
export function updateHandler(kind: LibraryKind): RequestHandler {
	return async ({ locals, params, request }) => {
		const userId = await daydreamGuard(locals);
		const parsed = updateLibraryItemSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			error(400, NOT_SAVED);
		}
		const { vaultId, ciphertext, payloadVersion, expectedRevision } = parsed.data;
		const result = await updateLibraryItem(locals.db, userId, kind, params.itemId ?? '', {
			content: { vaultId, ciphertext, payloadVersion },
			expectedRevision
		});
		if (!result.ok) {
			const { status, message } = describeRefusal(result.reason);
			error(status, message);
		}
		return json({ revision: result.revision });
	};
}

/** `DELETE` an item. Daydreams that picked it keep their copies. */
export function deleteHandler(kind: LibraryKind): RequestHandler {
	return async ({ locals, params }) => {
		const userId = await daydreamGuard(locals);
		if (!(await deleteLibraryItem(locals.db, userId, kind, params.itemId ?? ''))) {
			error(404, 'That is not there any more.');
		}
		return json({ ok: true });
	};
}
