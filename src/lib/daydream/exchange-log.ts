/**
 * Reading an exchange with the model as a chat log, for debug mode
 * (docs/debug-mode.md): the request as it was sent — the system prompt,
 * every message, the parameters — and what came back — the model's
 * reasoning, each page it fetched, its reply, and how it ended.
 *
 * One reader for both places an exchange is shown: a daydream's raw log,
 * which keeps each request and its server-sent events verbatim
 * (`exchange.ts`), and the new-daydream page's suggestions, whose answer is
 * a whole JSON body (Chat Completions, or the Responses API when it read a
 * brief's links). It runs when the log is drawn, never when an exchange is
 * kept, so reading more out of an answer shows more of every exchange
 * already kept. What it does not recognise it shows whole rather than drop,
 * and the exact text is always there beside it.
 *
 * Pure and alias-free.
 */

import { z } from 'zod';
import { type SetupExchange, setupExchangeAnswer } from './setup-exchange';

/** One bubble in the log. */
export type LogEntry = {
	/** Whose it is: the server's prompt, a message sent, the model's, how it ended, or the request's settings. */
	who: 'system' | 'user' | 'model' | 'end' | 'settings';
	label: string;
	text: string;
};

/** A log with its heading: the model asked for, and which of OpenRouter's APIs it went to. */
export type ExchangeLogView = {
	model: string;
	api: string;
	entries: LogEntry[];
};

/** One message as it was sent. Content that is not a string (parts, tool results) is shown as JSON. */
export type SentMessage = { role: string; content: string };

/** A request body, read: its messages and every other setting it carried. */
export type ParsedRequest = {
	model: string;
	api: 'chat/completions' | 'responses';
	messages: SentMessage[];
	/** Everything but the messages: model, token limit, temperature, provider, tools… */
	settings: Record<string, unknown>;
};

const json = (value: unknown) => JSON.stringify(value, null, 2) ?? String(value);

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const messageSchema = z.object({ role: z.string(), content: z.unknown() });

/** A request body as the server sent it, or null for one that is not JSON with messages. */
export function parseRequest(request: string): ParsedRequest | null {
	let value: unknown;
	try {
		value = JSON.parse(request);
	} catch {
		return null;
	}
	if (!isObject(value)) {
		return null;
	}
	// Chat Completions sends `messages`; the Responses API, `input`.
	const api = Array.isArray(value.input) ? 'responses' : 'chat/completions';
	const list = api === 'responses' ? value.input : value.messages;
	if (!Array.isArray(list)) {
		return null;
	}
	const messages = list.flatMap((item) => {
		const parsed = messageSchema.safeParse(item);
		if (!parsed.success) {
			return [];
		}
		const { role, content } = parsed.data;
		return [{ role, content: typeof content === 'string' ? content : json(content) }];
	});
	const { messages: _messages, input: _input, ...settings } = value;
	return {
		model: typeof value.model === 'string' ? value.model : '(no model)',
		api,
		messages,
		settings
	};
}

/** One message sent, as a bubble. */
export function sentEntry(message: SentMessage): LogEntry {
	if (message.role === 'system') {
		return { who: 'system', label: 'System prompt', text: message.content };
	}
	if (message.role === 'user') {
		return { who: 'user', label: 'Sent', text: message.content };
	}
	if (message.role === 'assistant') {
		return { who: 'model', label: 'Sent back as the model’s', text: message.content };
	}
	return { who: 'user', label: `Sent as ${message.role}`, text: message.content };
}

/** The request's settings, as a bubble of their own. */
export function settingsEntry(request: ParsedRequest): LogEntry {
	return { who: 'settings', label: 'Settings', text: json(request.settings) };
}

/**
 * How much of `current`'s history is `previous` sent again: the number of
 * messages, from the start, the two have in common, and whether every one of
 * `previous`'s was among them — as each request in a story should be the one
 * before it with more on the end (docs/daydreams.md, "Cost"). Compared
 * exactly, message by message, where a passage's own `sent` record could
 * only compare hashes.
 */
export function historyAgainst(
	current: ParsedRequest,
	previous: ParsedRequest | null
): { shared: number; appended: boolean } {
	if (!previous) {
		return { shared: 0, appended: true };
	}
	let shared = 0;
	while (
		shared < current.messages.length &&
		shared < previous.messages.length &&
		current.messages[shared]?.role === previous.messages[shared]?.role &&
		current.messages[shared]?.content === previous.messages[shared]?.content
	) {
		shared += 1;
	}
	return { shared, appended: shared === previous.messages.length };
}

// ── a streamed answer ────────────────────────────────────────────────────────

/** The reasoning in one streamed delta: `reasoning`, or failing that its typed pieces. */
function reasoningIn(delta: Record<string, unknown>): { text: string; hidden: number } {
	if (typeof delta.reasoning === 'string') {
		// OpenRouter sends the same again in `reasoning_details`: read once.
		return { text: delta.reasoning, hidden: 0 };
	}
	if (!Array.isArray(delta.reasoning_details)) {
		return { text: '', hidden: 0 };
	}
	let text = '';
	let hidden = 0;
	for (const detail of delta.reasoning_details) {
		if (!isObject(detail)) {
			continue;
		}
		if (detail.type === 'reasoning.text' && typeof detail.text === 'string') {
			text += detail.text;
		} else if (detail.type === 'reasoning.summary' && typeof detail.summary === 'string') {
			text += detail.summary;
		} else if (detail.type === 'reasoning.encrypted') {
			hidden += 1;
		}
	}
	return { text, hidden };
}

/** The fields of a streamed event this reader takes something from; any other is shown whole. */
const KNOWN_EVENT_FIELDS = new Set([
	'id',
	'object',
	'created',
	'model',
	'provider',
	'choices',
	'usage',
	'system_fingerprint',
	'error'
]);

const LINE_BREAK = /\r?\n/;

/**
 * A reply's server-sent events, as the model sent them: everything it
 * reasoned, said and called, and how it ended. Every event is read, in
 * order, so a field that arrives in pieces arrives whole.
 */
export function streamEntries(body: string): LogEntry[] {
	let reasoning = '';
	let hiddenReasoning = 0;
	let reply = '';
	const toolCalls: unknown[] = [];
	const unknown: unknown[] = [];
	const ending: Record<string, unknown> = {};
	let events = 0;
	let comments = 0;
	let done = false;
	let error: unknown = null;
	for (const line of body.split(LINE_BREAK)) {
		if (line.startsWith(':')) {
			comments += 1;
			continue;
		}
		if (!line.startsWith('data:')) {
			continue;
		}
		const data = line.slice('data:'.length).trim();
		if (data === '[DONE]') {
			done = true;
			continue;
		}
		let event: unknown;
		try {
			event = JSON.parse(data);
		} catch {
			unknown.push(data);
			continue;
		}
		events += 1;
		if (!isObject(event)) {
			unknown.push(event);
			continue;
		}
		if (Object.keys(event).some((key) => !KNOWN_EVENT_FIELDS.has(key))) {
			unknown.push(event);
		}
		for (const key of ['model', 'provider', 'id'] as const) {
			if (typeof event[key] === 'string') {
				ending[key] = event[key];
			}
		}
		if (event.usage !== undefined && event.usage !== null) {
			ending.usage = event.usage;
		}
		if (event.error !== undefined && event.error !== null) {
			({ error } = event);
		}
		const choice = Array.isArray(event.choices) ? event.choices[0] : undefined;
		if (!isObject(choice)) {
			continue;
		}
		for (const key of ['finish_reason', 'native_finish_reason'] as const) {
			if (typeof choice[key] === 'string') {
				ending[key] = choice[key];
			}
		}
		const { delta } = choice;
		if (!isObject(delta)) {
			continue;
		}
		const thought = reasoningIn(delta);
		reasoning += thought.text;
		hiddenReasoning += thought.hidden;
		if (typeof delta.content === 'string') {
			reply += delta.content;
		}
		if (Array.isArray(delta.tool_calls)) {
			toolCalls.push(...delta.tool_calls);
		}
	}
	const hidden =
		hiddenReasoning > 0
			? `\n\n(${hiddenReasoning} more ${hiddenReasoning === 1 ? 'piece' : 'pieces'}, encrypted by the provider.)`
			: '';
	return [
		...(reasoning || hidden
			? [{ who: 'model' as const, label: 'Reasoning', text: (reasoning + hidden).trim() }]
			: []),
		{ who: 'model', label: 'Reply', text: reply || '(no reply)' },
		...(toolCalls.length > 0
			? [{ who: 'model' as const, label: 'Tool calls', text: json(toolCalls) }]
			: []),
		...unknown.map(
			(event): LogEntry => ({ who: 'model', label: 'An event not read here', text: json(event) })
		),
		...(error === null ? [] : [{ who: 'end' as const, label: 'Error', text: json(error) }]),
		{
			who: 'end',
			label: endingLabel(ending),
			text: json({
				...ending,
				events,
				keepAliveComments: comments,
				saidDone: done
			})
		}
	];
}

/** "How it ended", with why it stopped and who answered, where the stream said. */
function endingLabel(ending: Record<string, unknown>): string {
	const parts = [
		typeof ending.finish_reason === 'string' ? `stopped: ${ending.finish_reason}` : null,
		typeof ending.model === 'string' ? ending.model : null,
		typeof ending.provider === 'string' ? `via ${ending.provider}` : null
	].filter((part) => part !== null);
	return parts.length > 0 ? `How it ended: ${parts.join(' · ')}` : 'How it ended';
}

// ── a whole answer ───────────────────────────────────────────────────────────

const chatSchema = z.object({
	choices: z
		.array(
			z.object({
				message: z.object({
					content: z.string().nullable().optional(),
					reasoning: z.string().nullable().optional()
				}),
				finish_reason: z.string().nullable().optional()
			})
		)
		.min(1),
	usage: z.unknown().optional()
});

const responsesSchema = z.object({
	output: z.array(z.unknown()),
	status: z.unknown().optional(),
	incomplete_details: z.unknown().optional(),
	error: z.unknown().optional(),
	usage: z.unknown().optional()
});

const textParts = z.array(z.object({ text: z.string().optional() })).optional();

const reasoningItem = z.object({
	type: z.literal('reasoning'),
	summary: textParts,
	content: textParts
});

const fetchItem = z.object({
	type: z.literal('openrouter:web_fetch'),
	url: z.string(),
	status: z.string().optional(),
	httpStatus: z.number().optional(),
	title: z.string().optional(),
	content: z.string().optional(),
	error: z.string().optional()
});

const messageItem = z.object({
	type: z.literal('message'),
	content: z.array(z.object({ type: z.string(), text: z.string().optional() }))
});

const joined = (parts: z.output<typeof textParts>) =>
	(parts ?? []).flatMap((part) => (part.text ? [part.text] : [])).join('\n\n');

/** One output item of a Responses answer, as a bubble. An item of a shape not known here is shown whole. */
function responsesEntry(item: unknown): LogEntry {
	const reasoning = reasoningItem.safeParse(item);
	if (reasoning.success) {
		// The full text where the provider gives it, else its summary; a model
		// whose reasoning is encrypted gives neither.
		const text = joined(reasoning.data.content) || joined(reasoning.data.summary);
		return { who: 'model', label: 'Reasoning', text: text || '(not shown by the provider)' };
	}
	const fetched = fetchItem.safeParse(item);
	if (fetched.success) {
		const { url, status, httpStatus, title, content, error } = fetched.data;
		const outcome = [
			status ?? 'no status',
			httpStatus === undefined ? null : `HTTP ${httpStatus}`,
			title ? `“${title}”` : null
		]
			.filter((part) => part !== null)
			.join(' · ');
		return {
			who: 'model',
			label: `Fetched ${url} (${outcome})`,
			text: content || error || '(nothing came back)'
		};
	}
	const message = messageItem.safeParse(item);
	if (message.success) {
		return {
			who: 'model',
			label: 'Reply',
			text: message.data.content.flatMap((part) => (part.text ? [part.text] : [])).join('')
		};
	}
	const type = z.object({ type: z.string() }).safeParse(item);
	return { who: 'model', label: type.success ? type.data.type : 'Output', text: json(item) };
}

/** A whole JSON answer, bubble by bubble, and how it ended. */
export function answerEntries(body: unknown): LogEntry[] {
	const chat = chatSchema.safeParse(body);
	if (chat.success) {
		const [choice] = chat.data.choices;
		const { content, reasoning } = choice?.message ?? {};
		return [
			...(reasoning ? [{ who: 'model' as const, label: 'Reasoning', text: reasoning }] : []),
			{ who: 'model', label: 'Reply', text: content ?? '(no reply)' },
			{
				who: 'end',
				label: 'How it ended',
				text: json({ finish_reason: choice?.finish_reason ?? null, usage: chat.data.usage ?? null })
			}
		];
	}
	const responses = responsesSchema.safeParse(body);
	if (responses.success) {
		const { output, status, incomplete_details, error, usage } = responses.data;
		return [
			...output.map(responsesEntry),
			{
				who: 'end',
				label: 'How it ended',
				text: json({
					status: status ?? null,
					incomplete_details: incomplete_details ?? null,
					error: error ?? null,
					usage: usage ?? null
				})
			}
		];
	}
	return [{ who: 'model', label: 'The answer, in a shape not read here', text: json(body) }];
}

// ── the two logs ─────────────────────────────────────────────────────────────

/**
 * A suggestion's log, from its answer, or null for one with no request in
 * it: an account without debug mode, or a request that did not ask. The
 * suggest endpoint adds the request body it sent as `boundUpRequest`.
 */
export function suggestionLog(answer: unknown): ExchangeLogView | null {
	if (!isObject(answer) || typeof answer.boundUpRequest !== 'string') {
		return null;
	}
	const request = parseRequest(answer.boundUpRequest);
	if (!request) {
		return null;
	}
	const { boundUpRequest: _request, ...body } = answer;
	return {
		model: request.model,
		api: request.api,
		entries: [...request.messages.map(sentEntry), settingsEntry(request), ...answerEntries(body)]
	};
}

/**
 * A setup exchange's log (`setup-exchange.ts`): the answer it kept, read as
 * the new-daydream page read it when the draft was written.
 */
export function setupExchangeLog(exchange: SetupExchange): ExchangeLogView | null {
	return suggestionLog(setupExchangeAnswer(exchange));
}
