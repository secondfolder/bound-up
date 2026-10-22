import { error, json } from '@sveltejs/kit';
import { createMediaStore } from '$lib/server/media/backend';
import { getEntryContext, getVersion, readVersionSnapshot } from '$lib/server/notebook';
import type { RequestHandler } from './$types';

/** One version's sealed snapshot, for previewing or restoring it. */
export const GET: RequestHandler = async ({ locals, params, platform }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const context = await getEntryContext(locals.db, params.entryId, locals.user.id);
	if (!context) {
		error(404, 'Not found');
	}
	const version = await getVersion(locals.db, context.entry.id, params.versionId);
	if (!version) {
		error(404, 'Not found');
	}
	const ciphertext = await readVersionSnapshot(
		await createMediaStore({ platform }),
		context.entry,
		version.id
	);
	if (ciphertext === null) {
		error(404, 'This version is no longer in storage');
	}
	return json({ ...version, ciphertext });
};
