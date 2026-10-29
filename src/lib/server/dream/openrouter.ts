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
		// Never a provider that keeps or trains on prompts: these carry what
		// the user wrote (docs/dreams.md, "Cost, storage and privacy").
		provider: {
			data_collection: 'deny',
			...(request.providers?.length ? { order: request.providers, allow_fallbacks: false } : {})
		}
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

/** A page a tool read while the model worked: where, and whether it was read. */
export type Fetched = { url: string; ok: boolean };

type ResponsesEvent = {
	type?: string;
	delta?: string;
	item?: { type?: string; url?: string; status?: string };
	response?: {
		status?: string;
		usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
		error?: { message?: string };
	};
	error?: { message?: string };
};

/**
 * A completion through OpenRouter's Responses API, streamed, for a step
 * that uses tools (docs/dreams.md, "Research"): only its stream says what
 * each tool did, which the setup page shows. `onFetch` hears each page a
 * tool read. OpenRouter names some events differently from OpenAI
 * (`response.content_part.delta`, `response.done`), so both are read.
 */
export async function streamResponses(
	request: CompletionRequest & { tools: readonly unknown[] },
	onText: (text: string) => void = () => undefined,
	onFetch: (fetched: Fetched) => void = () => undefined
): Promise<Completion> {
	const started = Date.now();
	const response = await fetch(`${request.baseUrl}/responses`, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${request.apiKey}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			stream: true,
			model: request.model,
			input: request.messages,
			temperature: request.temperature,
			max_output_tokens: request.maxTokens,
			tools: request.tools,
			provider: {
				data_collection: 'deny',
				...(request.providers?.length ? { order: request.providers, allow_fallbacks: false } : {})
			}
		}),
		signal: request.signal
	});
	if (!(response.ok && response.body)) {
		throw new Error(`OpenRouter ${response.status} for ${request.model}`);
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
			const event = parseChunk(line.trim()) as ResponsesEvent | null;
			if (event) {
				applyResponsesEvent(result, event, started, onText, onFetch);
			}
		}
	}
	result.latencyMs = Date.now() - started;
	return result;
}

/** Output items that are the model itself, rather than a tool at work. */
const MODEL_ITEMS = new Set(['message', 'reasoning']);

function applyResponsesEvent(
	result: Completion,
	event: ResponsesEvent,
	started: number,
	onText: (text: string) => void,
	onFetch: (fetched: Fetched) => void
): void {
	const type = event.type ?? '';
	if (type === 'error' || type === 'response.error' || type === 'response.failed') {
		throw new Error(
			`OpenRouter error mid-stream: ${event.error?.message ?? event.response?.error?.message ?? 'unknown'}`
		);
	}
	const isText = type.includes('output_text') || type.includes('content_part');
	if (type.endsWith('.delta') && isText && event.delta) {
		result.firstTokenMs ??= Date.now() - started;
		result.text += event.delta;
		onText(event.delta);
		return;
	}
	if (
		type === 'response.output_item.done' &&
		event.item?.type &&
		!MODEL_ITEMS.has(event.item.type)
	) {
		onFetch({
			url: event.item.url ?? event.item.type,
			ok: event.item.status === 'completed'
		});
		return;
	}
	if (type === 'response.completed' || type === 'response.done' || type === 'response.incomplete') {
		result.finishReason = type === 'response.incomplete' ? 'length' : 'stop';
		const usage = event.response?.usage;
		if (usage) {
			result.usage = {
				promptTokens: usage.input_tokens ?? 0,
				completionTokens: usage.output_tokens ?? 0,
				cost: usage.cost ?? null
			};
		}
	}
}
