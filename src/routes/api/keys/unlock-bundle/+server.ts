import { error, json } from '@sveltejs/kit';
import { getUnlockBundle } from '$lib/server/keys';
import type { RequestHandler } from './$types';

/**
 * Everything a device needs to open the identity after signing in: the public
 * recipient and the sealed wraps. All opaque — the server cannot open any of it.
 *
 * Its own endpoint rather than fields on the app shell's layout load, because
 * in the layout it would add a D1 read and a few hundred bytes of ciphertext to
 * *every* page in the app for something needed once per sign-in.
 */
export const GET: RequestHandler = async ({ locals }) => {
	// Explicit, even though this sits under a directory that looks protected.
	// `src/routes/api/` is deliberately outside both route groups: a group guard
	// is a layout load, and layout loads never run for a `+server.ts` at all.
	// Putting these under (auth-required) would advertise protection that does
	// not exist — worse than having none, because the next reader would trust it.
	if (!locals.user) {
		error(401, 'Not signed in');
	}

	const bundle = await getUnlockBundle(locals.db, locals.user.id);
	if (!bundle) {
		// Every account is created with keys, so this is broken data rather than
		// a state to render. Loud, so it is found rather than lived with.
		error(409, 'This account has no message keys. It was created before they existed.');
	}
	return json(bundle);
};
