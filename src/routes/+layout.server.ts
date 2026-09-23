import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	// Whitelisted rather than returning locals.user wholesale: that is the full
	// DB row and this object is serialised into the HTML of every page.
	return {
		user: locals.user
			? {
					id: locals.user.id,
					name: locals.user.name,
					email: locals.user.email,
					image: locals.user.image,
					timezone: locals.user.timezone
				}
			: null
	};
};
