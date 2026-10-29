import { error, isHttpError, json } from '@sveltejs/kit';
import { levelFor } from '$lib/dream/routing';
import { type AdultLevel, classifyReply } from '$lib/model-providers';
import { splitOpenRouterModelId } from '$lib/model-search';
import { type DaydreamConfig, readDaydreamConfig } from '$lib/server/daydream/config';
import { hasAcceptedDisclosure } from '$lib/server/daydreams';
import { complete } from '$lib/server/dream/openrouter';
import type { ModelMessage } from '$lib/server/dream/prompts/core';
import { relay } from '$lib/server/dream/relay';
import { requireFeature } from '$lib/server/features';
import { recordOutcome, routeFor } from '$lib/server/model-providers/store';
import { rateLimitMessage } from '$lib/server/rate-limit';
import { SSE_HEADERS } from '$lib/server/realtime';

/**
 * What every route of the new engine's API shares (docs/dreams.md, "What
 * the server sees"): the session and feature check, the story model, routing
 * to providers that allow what the daydream needs, and the two ways a model
 * is asked — streamed, or one short answer.
 *
 * **Where the server handles what a user wrote in plaintext.** The browser
 * posts the words the model needs, because the server cannot open the sealed
 * copies; this forwards them and the answer back. Nothing here stores, logs
 * or inspects either: a failure is logged by kind alone.
 */

/** A session, and the feature, which costs money and so is granted (`requireFeature`). */
export async function dreamsGuard(locals: App.Locals): Promise<string> {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	await requireFeature(locals.db, locals.user.id, 'dreams');
	return locals.user.id;
}

/** The story model, or a 503 when this server has none set up. */
export function dreamModel(locals: App.Locals, platform: App.Platform | undefined): DaydreamConfig {
	const config = readDaydreamConfig(locals.settings, platform);
	if (!config) {
		// The pages say so before anyone gets this far.
		error(503, 'Daydreams are not set up on this server.');
	}
	return config;
}

/**
 * The checks before a model is asked anything: the disclosure accepted, and
 * the user's limit. `kind` picks the limit: a passage or a build counts
 * against the story's replies, a small fill against suggestions.
 */
async function admit(
	locals: App.Locals,
	userId: string,
	kind: 'story' | 'fill'
): Promise<Response | null> {
	if (!(await hasAcceptedDisclosure(locals.db, userId))) {
		error(409, 'Read and accept how Daydreams works first.');
	}
	const limited = await (kind === 'story'
		? locals.daydreamRateLimit(userId)
		: locals.daydreamSuggestRateLimit(userId));
	if (limited.allowed) {
		return null;
	}
	return json(
		{ message: rateLimitMessage(limited.retryAfterSeconds) },
		{ status: 429, headers: { 'retry-after': String(limited.retryAfterSeconds) } }
	);
}

function route(locals: App.Locals, config: DaydreamConfig, level: AdultLevel) {
	const { listed } = splitOpenRouterModelId(config.openrouterModelId);
	const key = { model: listed, kind: 'language' as const };
	return {
		listed,
		providers: () => routeFor(locals.db, key, level, new Date()),
		record: (provider: string, outcome: Parameters<typeof recordOutcome>[3]) =>
			recordOutcome(locals.db, key, provider, outcome, new Date())
	};
}

export type StoryCall = {
	messages: ModelMessage[];
	/** The daydream's heat, or null before it is known. */
	heat: Parameters<typeof levelFor>[0];
	temperature: number;
	maxTokens: number;
};

/** Streams a reply as the engine's events (`$lib/dream/events`). */
export async function streamStory(
	event: { locals: App.Locals; platform: App.Platform | undefined; request: Request },
	userId: string,
	call: StoryCall
): Promise<Response> {
	const config = dreamModel(event.locals, event.platform);
	const refused = await admit(event.locals, userId, 'story');
	if (refused) {
		return refused;
	}
	const routing = route(event.locals, config, levelFor(call.heat));
	const body = relay({
		request: {
			baseUrl: config.baseUrl,
			apiKey: config.apiKey,
			messages: call.messages,
			temperature: call.temperature,
			maxTokens: call.maxTokens,
			// The user pressing Stop, or leaving, ends the request upstream, so a
			// reply nobody will read is not paid for to the end.
			signal: event.request.signal
		},
		listedModel: routing.listed,
		configuredModel: config.openrouterModelId,
		providers: await routing.providers(),
		record: routing.record
	});
	return new Response(body, { headers: SSE_HEADERS });
}

/**
 * One short answer, for the small calls between passages. A refusal or a
 * failure is a 502 the page can retry; it is credited to the provider, the
 * same as a passage's.
 */
export async function askOnce(
	event: { locals: App.Locals; platform: App.Platform | undefined; request: Request },
	userId: string,
	call: StoryCall
): Promise<Response> {
	const config = dreamModel(event.locals, event.platform);
	const refused = await admit(event.locals, userId, 'fill');
	if (refused) {
		return refused;
	}
	const routing = route(event.locals, config, levelFor(call.heat));
	const [provider] = await routing.providers();
	try {
		const reply = await complete({
			baseUrl: config.baseUrl,
			apiKey: config.apiKey,
			model: provider ? routing.listed : config.openrouterModelId,
			messages: call.messages,
			temperature: call.temperature,
			maxTokens: call.maxTokens,
			signal: event.request.signal,
			...(provider ? { providers: [provider] } : {})
		});
		// Only a refusal counts against a provider here: a fill's answer can
		// rightly be short (`<elements></elements>`), which a passage's cannot.
		if (classifyReply(reply.text, reply.finishReason) === 'refused') {
			if (provider) {
				await routing.record(provider, 'refused');
			}
			error(502, 'That could not be filled in just now. Try again in a moment.');
		}
		if (provider) {
			await routing.record(provider, 'complied');
		}
		return json({ text: reply.text });
	} catch (cause) {
		if (isHttpError(cause)) {
			throw cause;
		}
		if (provider) {
			await routing.record(provider, 'error').catch(() => undefined);
		}
		// Not the error: an upstream message can quote the request back.
		console.error('[dreams] a fill call failed');
		error(502, 'That could not be filled in just now. Try again in a moment.');
	}
}
