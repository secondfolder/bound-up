import { redirect } from '@sveltejs/kit';
import { CONTEXT_DEPENDENCY } from '$lib/context';
import type { PageServerLoad } from './$types';

/**
 * Your own kink list follows the context switcher as the other lists do:
 * Me and Everyone show it, and a partnership shows your list for that
 * partner (`partner/[partnershipId]`), which is a page of its own, so this
 * goes there. Depends on the context, so switching here re-runs this and
 * lands on the partner's view. A view filter, as everywhere: nothing here
 * decides where anything is saved (docs/contexts.md).
 */
export const load: PageServerLoad = async ({ locals, depends }) => {
	depends(CONTEXT_DEPENDENCY);
	const [context, spaces] = await Promise.all([locals.context(), locals.contextSpaces()]);
	if (context.kind !== 'space') {
		return {};
	}
	const space = spaces.find((candidate) => candidate.spaceId === context.spaceId);
	if (space?.kind === 'shared') {
		// A partnership's space id is its own id (docs/spaces.md).
		redirect(307, `/playroom/kink-list/partner/${space.spaceId}`);
	}
	return {};
};
