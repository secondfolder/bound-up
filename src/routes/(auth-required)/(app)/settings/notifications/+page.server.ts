import { error } from '@sveltejs/kit';
import { listPushDevices, readVapidConfig } from '$lib/server/push';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform, depends }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	depends('app:push-devices');

	const vapid = readVapidConfig(platform);
	return {
		// The public half only: it is what a browser subscribes with, and is
		// public by design. Null switches the whole screen to "not set up here".
		vapidPublicKey: vapid?.publicKey ?? null,
		// Without endpoints, which are capabilities — see `PushDevice`.
		devices: vapid ? await listPushDevices(locals.db, locals.user.id) : []
	};
};
