import { error, json } from '@sveltejs/kit';
import { saveDreamNoteSchema } from '$lib/schemas/dreamApi';
import { dreamsGuard } from '$lib/server/dream-api';
import { describeDreamRefusal, saveDreamNote } from '$lib/server/dreams';
import type { RequestHandler } from './$types';

/** Keeping detail filled in on a turn, or a scene's summary, sealed. */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const userId = await dreamsGuard(locals);
	const parsed = saveDreamNoteSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be saved. Reload and try again.');
	}
	const result = await saveDreamNote(locals.db, userId, params.id, parsed.data);
	if (!result.ok) {
		const { status, message } = describeDreamRefusal(result.reason);
		error(status, message);
	}
	return json({ ok: true }, { status: 201 });
};
