import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { pictureWorkload } from '$lib/daydream/image-prompt';
import { readImageConfig } from '$lib/server/daydream/image-config';
import { pictureResponse } from '$lib/server/daydream/picture';
import { estimatePictureMs } from '$lib/server/daydream/picture-timings';
import { hasAcceptedDisclosure, ownsDaydream } from '$lib/server/daydreams';
import { requireFeature } from '$lib/server/features';
import type { RequestHandler } from './$types';

/**
 * Makes a passage's picture (docs/daydreams.md, "Pictures"), and sends it
 * back to the browser, which encrypts and stores it.
 *
 * **Like `../reply`, it handles what the user's story says in plaintext**: the
 * description the model wrote goes through here to Runware, and the picture
 * comes back through here. Nothing is stored, logged or inspected beyond the
 * check below: errors are logged by status alone. The user has accepted all
 * this with the Daydreams disclosure (`hasAcceptedDisclosure`), which covers
 * pictures as it covers passages.
 *
 * Before anything is sent, a description that puts a minor in the picture is
 * refused (`imagePromptProblem`), whatever the model was told; and the request
 * itself (`runwareTask`) anchors everyone in it as an adult and keeps the
 * image model away from anything youthful.
 */
export const POST: RequestHandler = async ({ locals, params, platform, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const userId = locals.user.id;
	await requireFeature(locals.db, userId, 'daydreams');

	const config = readImageConfig(locals.settings, platform);
	if (!config) {
		// The page offers no pictures on such a server, so this is a stale page.
		error(503, 'Pictures are not set up on this server.');
	}
	if (!(await ownsDaydream(locals.db, userId, params.id))) {
		error(404, 'That daydream is not there any more.');
	}
	if (!(await hasAcceptedDisclosure(locals.db, userId))) {
		error(409, 'Read and accept how Daydreams works first.');
	}

	return await pictureResponse({ locals, platform, request }, userId, config);
};

const estimateQuery = z.object({ style: z.enum(['photo', 'illustrated']) });

/**
 * How long a picture in this style usually takes here, for the progress ring
 * (`picture-timings.ts`): `{ estimateMs }`, null until one has been made.
 * Asked alongside the POST, never before it, so the picture waits on nothing.
 *
 * Not checked against the daydream's owner, as the POST is: the answer is
 * about the server's model, not about this daydream, and the extra query
 * would buy nothing.
 */
export const GET: RequestHandler = async ({ locals, platform, url }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	await requireFeature(locals.db, locals.user.id, 'daydreams');
	const config = readImageConfig(locals.settings, platform);
	if (!config) {
		error(503, 'Pictures are not set up on this server.');
	}
	const parsed = estimateQuery.safeParse({ style: url.searchParams.get('style') });
	if (!parsed.success) {
		error(400, 'That could not be sent. Reload and try again.');
	}
	const { style } = parsed.data;
	const estimateMs = await estimatePictureMs(
		locals.db,
		pictureWorkload(style, config.models[style])
	);
	return Response.json({ estimateMs });
};
