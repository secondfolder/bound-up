import { error, fail } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { adminRoleFormSchema } from '$lib/schemas/adminRoleForm';
import { featureGrantFormSchema } from '$lib/schemas/featureGrantForm';
import { getAdminUserDetail, requireAdmin } from '$lib/server/admin';
import { grantFeature, revokeFeature } from '$lib/server/features';
import type { Actions, PageServerLoad } from './$types';

// Two superforms on one page, told apart by id.
const FEATURE_FORM_ID = 'features';
const ROLE_FORM_ID = 'role';

export const load: PageServerLoad = async ({ locals, params }) => {
	const admin = requireAdmin(locals);
	const account = await getAdminUserDetail(locals.db, params.id);
	if (!account) {
		error(404, 'No such account');
	}

	return {
		account,
		isSelf: account.id === admin.id,
		featureForm: await superValidate(zod4(featureGrantFormSchema), { id: FEATURE_FORM_ID }),
		roleForm: await superValidate(zod4(adminRoleFormSchema), { id: ROLE_FORM_ID })
	};
};

/** The action's target, or a 404 — checked before anything is written for it. */
async function requireAccount(locals: App.Locals, id: string) {
	const account = await getAdminUserDetail(locals.db, id);
	if (!account) {
		error(404, 'No such account');
	}
	return account;
}

export const actions: Actions = {
	grantFeature: async ({ locals, params, request }) => {
		const admin = requireAdmin(locals);
		const featureForm = await superValidate(request, zod4(featureGrantFormSchema), {
			id: FEATURE_FORM_ID
		});
		if (!featureForm.valid) {
			return fail(400, { featureForm });
		}
		const account = await requireAccount(locals, params.id);

		await grantFeature(locals.db, {
			userId: account.id,
			feature: featureForm.data.feature,
			grantedByUserId: admin.id
		});
		return { featureForm };
	},

	revokeFeature: async ({ locals, params, request }) => {
		requireAdmin(locals);
		const featureForm = await superValidate(request, zod4(featureGrantFormSchema), {
			id: FEATURE_FORM_ID
		});
		if (!featureForm.valid) {
			return fail(400, { featureForm });
		}
		const account = await requireAccount(locals, params.id);

		await revokeFeature(locals.db, account.id, featureForm.data.feature);
		return { featureForm };
	},

	setRole: async ({ locals, params, request }) => {
		const admin = requireAdmin(locals);
		const roleForm = await superValidate(request, zod4(adminRoleFormSchema), { id: ROLE_FORM_ID });
		if (!roleForm.valid) {
			return fail(400, { roleForm });
		}
		const account = await requireAccount(locals, params.id);

		// Refused rather than confirmed: an admin who demotes themselves may be
		// the only one, and then nobody can make another. Another admin can do it.
		if (account.id === admin.id && roleForm.data.role !== 'admin') {
			return setError(roleForm, '', 'You cannot remove your own admin access.');
		}

		try {
			// Through Better Auth rather than a direct update, so the plugin's own
			// `set-role` permission check applies as well as ours.
			await locals.auth.api.setRole({
				body: { userId: account.id, role: roleForm.data.role },
				headers: request.headers
			});
		} catch (caught) {
			if (caught instanceof APIError) {
				return setError(roleForm, '', caught.body?.message ?? 'Could not change the role');
			}
			console.error(caught);
			return setError(roleForm, '', 'Could not change the role');
		}
		return { roleForm };
	}
};
