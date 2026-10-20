import { error } from '@sveltejs/kit';
import { saveExchangeSchema } from '$lib/schemas/daydreamForm';
import { daydreamGuard } from '$lib/server/daydream/guard';
import { describeRefusal, saveExchange } from '$lib/server/daydreams';
import { requireFeature } from '$lib/server/features';
import type { RequestHandler } from './$types';

/**
 * Keeping a daydream's exchanges with the model, sealed: each request to the
 * reply endpoint and its answer, exactly as they went, for debug mode's raw
 * log (docs/debug-mode.md, "Daydreams' raw log"). Only for an account granted
 * debug mode, which the server holds it to here, since the browser's flag is
 * not something it can see inside the seal to check. The content is never
 * read: the envelope, whose daydream it is, and that its turns are in it.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const userId = await daydreamGuard(locals);
	await requireFeature(locals.db, userId, 'debugMode');
	const parsed = saveExchangeSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be saved. Reload and try again.');
	}
	const { id, turnId, parentTurnId, vaultId, ciphertext, payloadVersion } = parsed.data;
	const result = await saveExchange(locals.db, userId, params.id, {
		id,
		turnId,
		parentTurnId,
		content: { vaultId, ciphertext, payloadVersion }
	});
	if (!result.ok) {
		const { status, message } = describeRefusal(result.reason);
		error(status, message);
	}
	return new Response(null, { status: 201 });
};
