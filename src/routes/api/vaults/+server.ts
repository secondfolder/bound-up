import { error, json } from '@sveltejs/kit';
import { listVaultsForUser } from '$lib/server/vaults';
import type { RequestHandler } from './$types';

/**
 * Every vault this user can reach and what they hold of each. Fetched once per
 * page load, after the identity unlocks; see `ensureVaults` in
 * `crypto/vaults.svelte.ts`. Its own endpoint rather than layout data for the
 * reason `/api/keys/unlock-bundle` gives: it is ciphertext every page would
 * otherwise carry.
 *
 * The one vault endpoint not under `/api/spaces/[spaceId]/vault`: it is every
 * space's vault at once, so there is no one space to name. Everything that
 * writes a vault names its space (docs/encryption.md, "Vaults").
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
