import { error, json } from '@sveltejs/kit';
import { restoreApplySchema, restoreDeclineSchema } from '$lib/schemas/messageForm';
import { declineHistoryRestore, escrowForRestore, restoreVaultAccess } from '$lib/server/messaging';
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
 * sign-in will give them (`restoreVaultAccess`). Everything in the partnership
 * is sealed in that vault, so one wrap covers the whole history.
 */

/**
 * The requester's own-vault escrow held in this partnership, for the helping
 * partner to open their half of and pass on. `{ escrow: null }` when there is
 * none — they had no own vault, or it was never held with this partner.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const requestId = url.searchParams.get('requestId');
	if (!requestId) {
		error(400, 'Which request?');
	}
	const result = await escrowForRestore(locals.db, {
		partnershipId: params.id,
		requestId,
		actorId: locals.user.id
	});
	if (!result) {
		error(404, 'Not found');
	}
	return json(result);
};

/** Stores the wrap and any escrow relay, closes the request, and approves the sign-in. */
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
		vaultWrap: parsed.data.vaultWrap,
		escrowRelay: parsed.data.escrowRelay
	});

	// 404 for "not a member", "no such request" and "that request is yours"
	// all alike: distinguishing them would confirm which partnerships and
	// requests exist, and the client has nothing different to do.
	if (!result.ok) {
		error(result.reason === 'no-such-request' ? 404 : 409, result.reason);
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
