import { error, json } from '@sveltejs/kit';
import { appendTurnSchema, replaceTurnSchema } from '$lib/schemas/daydreamForm';
import { appendTurn, describeRefusal, replaceLatestCharacterTurn } from '$lib/server/daydreams';
import { requireFeature } from '$lib/server/features';
import type { RequestHandler } from './$types';

/**
 * Saving a daydream's turns, sealed. See docs/daydreams.md.
 *
 * The browser seals each turn in the user's own vault — what they wrote, and
 * the character's reply once it has finished arriving — and posts it here. The
 * server checks only the envelope and whose daydream it is. Outside both route
 * groups, like every `api/` route, so it carries its own session and feature
 * checks.
 */

async function guard(locals: App.Locals): Promise<string> {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	await requireFeature(locals.db, locals.user.id, 'daydreams');
	return locals.user.id;
}

/** Adds a turn at the end of the conversation. */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const userId = await guard(locals);
	const parsed = appendTurnSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be saved. Reload and try again.');
	}
	const { id, role, vaultId, ciphertext, payloadVersion } = parsed.data;
	const result = await appendTurn(locals.db, userId, params.id, {
		id,
		role,
		content: { vaultId, ciphertext, payloadVersion }
	});
	if (!result.ok) {
		const { status, message } = describeRefusal(result.reason);
		error(status, message);
	}
	return json({ position: result.position, revision: result.revision }, { status: 201 });
};

/** Replaces the newest character turn: a retried reply. */
export const PUT: RequestHandler = async ({ locals, params, request }) => {
	const userId = await guard(locals);
	const parsed = replaceTurnSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be saved. Reload and try again.');
	}
	const { turnId, expectedRevision, vaultId, ciphertext, payloadVersion } = parsed.data;
	const result = await replaceLatestCharacterTurn(locals.db, userId, params.id, {
		turnId,
		expectedRevision,
		content: { vaultId, ciphertext, payloadVersion }
	});
	if (!result.ok) {
		const { status, message } = describeRefusal(result.reason);
		error(status, message);
	}
	return json({ revision: result.revision });
};
