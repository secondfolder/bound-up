import { error, json, type RequestHandler } from '@sveltejs/kit';
import { helpMessages, parseHelpAnswer, sceneHelpRequestSchema } from '$lib/scenes/model-help';
import { readDaydreamConfig } from '$lib/server/daydream/config';
import { rateLimitMessage } from '$lib/server/rate-limit';
import { hasAcceptedSceneHelp } from '$lib/server/scenes/help';

/**
 * Help from the model with a scene, asked for by pressing a button: what
 * might have been missed, more story chips, or a menu. See docs/scenes.md,
 * "Help from the model".
 *
 * **One of the places the server handles what a user wrote in plaintext**,
 * under the daydreams' rules (docs/daydreams.md, "What the server sees"):
 * the person must have agreed first, the text is forwarded and the answer
 * passed back, nothing is stored, and nothing but a status code is ever
 * logged. It uses the same model and provider as daydreams, which is what
 * the admin sets up; without one, there is no help to ask for.
 *
 * Not streamed: an answer is a few short lines, quick to come, and useless
 * until it is whole.
 */

const MAX_TOKENS = 900;
const TEMPERATURE = 0.9;

export const POST: RequestHandler = async ({ locals, platform, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const userId = locals.user.id;
	const config = readDaydreamConfig(locals.settings, platform);
	if (!config) {
		error(503, 'Help from the model is not set up on this server.');
	}
	if (!(await hasAcceptedSceneHelp(locals.db, userId))) {
		error(409, 'Agree to how help from the model works first.');
	}
	const parsed = sceneHelpRequestSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be sent. Reload and try again.');
	}
	// The daydreams' suggestion limit: the same model, the same cost.
	const limited = await locals.daydreamSuggestRateLimit(userId);
	if (!limited.allowed) {
		return json(
			{ message: rateLimitMessage(limited.retryAfterSeconds) },
			{ status: 429, headers: { 'retry-after': String(limited.retryAfterSeconds) } }
		);
	}

	let upstream: Response;
	try {
		upstream = await fetch(`${config.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
			body: JSON.stringify({
				model: config.openrouterModelId,
				messages: helpMessages(parsed.data),
				max_tokens: MAX_TOKENS,
				temperature: TEMPERATURE,
				response_format: { type: 'json_object' },
				provider: { data_collection: 'deny' }
			}),
			signal: request.signal
		});
	} catch {
		// Not the error: it can carry the request.
		console.error('[scenes] the model provider could not be reached for help');
		error(502, 'The model could not be reached. Try again in a moment.');
	}
	if (!upstream.ok) {
		// The status only: the body of an error can quote the request back.
		console.error(`[scenes] the model provider answered ${upstream.status} to a request for help`);
		error(502, 'The model could not help just now. Try again in a moment.');
	}
	const body = (await upstream.json().catch(() => null)) as {
		choices?: { message?: { content?: unknown } }[];
	} | null;
	const content = body?.choices?.[0]?.message?.content;
	const answer = typeof content === 'string' ? parseHelpAnswer(parsed.data.task, content) : null;
	if (!answer) {
		console.error('[scenes] the model answered a request for help in a shape it was not asked for');
		error(502, 'The model’s answer didn’t make sense. Try again.');
	}
	return json(answer);
};
