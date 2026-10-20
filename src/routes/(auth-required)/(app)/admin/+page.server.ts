import { requireAdmin } from '$lib/server/admin';
import { serverSettingsStatus } from '$lib/server/settings/status';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	requireAdmin(locals);
	return { status: serverSettingsStatus(locals.settings) };
};
