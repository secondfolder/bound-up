/**
 * Debug mode's raw log as a conversation (docs/debug-mode.md, "Daydreams'
 * raw log"): what the model was sent before each passage, beside the reply
 * it wrote. A passage's turn shows its reply; the requests in between — the
 * opening request, "(Continue.)", a button's note, a rewrite's instructions,
 * the user's words as the model got them — have no turn of their own, so
 * they are rebuilt here, one passage at a time, from the prompt endpoint.
 */

import { SvelteMap } from 'svelte/reactivity';
import type { PromptMessage } from './client';
import type { DaydreamStory } from './story.svelte';

/** What the model was sent before one passage: its system prompt, and the messages after the last reply it saw. */
export type SentBefore = { system: string; sent: PromptMessage[] };

/**
 * The part of a prompt that is new for the passage it writes: everything
 * after the last passage the model was shown, which is the request itself.
 * The history before that is already on screen as the turns above.
 */
export function sentBefore(messages: readonly PromptMessage[]): SentBefore {
	const system = messages
		.filter((message) => message.role === 'system')
		.map((message) => message.content)
		.join('\n\n');
	const conversation = messages.filter((message) => message.role !== 'system');
	const lastReply = conversation.findLastIndex((message) => message.role === 'assistant');
	return { system, sent: conversation.slice(lastReply + 1) };
}

export type SentState = 'loading' | SentBefore | { error: string };

export class RawConversation {
	readonly #story: DaydreamStory;
	readonly #states = new SvelteMap<string, SentState>();
	/**
	 * One request at a time, in the order asked: a long story opened in the
	 * raw log asks for one per passage, and the page reads top down anyway.
	 */
	#queue: Promise<void> = Promise.resolve();

	constructor(story: DaydreamStory) {
		this.#story = story;
	}

	/** What was sent before `turnId`; undefined until `load` has been asked. */
	state(turnId: string): SentState | undefined {
		return this.#states.get(turnId);
	}

	/** Asks for it, once: a passage scrolled past and back is not asked for again. */
	load(turnId: string): void {
		if (this.#states.has(turnId)) {
			return;
		}
		this.#states.set(turnId, 'loading');
		this.#queue = this.#queue.then(async () => {
			const result = await this.#story.promptFor(turnId);
			this.#states.set(turnId, result.ok ? sentBefore(result.messages) : { error: result.error });
		});
	}
}
