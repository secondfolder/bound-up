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
	/** When the first words arrived, for a streamed completion; null when not streamed. */
	firstTokenMs: number | null;
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
	choices?: {
		message?: { content?: string | null };
		delta?: { content?: string | null };
		finish_reason?: string | null;
	}[];
	usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
	error?: { message?: string; code?: number };
};

function body(request: CompletionRequest, streamed: boolean): Record<string, unknown> {
	return {
		stream: streamed,
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
		body: JSON.stringify(body(request, false)),
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
		latencyMs: Date.now() - started,
		firstTokenMs: null
	};
}

const SSE_DATA = 'data: ';

function parseChunk(line: string): ChatResponse | null {
	// OpenRouter interleaves ": OPENROUTER PROCESSING" comments; only data lines count.
	if (!line.startsWith(SSE_DATA) || line === `${SSE_DATA}[DONE]`) {
		return null;
	}
	try {
		return JSON.parse(line.slice(SSE_DATA.length)) as ChatResponse;
	} catch {
		return null;
	}
}

/**
 * One completion, streamed. `onText` gets each piece as it arrives; the
 * result is the whole, with when the first words came.
 */
export async function stream(
	request: CompletionRequest,
	onText: (text: string) => void = () => undefined
): Promise<Completion> {
	const started = Date.now();
	const response = await fetch(`${request.baseUrl}/chat/completions`, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${request.apiKey}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify(body(request, true)),
		signal: request.signal
	});
	if (!(response.ok && response.body)) {
		const data = (await response.json().catch(() => ({}))) as ChatResponse;
		const reason = data.error?.message ?? response.statusText;
		throw new Error(`OpenRouter ${response.status} for ${request.model}: ${reason}`);
	}
	const result: Completion = {
		text: '',
		provider: null,
		finishReason: null,
		usage: { promptTokens: 0, completionTokens: 0, cost: null },
		latencyMs: 0,
		firstTokenMs: null
	};
	const decoder = new TextDecoder();
	let buffer = '';
	for await (const bytes of response.body) {
		buffer += decoder.decode(bytes, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';
		for (const line of lines) {
			const chunk = parseChunk(line.trim());
			if (!chunk) {
				continue;
			}
			if (chunk.error) {
				throw new Error(
					`OpenRouter error mid-stream for ${request.model}: ${chunk.error.message ?? 'unknown'}`
				);
			}
			applyChunk(result, chunk, started, onText);
		}
	}
	result.latencyMs = Date.now() - started;
	return result;
}

function applyChunk(
	result: Completion,
	chunk: ChatResponse,
	started: number,
	onText: (text: string) => void
): void {
	result.provider = chunk.provider ?? result.provider;
	const [choice] = chunk.choices ?? [];
	const piece = choice?.delta?.content ?? '';
	if (piece) {
		result.firstTokenMs ??= Date.now() - started;
		result.text += piece;
		onText(piece);
	}
	result.finishReason = choice?.finish_reason ?? result.finishReason;
	if (chunk.usage) {
		result.usage = {
			promptTokens: chunk.usage.prompt_tokens ?? 0,
			completionTokens: chunk.usage.completion_tokens ?? 0,
			cost: chunk.usage.cost ?? null
		};
	}
}
