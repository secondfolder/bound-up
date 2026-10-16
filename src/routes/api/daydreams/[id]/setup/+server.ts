import { error, json } from '@sveltejs/kit';
import { putSetupSchema } from '$lib/schemas/daydreamForm';
import { daydreamGuard } from '$lib/server/daydream/guard';
import { describeRefusal, updateDaydreamSetup } from '$lib/server/daydreams';
import type { RequestHandler } from './$types';

/**
 * Replaces a daydream's setup from the story page: the dials, and a limit
 * added with "Not this". The setup page saves through its own form action;
 * this is the same compare-and-swap (`updateDaydreamSetup`), for changes made
 * without leaving the story.
 */
export const PUT: RequestHandler = async ({ locals, params, request }) => {
	const userId = await daydreamGuard(locals);
	const parsed = putSetupSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be saved. Reload and try again.');
	}
	const { vaultId, ciphertext, payloadVersion, expectedRevision } = parsed.data;
	const result = await updateDaydreamSetup(locals.db, userId, params.id, {
		setup: { vaultId, ciphertext, payloadVersion },
		expectedRevision
	});
	if (!result.ok) {
		const { status, message } = describeRefusal(result.reason);
		error(status, message);
	}
	return json({ revision: expectedRevision + 1 });
};
