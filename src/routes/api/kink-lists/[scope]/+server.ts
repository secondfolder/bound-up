import { error, json, type RequestHandler } from '@sveltejs/kit';
import { kinkListSaveSchema } from '$lib/schemas/kinkListForm';
import {
	describeKinkListRefusal,
	getKinkList,
	type KinkListScope,
	saveKinkList
} from '$lib/server/kink-lists';
import { isClientId } from '$lib/vault';

/**
 * A kink list, sealed: `self` for your own, a partnership id for the copy you
 * share there. `GET` is what a device fetches after losing a save race, to
 * merge into; the pages get their list from their own load. The `api/` routes
 * sit outside the route groups, so each checks the session itself.
 */

function signedIn(locals: App.Locals): string {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	return locals.user.id;
}

function scopeFrom(param: string | undefined): KinkListScope {
	if (param === 'self') {
		return 'self';
	}
	if (param && isClientId(param)) {
		return { partnershipId: param };
	}
	error(404, 'Not found');
}

export const GET: RequestHandler = async ({ locals, params }) => {
	const userId = signedIn(locals);
	const list = await getKinkList(locals.db, userId, scopeFrom(params.scope));
	return json({ list });
};

export const PUT: RequestHandler = async ({ locals, params, request }) => {
	const userId = signedIn(locals);
	const scope = scopeFrom(params.scope);
	const parsed = kinkListSaveSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be saved. Reload and try again.');
	}
	const { id, vaultId, ciphertext, payloadVersion, expectedRevision, keepVersion } = parsed.data;
	const result = await saveKinkList(locals.db, userId, {
		scope,
		id,
		content: { vaultId, ciphertext, payloadVersion },
		expectedRevision,
		keepVersion: scope === 'self' && keepVersion === true
	});
	if (!result.ok) {
		const { status, message } = describeKinkListRefusal(result.reason);
		error(status, message);
	}
	return json({ revision: result.revision });
};
