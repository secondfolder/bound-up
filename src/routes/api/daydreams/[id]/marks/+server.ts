import { error, json } from '@sveltejs/kit';
import { createMarkSchema } from '$lib/schemas/daydreamForm';
import { daydreamGuard } from '$lib/server/daydream/guard';
import { createMark, deleteMark, describeRefusal } from '$lib/server/daydreams';
import { isClientId } from '$lib/vault';
import type { RequestHandler } from './$types';

/** Bookmarks and reactions on a daydream's turns, sealed. See docs/daydreams.md, "Marks". */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const userId = await daydreamGuard(locals);
	const parsed = createMarkSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be saved. Reload and try again.');
	}
	const { id, turnId, vaultId, ciphertext, payloadVersion } = parsed.data;
	const result = await createMark(locals.db, userId, params.id, {
		id,
		turnId,
		content: { vaultId, ciphertext, payloadVersion }
	});
	if (!result.ok) {
		const { status, message } = describeRefusal(result.reason);
		error(status, message);
	}
	return json({ ok: true }, { status: 201 });
};

/** Removes one, by `?id=`. */
export const DELETE: RequestHandler = async ({ locals, params, url }) => {
	const userId = await daydreamGuard(locals);
	const markId = url.searchParams.get('id') ?? '';
	if (!isClientId(markId)) {
		error(400, 'That could not be removed. Reload and try again.');
	}
	if (!(await deleteMark(locals.db, userId, params.id, markId))) {
		error(404, 'That is not there any more.');
	}
	return json({ ok: true });
};
