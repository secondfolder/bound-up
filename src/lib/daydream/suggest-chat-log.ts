/**
 * The whole exchange behind a suggestion, for debug mode's chat log
 * (`SuggestChatLog.svelte`, docs/debug-mode.md): what the server sent the
 * model, and everything the model answered with — its reasoning, each page
 * it fetched, and its reply — in order.
 *
 * What was sent is only in an answer that asked for it (`debugLog` on a
 * `daydream` request), from an account holding debug mode: the suggest
 * endpoint adds it as `boundUpSent`. The rest is the provider's answer,
 * which the browser has anyway.
 *
 * Pure and alias-free.
 */

import { z } from 'zod';

/** One bubble in the log. */
export type ChatLogEntry = {
	/** Whose it is: the server's prompt, what the request added, the model's, or how it ended. */
	who: 'system' | 'user' | 'model' | 'end';
	label: string;
	text: string;
};

export type SuggestChatLog = {
	model: string;
	/** Which of OpenRouter's APIs it went to: `responses` when it read a brief's links. */
	api: string;
	entries: ChatLogEntry[];
};

const sentSchema = z.object({
	model: z.string(),
	api: z.string(),
	messages: z.array(z.object({ role: z.string(), content: z.string() }))
});

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

const json = (value: unknown) => JSON.stringify(value, null, 2) ?? String(value);

/** One output item of a Responses answer, as a bubble. An item of a shape not known here is shown whole. */
function responsesEntry(item: unknown): ChatLogEntry {
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

/** What the model answered, bubble by bubble, and how it ended. */
function answerEntries(body: unknown): ChatLogEntry[] {
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

/** One message the server sent, as a bubble. */
function sentEntry(message: { role: string; content: string }): ChatLogEntry {
	if (message.role === 'system') {
		return { who: 'system', label: 'System prompt', text: message.content };
	}
	if (message.role === 'user') {
		return { who: 'user', label: 'Sent', text: message.content };
	}
	return { who: 'model', label: message.role, text: message.content };
}

/**
 * The chat log in an answer, or null for one with nothing sent in it: an
 * account without debug mode, or a request that did not ask.
 */
export function suggestChatLog(body: unknown): SuggestChatLog | null {
	const sent = z.object({ boundUpSent: sentSchema }).safeParse(body);
	if (!sent.success) {
		return null;
	}
	const { model, api, messages } = sent.data.boundUpSent;
	return {
		model,
		api,
		entries: [...messages.map(sentEntry), ...answerEntries(body)]
	};
}
