import { error, json } from '@sveltejs/kit';
import { restoreApplySchema, restoreDeclineSchema } from '$lib/schemas/messageForm';
import { declineHistoryRestore, restoreVaultAccess } from '$lib/server/messaging';
import type { RequestHandler } from './$types';

/**
 * Partner-assisted history restore.
 *
 * Outside both route groups on purpose — see AGENTS.md. A group guard is a
 * layout load, and layout loads never run for a `+server.ts`, so every handler
 * here opens with its own `locals.user` check and the membership test lives in
 * `server/messaging.ts`.
 *
 * Restoring is one wrap: the partnership vault, for the key the requester's
 * sign-in will give them (`restoreVaultAccess`). The helping device first
 * seals anything still in the original scheme into the vault, through
 * `../sealed-migration`, so that one wrap covers the whole history.
 */

/** Stores the wrap, closes the request, and approves the sign-in. */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}

	const parsed = restoreApplySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, parsed.error.issues[0]?.message ?? 'Malformed restore');
	}

	const result = await restoreVaultAccess(locals.db, {
		partnershipId: params.id,
		requestId: parsed.data.requestId,
		actorId: locals.user.id,
		vaultWrap: parsed.data.vaultWrap
	});

	// 404 for "not a member", "no such request" and "that request is yours"
	// all alike: distinguishing them would confirm which partnerships and
	// requests exist, and the client has nothing different to do.
	if (!result.ok) {
		error(result.reason === 'no-vault' ? 409 : 404, result.reason);
	}
	return json({ ok: true });
};

/**
 * Refuses a request.
 *
 * A real answer, not just tidiness: the partner comparing the safety number is
 * the load-bearing step in this flow, and someone who finds it does **not**
 * match needs a way to say so that leaves the requester informed rather than
 * waiting indefinitely.
 */
export const DELETE: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}

	const parsed = restoreDeclineSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, parsed.error.issues[0]?.message ?? 'Malformed request');
	}

	const done = await declineHistoryRestore(locals.db, {
		partnershipId: params.id,
		requestId: parsed.data.requestId,
		actorId: locals.user.id
	});
	if (!done) {
		error(404, 'Not found');
	}
	return json({ ok: true });
};
