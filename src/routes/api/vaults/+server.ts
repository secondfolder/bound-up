import { error, json } from '@sveltejs/kit';
import { createVaultSchema } from '$lib/schemas/vault';
import { createVault, listVaultsForUser } from '$lib/server/vaults';
import type { RequestHandler } from './$types';

/**
 * Every vault this user can reach and what they hold of each. Fetched once per
 * page load, after the identity unlocks; see `ensureVaults` in
 * `crypto/vaults.svelte.ts`. Its own endpoint rather than layout data for the
 * reason `/api/keys/unlock-bundle` gives: it is ciphertext every page would
 * otherwise carry.
 */
export const GET: RequestHandler = async ({ locals }) => {
	// Endpoints carry their own auth check: see /api/keys/unlock-bundle.
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const listing = await listVaultsForUser(locals.db, locals.user.id);
	if (!listing) {
		error(409, 'This account has no encryption keys.');
	}
	return json(listing);
};

/**
 * Creates a vault with a wrap for every member. 409 when the scope already has
 * one, which is a race between two devices rather than an error: the device
 * that lost fetches the listing again and opens the winner's.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const parsed = createVaultSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'Malformed request');
	}

	const result = await createVault(locals.db, locals.user.id, parsed.data);
	if (!result.ok) {
		if (result.reason === 'exists') {
			error(409, 'This already has a vault');
		}
		if (result.reason === 'invalid-wraps') {
			error(400, "A vault needs one wrap per member, made for that member's current key");
		}
		error(404, 'Not found');
	}
	return json({ ok: true }, { status: 201 });
};
