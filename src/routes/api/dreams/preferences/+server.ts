import { error, json } from '@sveltejs/kit';
import { saveDreamPreferencesSchema } from '$lib/schemas/dreamApi';
import { dreamsGuard } from '$lib/server/dream-api';
import {
	describeDreamRefusal,
	getDreamPreferences,
	saveDreamPreferences
} from '$lib/server/dreams';
import type { RequestHandler } from './$types';

/** The user's own preferences for every daydream, hard limits among them, sealed. */
export const GET: RequestHandler = async ({ locals }) => {
	const userId = await dreamsGuard(locals);
	return json({ preferences: await getDreamPreferences(locals.db, userId) });
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	const userId = await dreamsGuard(locals);
	const parsed = saveDreamPreferencesSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be saved. Reload and try again.');
	}
	const result = await saveDreamPreferences(locals.db, userId, parsed.data);
	if (!result.ok) {
		const { status, message } = describeDreamRefusal(result.reason);
		error(status, message);
	}
	return json({ revision: result.revision });
};
