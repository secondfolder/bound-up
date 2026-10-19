import { error } from '@sveltejs/kit';
import { getKinkList, getPartnerKinkList } from '$lib/server/kink-lists';
import { getPartnershipForUser } from '$lib/server/partnerships';
import type { LayoutServerLoad } from './$types';

/**
 * Your kink list for one partner: your copy for them, if you share one, and
 * theirs for you, if they do. Both are sealed in the partnership's vault.
 * A partnership the user is not in, or one still pending, is a 404, as on the
 * partner page.
 */
export const load: LayoutServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const partnership = await getPartnershipForUser(locals.db, params.partnershipId, locals.user.id);
	if (partnership?.status !== 'accepted') {
		error(404, 'Partner not found');
	}
	const [mine, theirs] = await Promise.all([
		getKinkList(locals.db, locals.user.id, { partnershipId: partnership.id }),
		getPartnerKinkList(locals.db, locals.user.id, partnership.id)
	]);
	return {
		partnershipId: partnership.id,
		names: partnership.names,
		mine,
		theirs: theirs.ok ? theirs.list : null
	};
};
