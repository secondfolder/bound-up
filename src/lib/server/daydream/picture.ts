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
import type { ImageConfig } from '$lib/server/daydream/image-config';
import { recordPictureTiming } from '$lib/server/daydream/picture-timings';
import { rateLimitMessage } from '$lib/server/rate-limit';

/**
 * Making one picture, for both daydream engines (docs/daydreams.md and
 * docs/dreams.md, "Pictures"): the description is checked for anything that
 * puts a minor in the picture before anything is counted or sent
 * (`imagePromptProblem`), the request itself anchors everyone as an adult
 * (`runwareTask`), and the picture goes back to the browser, which encrypts
 * and stores it. The caller has checked the session, the feature, the
 * daydream's owner and the disclosure.
 *
 * Like a passage, the description passes through in plaintext and nothing is
 * stored, logged or inspected beyond the check: errors are logged by status.
 */

export const pictureRequestSchema = z.object({
	prompt: z.string().min(1).max(DAYDREAM_LIMITS.imagePrompt),
	style: z.enum(['photo', 'illustrated']),
	heat: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullable()
});

export type PictureBody = z.output<typeof pictureRequestSchema>;

/** What Runware answers, as far as this reads it. */
const runwareResponseSchema = z.object({
	data: z.array(z.object({ imageBase64Data: z.string().min(1) })).min(1)
});

export async function pictureResponse(
	{
		locals,
		platform,
		request
	}: { locals: App.Locals; platform: App.Platform | undefined; request: Request },
	userId: string,
	config: ImageConfig
): Promise<Response> {
	const parsed = pictureRequestSchema.safeParse(await request.json().catch(() => null));
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
}
