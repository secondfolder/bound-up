import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { parseKeyWrapParams } from '$lib/encryption';
import { wrapBlobField, wrapParamsField } from '$lib/schemas/keyWrap';
import { addWrap, getUnlockBundle, recordPasskeyPrfStatus } from '$lib/server/keys';
import type { RequestHandler } from './$types';

const bodySchema = z.object({
	passkeyId: z.string().min(1).max(100),
	/**
	 * Absent when the attempt proved nothing — a dismissed sheet or a dropped
	 * connection. Recording `unsupported` for those would put a permanent
	 * warning on a passkey that works; see `verdictFor` in
	 * `crypto/passkey-enrolment.ts`.
	 */
	prfStatus: z.enum(['supported', 'unsupported']).optional(),
	/** Present only when the PRF evaluation actually produced a wrap. */
	wrap: z
		.object({
			params: wrapParamsField,
			blob: wrapBlobField,
			label: z.string().max(100).optional()
		})
		.optional()
});

/**
 * Records the outcome of registering a passkey: what it can do, and the wrap
 * if it produced one.
 *
 * One endpoint rather than two, because the two writes describe one event and
 * a client that managed the first and not the second would leave a passkey
 * marked `supported` with no wrap behind it — which reads as "this unlocks your
 * messages" and does not.
 *
 * An endpoint rather than a form action, unlike the rest of this app: the
 * enrolment sequence is several browser ceremonies deep by the time it gets
 * here, has no form state to return and nothing to redirect to, and
 * `use:enhance` exists to manage exactly the things this has none of. The same
 * reasoning already put `wrap-used` and `unlock-bundle` here.
 *
 * Everything that matters happened in the browser. What arrives is what always
 * arrives — an opaque params blob and a ciphertext — so this validates their
 * shape and nothing about their meaning, which it has no way to check.
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
	const { passkeyId, prfStatus, wrap } = parsed.data;

	// Scoped to the owner inside the query, so a passkey id belonging to someone
	// else records nothing at all rather than a row against the wrong account.
	if (
		prfStatus &&
		!(await recordPasskeyPrfStatus(locals.db, locals.user.id, { passkeyId, prfStatus }))
	) {
		error(404, 'No such passkey');
	}

	if (wrap) {
		// A wrap with no identity behind it is a blob nobody can ever check
		// against anything, and it would make the list of ways to unlock a lie.
		const { recipient } = await getUnlockBundle(locals.db, locals.user.id);
		if (!recipient) {
			error(409, 'Set up encrypted messages first');
		}

		const params = parseKeyWrapParams(wrap.params);
		if (!params) {
			error(400, 'Malformed key wrap parameters');
		}

		await addWrap(locals.db, locals.user.id, {
			type: params.type,
			params,
			blob: wrap.blob,
			label: wrap.label || null
		});
	}

	return json({ ok: true });
};
