import { error, json } from '@sveltejs/kit';
import { type DreamEvent, encodeEvent } from '$lib/dream/events';
import { classifyReply } from '$lib/model-providers';
import { splitOpenRouterModelId } from '$lib/model-search';
import { type DaydreamConfig, readDaydreamConfig } from '$lib/server/daydream/config';
import { hasAcceptedDisclosure } from '$lib/server/daydreams';
import { complete, streamResponses } from '$lib/server/dream/openrouter';
import type { ModelMessage } from '$lib/server/dream/prompts/core';
import { researchMessages } from '$lib/server/dream/prompts/research';
import { relay, toolEvent } from '$lib/server/dream/relay';
import { SAMPLING, type Sampling } from '$lib/server/dream/sampling';
import { requireFeature, userHasFeature } from '$lib/server/features';
import { recordOutcome, routeToBest } from '$lib/server/model-providers/store';
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

/** Where a model's requests may go: its best providers, or unpinned when it was never checked. */
async function providersFor(locals: App.Locals, model: string) {
	const { listed } = splitOpenRouterModelId(model);
	const key = { model: listed, kind: 'language' as const };
	const { checked, providers } = await routeToBest(locals.db, key, new Date());
	return {
		listed,
		checked,
		providers,
		record: (provider: string, outcome: Parameters<typeof recordOutcome>[3]) =>
			recordOutcome(locals.db, key, provider, outcome, new Date())
	};
}

/**
 * The providers a request may go to: the best tier there is
 * (`bestProviders`), so only those that passed the highest level any of the
 * model's providers passed, and all of them when none passed any. A model
 * never checked goes unpinned. One whose providers are all ruled out or
 * backing off is a 503 saying what to do.
 */
async function route(locals: App.Locals, config: DaydreamConfig) {
	const routing = await providersFor(locals, config.openrouterModelId);
	if (routing.checked && routing.providers.length === 0) {
		console.error('[dreams] every provider is ruled out or backing off');
		error(
			503,
			'No provider for the story model can take this right now. Try again in a few minutes; an admin can see why under Admin → Server settings → Language models.'
		);
	}
	return routing;
}

/** What a step may look up (docs/dreams.md, "Research"). */
export type Lookups = {
	/** Pages it may read, through OpenRouter's fetch tool: only on these sites, at most this many. */
	fetch: { hosts: string[]; maxPages: number } | null;
	/** Whether it may search the web, through OpenRouter's search tool. */
	search: boolean;
};

export type StoryCall = {
	messages: ModelMessage[];
	/** Tools the step may use; none when absent. */
	lookups?: Lookups;
} & Sampling;

/**
 * OpenRouter's fetch tool. Parallel's engine because it is the one that
 * reads reddit, which briefs link most: measured 2026-10-20 for the first
 * engine, Exa answered nothing for a subreddit, Firecrawl refuses reddit
 * outright, and OpenRouter's own fetch hands back raw RSS. Each page is cut
 * short, so a brief cannot fill the context.
 */
function webFetch(fetch: NonNullable<Lookups['fetch']>) {
	return {
		type: 'openrouter:web_fetch',
		parameters: {
			engine: 'parallel',
			max_uses: fetch.maxPages,
			max_content_tokens: 6000,
			allowed_domains: fetch.hosts
		}
	} as const;
}

/**
 * OpenRouter's search tool, on Parallel's engine for the same reason as the
 * fetch. Its `max_uses` reaches only Anthropic's own search, so the cap is
 * on results across every search instead, each cut short. A search's
 * results come with their text, so no fetch beyond the brief's own sites is
 * needed to read them: the fetch tool stays limited to those.
 */
const WEB_SEARCH = {
	type: 'openrouter:web_search',
	parameters: {
		engine: 'parallel',
		max_results: 5,
		max_total_results: 15,
		max_characters: 4000
	}
} as const;

function toolsFor(lookups: Lookups): unknown[] {
	return [
		...(lookups.fetch ? [webFetch(lookups.fetch)] : []),
		...(lookups.search ? [WEB_SEARCH] : [])
	];
}

/** Whether a step has anything to look up with. */
export function looksUp(lookups: Lookups): boolean {
	return lookups.fetch !== null || lookups.search;
}

type Send = (event: DreamEvent) => void;

/** A step that runs before the reply, sending its own events first, and decides the call. */
type Before = (send: Send, signal: AbortSignal) => Promise<StoryCall>;

/**
 * Streams a reply as the engine's events (`$lib/dream/events`). `call` may
 * instead be a step to run first (the research step), whose events go
 * before the reply's and which decides what is asked.
 */
export async function streamStory(
	event: { locals: App.Locals; platform: App.Platform | undefined; request: Request },
	userId: string,
	call: StoryCall | Before
): Promise<Response> {
	const config = dreamModel(event.locals, event.platform);
	const refused = await admit(event.locals, userId, 'story');
	if (refused) {
		return refused;
	}
	const routing = await route(event.locals, config);
	const debug = await canDebug(event.locals, userId);
	const replyTo = (resolved: StoryCall) => {
		const { lookups } = resolved;
		return relay({
			request: {
				baseUrl: config.baseUrl,
				apiKey: config.apiKey,
				messages: resolved.messages,
				temperature: resolved.temperature,
				minP: resolved.minP,
				maxTokens: resolved.maxTokens,
				// The user pressing Stop, or leaving, ends the request upstream, so a
				// reply nobody will read is not paid for to the end.
				signal: event.request.signal
			},
			listedModel: routing.listed,
			configuredModel: config.openrouterModelId,
			providers: routing.providers,
			record: routing.record,
			debug,
			...(lookups && looksUp(lookups)
				? {
						hosts: lookups.fetch?.hosts ?? [],
						stream: (request, onText, onTool) =>
							streamResponses({ ...request, tools: toolsFor(lookups) }, onText, onTool)
					}
				: {})
		});
	};
	if (typeof call !== 'function') {
		return new Response(replyTo(call), { headers: SSE_HEADERS });
	}
	return new Response(afterStep(call, replyTo, event.request.signal), { headers: SSE_HEADERS });
}

/** The events of a step run first, then the reply it decided on. */
function afterStep(
	before: Before,
	replyTo: (call: StoryCall) => ReadableStream<Uint8Array>,
	signal: AbortSignal
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	let reply: ReadableStreamDefaultReader<Uint8Array> | null = null;
	let cancelled = false;
	return new ReadableStream<Uint8Array>({
		async start(controller) {
			const send: Send = (step) => {
				if (!cancelled) {
					controller.enqueue(encoder.encode(encodeEvent(step)));
				}
			};
			let resolved: StoryCall;
			try {
				resolved = await before(send, signal);
			} catch {
				console.error('[dreams] the step before a reply failed');
				send({
					type: 'failed',
					message: 'That could not be done just now. Try again in a moment.'
				});
				controller.close();
				return;
			}
			if (cancelled) {
				return;
			}
			reply = replyTo(resolved).getReader();
			for (;;) {
				const { done, value } = await reply.read();
				if (done || cancelled) {
					break;
				}
				controller.enqueue(value);
			}
			if (!cancelled) {
				controller.close();
			}
		},
		cancel() {
			cancelled = true;
			reply?.cancel().catch(() => undefined);
		}
	});
}

/**
 * The research step, for a story model that cannot call tools
 * (docs/dreams.md, "Research"): the research model reads the brief's links
 * and searches for it, each page and search sent as it happens, and what it
 * wrote is sent as `research`. Null when it found nothing, refused, or
 * failed: the reading then goes on without, told the links could not be
 * read. Routed as the story model is, to its best providers.
 */
export async function researchFirst(
	locals: App.Locals,
	config: DaydreamConfig,
	input: { brief: string; lookups: Lookups },
	send: Send,
	signal: AbortSignal
): Promise<string | null> {
	if (!config.researchModel) {
		return null;
	}
	const routing = await providersFor(locals, config.researchModel);
	if (routing.checked && routing.providers.length === 0) {
		return null;
	}
	const [provider] = routing.providers;
	const { lookups } = input;
	try {
		const reply = await streamResponses(
			{
				baseUrl: config.baseUrl,
				apiKey: config.apiKey,
				model: provider ? routing.listed : config.researchModel,
				messages: researchMessages({
					brief: input.brief,
					canFetch: lookups.fetch !== null,
					canSearch: lookups.search
				}),
				...SAMPLING.research,
				signal,
				tools: toolsFor(lookups),
				...(provider ? { providers: [provider] } : {})
			},
			() => undefined,
			(used) => send(toolEvent(used, lookups.fetch?.hosts ?? []))
		);
		const outcome = classifyReply(reply.text, reply.finishReason);
		if (provider) {
			await routing.record(provider, outcome).catch(() => undefined);
		}
		const text = reply.text.trim();
		if (outcome !== 'complied' || text === '') {
			return null;
		}
		send({ type: 'research', text });
		return text;
	} catch {
		if (provider && !signal.aborted) {
			await routing.record(provider, 'error').catch(() => undefined);
		}
		// Not the error: an upstream message can quote the request back.
		console.error('[dreams] the research step failed');
		return null;
	}
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
	const routing = await route(event.locals, config);
	const [provider] = routing.providers;
	const debug = await canDebug(event.locals, userId);
	const request = {
		// Unchecked, unpinned, under the model as configured: see `route`.
		model: provider ? routing.listed : config.openrouterModelId,
		messages: call.messages,
		temperature: call.temperature,
		minP: call.minP,
		maxTokens: call.maxTokens,
		...(provider ? { providers: [provider] } : {})
	};
	try {
		const reply = await complete({
			baseUrl: config.baseUrl,
			apiKey: config.apiKey,
			signal: event.request.signal,
			...request
		});
		const about = {
			model: routing.listed,
			provider: provider ?? reply.provider ?? '',
			usage: reply.usage,
			latencyMs: reply.latencyMs,
			...(debug ? { request } : {})
		};
		// Only a refusal counts against a provider here: a fill's answer can
		// rightly be short (`<elements></elements>`), which a passage's cannot.
		if (classifyReply(reply.text, reply.finishReason) === 'refused') {
			if (provider) {
				await routing.record(provider, 'refused');
			}
			return failure(
				debug,
				`Refused by ${about.provider || 'the provider'}:\n${reply.text.slice(0, 2000)}`
			);
		}
		if (provider) {
			await routing.record(provider, 'complied');
		}
		return json({ text: reply.text, ...about });
	} catch (cause) {
		if (provider) {
			await routing.record(provider, 'error').catch(() => undefined);
		}
		// Not the error: an upstream message can quote the request back.
		console.error('[dreams] a fill call failed');
		return failure(debug, cause instanceof Error ? cause.message : String(cause));
	}
}

const FILL_FAILED = 'That could not be filled in just now. Try again in a moment.';

/**
 * A small call that could not be answered: a 502 the page can retry, saying
 * what went wrong only to an account that can turn on debug mode, whose page
 * shows it when debug mode is on (docs/dreams.md, "Debug mode").
 */
function failure(debug: boolean, detail: string): Response {
	return json(
		{ message: FILL_FAILED, ...(debug ? { detail: detail.slice(0, 4000) } : {}) },
		{ status: 502 }
	);
}

/**
 * Whether the account holds debug mode: the feature, not the device's
 * switch, which only decides what the page shows. It decides whether what
 * went wrong, and what was sent, come back with an answer.
 */
async function canDebug(locals: App.Locals, userId: string): Promise<boolean> {
	return await userHasFeature(locals.db, userId, 'debugMode');
}
