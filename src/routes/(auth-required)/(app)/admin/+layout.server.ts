import { requireAdmin } from '$lib/server/admin';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	// A first line of defence only. Form actions run before layout loads, so
	// this does not gate them, and each page's load and every action call
	// `requireAdmin` themselves.
	requireAdmin(locals);
};
