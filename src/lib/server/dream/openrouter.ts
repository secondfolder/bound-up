/**
 * A minimal OpenRouter Chat Completions client for the new daydream engine
 * and its bench. It reports which provider served each reply, because the
 * provider checks and back-off (docs/dreams.md, "Adult-friendly providers")
 * attribute every refusal to one.
 *
 * Alias-free, for the bench, so it takes its key and base URL as arguments
 * rather than reading server settings itself.
 */

import type { ModelMessage } from './prompts/core';

export type Completion = {
	text: string;
	/** The upstream provider OpenRouter routed to, e.g. "DeepInfra". */
	provider: string | null;
	finishReason: string | null;
	usage: { promptTokens: number; completionTokens: number; cost: number | null };
	latencyMs: number;
};

export type CompletionRequest = {
	baseUrl: string;
	apiKey: string;
	model: string;
	messages: readonly ModelMessage[];
	temperature?: number;
	minP?: number;
	seed?: number;
	maxTokens?: number;
	/** Restrict routing to these providers, in order (OpenRouter's `provider.order`). */
	providers?: readonly string[];
	signal?: AbortSignal;
};

type ChatResponse = {
	provider?: string;
	choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
	usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
	error?: { message?: string; code?: number };
};

function body(request: CompletionRequest): Record<string, unknown> {
	return {
		model: request.model,
		messages: request.messages,
		temperature: request.temperature,
		min_p: request.minP,
		seed: request.seed,
		max_tokens: request.maxTokens,
		usage: { include: true },
		provider: request.providers?.length
			? { order: request.providers, allow_fallbacks: false }
			: undefined
	};
}

/** One completion, not streamed. Throws with OpenRouter's own message on failure. */
export async function complete(request: CompletionRequest): Promise<Completion> {
	const started = Date.now();
	const response = await fetch(`${request.baseUrl}/chat/completions`, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${request.apiKey}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify(body(request)),
		signal: request.signal
	});
	const data = (await response.json().catch(() => ({}))) as ChatResponse;
	if (!response.ok || data.error) {
		const reason = data.error?.message ?? response.statusText;
		throw new Error(`OpenRouter ${response.status} for ${request.model}: ${reason}`);
	}
	const [choice] = data.choices ?? [];
	return {
		text: choice?.message?.content ?? '',
		provider: data.provider ?? null,
		finishReason: choice?.finish_reason ?? null,
		usage: {
			promptTokens: data.usage?.prompt_tokens ?? 0,
			completionTokens: data.usage?.completion_tokens ?? 0,
			cost: data.usage?.cost ?? null
		},
		latencyMs: Date.now() - started
	};
}
