import { error, json } from '@sveltejs/kit';
import { vaultWrapField } from '$lib/schemas/vault';
import { putVaultWrap } from '$lib/server/vaults';
import type { RequestHandler } from './$types';

/**
 * Wraps a vault's key for one member who has no usable wrap: none yet, or one
 * made for a key they no longer have. See `putVaultWrap` for why a wrap that
 * already opens cannot be replaced by anyone but its owner.
 */
export const PUT: RequestHandler = async ({ locals, params, request }) => {
	// Endpoints carry their own auth check: see /api/keys/unlock-bundle.
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const parsed = vaultWrapField.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'Malformed request');
	}

	const result = await putVaultWrap(locals.db, locals.user.id, params.id, parsed.data);
	if (!result.ok) {
		if (result.reason === 'invalid-wrap') {
			error(400, "A wrap must be for a member of the vault, made for that member's current key");
		}
		if (result.reason === 'current') {
			error(409, 'That member already has a wrap that opens this vault');
		}
		error(404, 'Not found');
	}
	return json({ ok: true });
};
