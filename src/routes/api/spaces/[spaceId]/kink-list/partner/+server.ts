import { error, json } from '@sveltejs/kit';
import {
	describeKinkListRefusal,
	getPartnerKinkList,
	kinkListScopeIn
} from '$lib/server/kink-lists';
import type { RequestHandler } from './$types';

/**
 * The copy the other member of a shared space shares with you, sealed in its
 * vault, or `null` while they share none. Only a member gets it; a solo space
 * has no one else in it, so it is a 404 like a space you are not in.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const scope = await kinkListScopeIn(locals.db, params.spaceId, locals.user.id);
	if (!scope || scope === 'self') {
		error(404, 'Not found');
	}
	const result = await getPartnerKinkList(locals.db, locals.user.id, scope.partnershipId);
	if (!result.ok) {
		const { status, message } = describeKinkListRefusal(result.reason);
		error(status, message);
	}
	return json({ list: result.list });
};
