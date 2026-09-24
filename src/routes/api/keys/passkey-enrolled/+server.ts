import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { parseKeyWrapParams } from '$lib/encryption';
import { wrapBlobField, wrapParamsField } from '$lib/schemas/keyWrap';
import { addPasskeyWrap } from '$lib/server/keys';
import type { RequestHandler } from './$types';

const bodySchema = z.object({
	passkeyId: z.string().min(1).max(100),
	wrap: z.object({
		params: wrapParamsField,
		blob: wrapBlobField
	})
});

/**
 * Stores the wrap a passkey was sealed to, straight after it was registered.
 *
 * Every passkey gets exactly one — `passkey-prf` or `passkey-handle` — so this
 * refuses a password wrap, and a wrap that names a credential other than the
 * passkey's own (see `addPasskeyWrap`). If it fails, the browser deletes the
 * passkey again rather than leave one that cannot open anything.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	// See the note in ../unlock-bundle: endpoints carry their own auth check.
	if (!locals.user) {
		error(401, 'Not signed in');
	}

	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'Malformed request');
	}
	const { passkeyId, wrap } = parsed.data;

	const params = parseKeyWrapParams(wrap.params);
	if (!params || params.type === 'password') {
		error(400, 'Malformed key wrap parameters');
	}

	const stored = await addPasskeyWrap(locals.db, locals.user.id, {
		passkeyId,
		wrap: { type: params.type, params, blob: wrap.blob }
	});
	if (!stored) {
		error(404, 'No such passkey');
	}

	return json({ ok: true });
};
