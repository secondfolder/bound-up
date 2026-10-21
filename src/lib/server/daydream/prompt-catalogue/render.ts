import type { Combo, RenderedPrompt } from '$lib/prompt-review';
import { buildMessages, replyRequestSchema } from '../prompt';
import { buildSuggestMessages, suggestRequestSchema } from '../suggest-prompt';
import type { BuilderId } from './axes';
import { placeholderText, replyInput, suggestInput, type TextSource } from './fixtures';

export type RenderResult =
	| { ok: true; prompt: RenderedPrompt }
	/** A combination no device could send: its request fails the endpoint's own schema. */
	| { ok: false; problem: string };

/**
 * One combination through the real builder. The input is held to the same
 * schema the endpoint parses a request with first, so the catalogue never
 * reviews a prompt that could not be sent, and the defaults the schema fills
 * in are the ones the endpoint would see.
 */
export function renderPrompt(
	builder: BuilderId,
	combo: Combo,
	text: TextSource = placeholderText
): RenderResult {
	if (builder === 'reply') {
		const { request, pictures } = replyInput(combo, text);
		const parsed = replyRequestSchema.safeParse(request);
		if (!parsed.success) {
			return { ok: false, problem: problemOf(parsed.error.issues) };
		}
		return {
			ok: true,
			prompt: { messages: buildMessages(parsed.data, { pictures }), params: { pictures } }
		};
	}
	const { request, canReadLinks } = suggestInput(builder, combo, text);
	const parsed = suggestRequestSchema.safeParse(request);
	if (!parsed.success) {
		return { ok: false, problem: problemOf(parsed.error.issues) };
	}
	const { messages, maxTokens, temperature, readLinks } = buildSuggestMessages(parsed.data, {
		canReadLinks
	});
	return { ok: true, prompt: { messages, params: { maxTokens, temperature, readLinks } } };
}

function problemOf(issues: readonly { path: PropertyKey[]; message: string }[]): string {
	return issues
		.map((issue) => `${issue.path.join('.') || '(request)'}: ${issue.message}`)
		.join('; ');
}

/**
 * A prompt as one text, for hashing, diffing and reading: its settings, then
 * each message under a heading naming its role. Line-oriented on purpose, so
 * a diff of two of them reads as a diff of the prompt.
 */
export function promptText(prompt: RenderedPrompt): string {
	const params = Object.entries(prompt.params)
		.map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
		.join('\n');
	const messages = prompt.messages.map(
		(message, index) => `===== ${index + 1}. ${message.role} =====\n${message.content}`
	);
	return [`===== settings =====\n${params}`, ...messages].join('\n\n');
}
