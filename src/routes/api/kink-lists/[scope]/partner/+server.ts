import { error, json, type RequestHandler } from '@sveltejs/kit';
import { describeKinkListRefusal, getPartnerKinkList } from '$lib/server/kink-lists';
import { isClientId } from '$lib/vault';

/**
 * The copy your partner shares with you in a partnership, sealed in its vault,
 * or `null` while they share none. Only a member of the partnership gets it.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	if (!(params.scope && isClientId(params.scope))) {
		error(404, 'Not found');
	}
	const result = await getPartnerKinkList(locals.db, locals.user.id, params.scope);
	if (!result.ok) {
		const { status, message } = describeKinkListRefusal(result.reason);
		error(status, message);
	}
	return json({ list: result.list });
};
