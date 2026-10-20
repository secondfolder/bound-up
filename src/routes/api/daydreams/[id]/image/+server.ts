import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { DAYDREAM_LIMITS } from '$lib/daydream';
import {
	imagePromptProblem,
	PICTURE_REQUEST_HEADER,
	type PictureRequest,
	pictureWorkload,
	runwareTask
} from '$lib/daydream/image-prompt';
import { inBackground } from '$lib/server/background';
import { readImageConfig } from '$lib/server/daydream/image-config';
import { estimatePictureMs, recordPictureTiming } from '$lib/server/daydream/picture-timings';
import { hasAcceptedDisclosure, ownsDaydream } from '$lib/server/daydreams';
import { requireFeature } from '$lib/server/features';
import { rateLimitMessage } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

const requestSchema = z.object({
	prompt: z.string().min(1).max(DAYDREAM_LIMITS.imagePrompt),
	style: z.enum(['photo', 'illustrated']),
	heat: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullable()
});

/** What Runware answers, as far as this reads it. */
const runwareResponseSchema = z.object({
	data: z.array(z.object({ imageBase64Data: z.string().min(1) })).min(1)
});

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

	const parsed = requestSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be sent. Reload and try again.');
	}
	// Refused before it is counted or sent: never a request for that picture.
	if (imagePromptProblem(parsed.data.prompt) !== null) {
		error(422, 'That one can’t be pictured.');
	}

	const limited = await locals.daydreamImageRateLimit(userId);
	if (!limited.allowed) {
		return new Response(JSON.stringify({ message: rateLimitMessage(limited.retryAfterSeconds) }), {
			status: 429,
			headers: {
				'content-type': 'application/json',
				'retry-after': String(limited.retryAfterSeconds)
			}
		});
	}

	const model = config.models[parsed.data.style];
	const task = runwareTask(parsed.data, model, crypto.randomUUID());
	// Timed from here: what the estimate is for is the wait on Runware, and
	// the checks above take the same short time whatever is asked for.
	const started = Date.now();
	let upstream: Response;
	try {
		upstream = await fetch(config.baseUrl, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${config.apiKey}`,
				'content-type': 'application/json'
			},
			body: JSON.stringify([task]),
			// Leaving the page ends the request upstream too.
			signal: request.signal
		});
	} catch {
		// Not the error itself: a fetch failure's message can carry the request.
		console.error('[daydreams] the image provider could not be reached');
		error(502, 'The picture could not be made just now. Try again in a moment.');
	}
	if (!upstream.ok) {
		// The status only. The body of an error can quote the prompt back.
		console.error(`[daydreams] the image provider answered ${upstream.status}`);
		await upstream.body?.cancel();
		error(502, 'The picture could not be made just now. Try again in a moment.');
	}
	const answer = runwareResponseSchema.safeParse(await upstream.json().catch(() => null));
	if (!answer.success) {
		console.error('[daydreams] the image provider answered with no picture');
		error(502, 'The picture could not be made just now. Try again in a moment.');
	}

	// Only a picture that came counts towards how long one takes: a failure
	// is often a fast refusal, and would pull the average down.
	inBackground(
		platform,
		recordPictureTiming(
			locals.db,
			pictureWorkload(parsed.data.style, model),
			Date.now() - started
		).catch(() => {
			// One run missing from the average costs it almost nothing, so the
			// picture goes out regardless.
			console.error('[daydreams] a picture’s making time could not be recorded');
		})
	);

	const [picture] = answer.data.data;
	// `atob` rather than `Buffer`, which Workers has only with Node compatibility.
	const bytes = Uint8Array.from(atob(picture?.imageBase64Data ?? ''), (char) => char.charCodeAt(0));
	return new Response(bytes, {
		headers: {
			'content-type': 'image/webp',
			// The user's own picture, in the clear: never kept by anything between.
			'cache-control': 'no-store',
			// What the image model was asked, exactly, for debug mode's raw log
			// (`PictureRequest`): the user's own description and the server's
			// words around it, going back to the user who sent it. Encoded,
			// because a header carries no more than ASCII.
			[PICTURE_REQUEST_HEADER]: encodeURIComponent(
				JSON.stringify({
					model: task.model,
					positivePrompt: task.positivePrompt,
					negativePrompt: task.negativePrompt
				} satisfies PictureRequest)
			)
		}
	});
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
