import { fail, message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { confirmRecoveryEmailSchema } from '$lib/schemas/accountRecovery';
import { confirmRecoveryEmail } from '$lib/server/recovery';
import type { Actions, PageServerLoad } from './$types';

/**
 * Where the link emailed by a partner-assisted sign-in lands: the half that
 * proves the requester holds the account's address. See
 * docs/account-recovery.md.
 *
 * Loading the page changes nothing — mail scanners open links to look at them
 * — so it only offers a button, and the token travels in the link's fragment,
 * which never reaches this server until the button posts it.
 */
export const load: PageServerLoad = async () => ({
	confirmForm: await superValidate(zod4(confirmRecoveryEmailSchema))
});

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const confirmForm = await superValidate(request, zod4(confirmRecoveryEmailSchema));
		// A malformed token gets the same answer as an unknown one: the link is
		// simply not one that works any more.
		if (!confirmForm.valid) {
			return fail(400, { confirmForm });
		}
		const result = await confirmRecoveryEmail(locals.db, confirmForm.data.token);
		return message(confirmForm, result);
	}
};
