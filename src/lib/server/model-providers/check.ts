import {
	ADULT_LEVELS,
	type AdultLevel,
	classifyReply,
	type ProviderKind,
	type ReplyOutcome
} from '$lib/model-providers';
import { splitOpenRouterModelId } from '$lib/model-search';
import type { Db } from '$lib/server/db';
import { type Completion, type CompletionRequest, complete } from '$lib/server/dream/openrouter';
import { probeMessages } from './probes';
import { saveCheck } from './store';

/**
 * The adult-content check (docs/server-settings.md, "Adult content by
 * provider"): every provider endpoint serving a model, asked each probe in
 * turn, mildest first, each request pinned to that endpoint with fallbacks
 * off. An endpoint's level is the highest it passed; the first refusal stops
 * its climb.
 */

export type EndpointList = (model: string) => Promise<string[]>;

const ENDPOINTS_CACHE_MS = 10 * 60_000;
const endpointsCache = new Map<string, { tags: string[]; at: number }>();

type EndpointsResponse = { data?: { endpoints?: { tag?: string; provider_name?: string }[] } };

/**
 * The endpoint tags OpenRouter lists for a model, cheapest first, each once
 * (a provider serving several quantisations has a tag for each). Cached per
 * isolate or process for ten minutes, like the model search.
 */
export function openRouterEndpoints(baseUrl: string): EndpointList {
	return async (model) => {
		const { listed } = splitOpenRouterModelId(model);
		const cached = endpointsCache.get(listed);
		if (cached && Date.now() - cached.at < ENDPOINTS_CACHE_MS) {
			return cached.tags;
		}
		const response = await fetch(`${baseUrl}/models/${listed}/endpoints`);
		if (!response.ok) {
			throw new Error(
				`OpenRouter could not list the providers for ${listed} (${response.status}). Check the model id under Language models.`
			);
		}
		const body = (await response.json()) as EndpointsResponse;
		const tags = [
			...new Set(
				(body.data?.endpoints ?? [])
					.map((endpoint) => endpoint.tag ?? endpoint.provider_name ?? '')
					.filter(Boolean)
			)
		];
		endpointsCache.set(listed, { tags, at: Date.now() });
		return tags;
	};
}

export type Complete = (request: CompletionRequest) => Promise<Completion>;

export type CheckOptions = {
	db: Db;
	apiKey: string;
	baseUrl: string;
	model: string;
	kind: ProviderKind;
	endpoints: EndpointList;
	/** The completion call; a test passes a stub. */
	complete?: Complete;
	now?: () => Date;
	/** How many endpoints are checked at once. */
	concurrency?: number;
};

export type EndpointResult = {
	provider: string;
	levelPassed: AdultLevel | null;
	outcomes: ReplyOutcome[];
	reason: string | null;
};

async function checkEndpoint(options: CheckOptions, provider: string): Promise<EndpointResult> {
	const call = options.complete ?? complete;
	const { listed } = splitOpenRouterModelId(options.model);
	const outcomes: ReplyOutcome[] = [];
	let passed: AdultLevel = 0;
	for (const { level } of ADULT_LEVELS) {
		let outcome: ReplyOutcome;
		let reason: string | null = null;
		try {
			const reply = await call({
				baseUrl: options.baseUrl,
				apiKey: options.apiKey,
				model: listed,
				messages: probeMessages(level),
				temperature: 0.7,
				maxTokens: 300,
				providers: [provider]
			});
			outcome = classifyReply(reply.text, reply.finishReason);
		} catch (error) {
			outcome = 'error';
			reason = error instanceof Error ? error.message.slice(0, 200) : 'error';
		}
		outcomes.push(outcome);
		if (outcome !== 'complied') {
			// An error before any verdict leaves the level unknown, not zero.
			const unknown = outcome === 'error' && level === 1;
			return {
				provider,
				levelPassed: unknown ? null : passed,
				outcomes,
				reason: reason ?? outcome
			};
		}
		passed = level;
	}
	return { provider, levelPassed: passed, outcomes, reason: null };
}

/** Checks every endpoint serving the model and stores what each passed. */
export async function checkModel(options: CheckOptions): Promise<EndpointResult[]> {
	const providers = await options.endpoints(options.model);
	const now = options.now ?? (() => new Date());
	const { listed } = splitOpenRouterModelId(options.model);
	const results: EndpointResult[] = [];
	let next = 0;
	const worker = async (): Promise<void> => {
		while (next < providers.length) {
			const order = next;
			next += 1;
			const provider = providers[order];
			if (!provider) {
				continue;
			}
			const result = await checkEndpoint(options, provider);
			results.push(result);
			await saveCheck(
				options.db,
				{ model: listed, kind: options.kind },
				{ provider, order, levelPassed: result.levelPassed, at: now(), reason: result.reason }
			);
		}
	};
	await Promise.all(Array.from({ length: options.concurrency ?? 4 }, worker));
	return results;
}
