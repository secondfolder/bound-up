/**
 * How far along a model call is, for a page waiting on one: what the model
 * is doing and how much has come back. Written by the suggest endpoint as it
 * reads the provider's stream (`server/daydream/suggest-stream.ts`), and by
 * the browser from a passage's stream (`stream.ts`). Shown by
 * `ModelProgress.svelte`. See docs/daydreams.md, "Progress while it writes".
 *
 * Everyone gets this much: it says nothing of what is being written. Debug
 * mode's live chat has the words themselves (`LiveDelta`).
 *
 * Pure and alias-free.
 */

import { assertNever } from '../assert-never';

/**
 * What the model is doing: nothing back yet, reasoning, reading a link (a
 * suggestion that reads a brief's links), or writing its answer.
 */
export type ModelStage = 'waiting' | 'thinking' | 'reading' | 'writing';

export type ModelProgress = {
	stage: ModelStage;
	/** Characters of the answer so far. */
	chars: number;
	/** Characters of reasoning so far, where the provider shows it. */
	reasoningChars: number;
	/** Links read so far. */
	pagesRead: number;
};

export const WAITING: ModelProgress = {
	stage: 'waiting',
	chars: 0,
	reasoningChars: 0,
	pagesRead: 0
};

/**
 * One piece of a model call as it happens, for debug mode's live chat: a
 * piece of the answer or the reasoning, or a link read and how it went.
 */
export type LiveDelta =
	| { kind: 'text' | 'reasoning'; text: string }
	| { kind: 'fetch'; url: string; status: string };

/** The suggest endpoint's events, by name, and what each carries (`api/daydreams/suggest`). */
export type SuggestStreamEvents = {
	/** Debug mode's live chat, first: the request body sent to the model. */
	request: { body: string };
	progress: ModelProgress;
	/** Debug mode's live chat. */
	delta: LiveDelta;
	/** The answer, whole, in the shape the provider gives one that is not streamed. */
	done: unknown;
	failed: { message: string; detail?: string };
};

const count = new Intl.NumberFormat('en');

const characters = (chars: number) =>
	`${count.format(chars)} ${chars === 1 ? 'character' : 'characters'}`;

/** What a page says while it waits, in words for a person. */
export function stageLabel(progress: ModelProgress): string {
	switch (progress.stage) {
		case 'waiting':
			return 'Waiting for the model…';
		case 'thinking':
			return progress.reasoningChars > 0
				? `Thinking… ${characters(progress.reasoningChars)}`
				: 'Thinking…';
		case 'reading':
			return progress.pagesRead > 0
				? `Reading links… ${progress.pagesRead} read so far`
				: 'Reading links…';
		case 'writing':
			return `Writing… ${characters(progress.chars)}`;
		default:
			return assertNever(progress.stage, 'model stage');
	}
}
