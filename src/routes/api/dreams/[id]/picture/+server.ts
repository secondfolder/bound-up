import { error } from '@sveltejs/kit';
import { readImageConfig } from '$lib/server/daydream/image-config';
import { pictureResponse } from '$lib/server/daydream/picture';
import { hasAcceptedDisclosure } from '$lib/server/daydreams';
import { dreamsGuard } from '$lib/server/dream-api';
import { ownsDream } from '$lib/server/dreams';
import type { RequestHandler } from './$types';

/**
 * Makes a `<picture>` (docs/dreams.md, "Pictures"), described from the
 * elements' appearance fields, and sends it back to the browser, which
 * encrypts and stores it. The same path as the first engine's pictures
 * (`pictureResponse`): checked for anything coded as a minor before it is
 * counted or sent, and nothing stored or logged here.
 */
export const POST: RequestHandler = async ({ locals, params, platform, request }) => {
	const userId = await dreamsGuard(locals);
	const config = readImageConfig(locals.settings, platform);
	if (!config) {
		// The page offers no pictures on such a server, so this is a stale page.
		error(503, 'Pictures are not set up on this server.');
	}
	if (!(await ownsDream(locals.db, userId, params.id))) {
		error(404, 'That daydream is not there any more.');
	}
	if (!(await hasAcceptedDisclosure(locals.db, userId))) {
		error(409, 'Read and accept how Daydreams works first.');
	}
	return await pictureResponse({ locals, platform, request }, userId, config);
};
