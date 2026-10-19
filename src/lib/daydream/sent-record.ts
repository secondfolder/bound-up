/**
 * What a reply request actually sent the model, recorded for debug mode's
 * raw log (docs/debug-mode.md, "Daydreams' raw log").
 *
 * Every request in a story is the one before it with more on the end
 * (docs/daydreams.md, "Cost"), so a passage records only what is new: the
 * system prompt, exactly, and the messages after the last passage the model
 * was shown. The history before those would make a record too big to seal
 * (a story's context runs to 60,000 characters), so it is recorded as a
 * hash chain instead: from the previous passage's record and the passage
 * itself, the log works out what this request's history must have been if it
 * only added to the one before, and the chain says whether it was.
 *
 * The server builds the record from the messages it sends; the browser seals
 * it into the passage and checks the chain. Pure and alias-free: both sides
 * import it.
 */

import { z } from 'zod';
import { DAYDREAM_LIMITS } from '../daydream';

/** One message as the model reads it, as `server/daydream/prompt.ts` builds it. */
export type SentMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type SentRecord = {
	/** The system prompt, exactly. */
	system: string;
	/** Everything after the last passage the model was shown: what this request added. */
	added: string[];
	/** The history before `added`: how many messages, and their hash chain (`extendChain`). */
	history: { messages: number; chain: string };
	/** The system prompt or `added` ran past its cap, and only its start was kept. */
	truncated?: true;
};

/** A record as the reply endpoint sends it, before `capSent` fits it to a passage. */
const arrivedSchema = z.object({
	system: z.string(),
	added: z.array(z.string()),
	history: z.object({
		messages: z.number().int().min(0),
		chain: z.string().regex(/^[0-9a-f]{64}$/)
	})
});

/** The endpoint's record, if it is one, cut to fit a passage. */
export function readSent(value: unknown): SentRecord | null {
	const parsed = arrivedSchema.safeParse(value);
	return parsed.success ? capSent(parsed.data) : null;
}

/** The chain of an empty history: the opening's, whose request has no passage before it. */
export const EMPTY_CHAIN = '0'.repeat(64);

/**
 * `chain` extended by each of `messages` in turn, so the chain of a history
 * is the chain of everything before it extended by what came next — which is
 * what lets the log check a history it never saw whole.
 */
export async function extendChain(
	chain: string,
	messages: readonly { role: string; content: string }[]
): Promise<string> {
	let next = chain;
	for (const message of messages) {
		const bytes = new TextEncoder().encode(JSON.stringify([next, message.role, message.content]));
		const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
		next = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
	}
	return next;
}

/** The record of a request, from the messages it sent: the server's half. */
export async function recordSent(messages: readonly SentMessage[]): Promise<SentRecord> {
	const system = messages
		.filter((message) => message.role === 'system')
		.map((message) => message.content)
		.join('\n\n');
	const conversation = messages.filter((message) => message.role !== 'system');
	const lastPassage = conversation.findLastIndex((message) => message.role === 'assistant');
	const history = conversation.slice(0, lastPassage + 1);
	return {
		system,
		added: conversation.slice(lastPassage + 1).map((message) => message.content),
		history: { messages: history.length, chain: await extendChain(EMPTY_CHAIN, history) }
	};
}

/** A record cut to what a passage can seal, saying so when it was cut. */
export function capSent(record: SentRecord): SentRecord {
	let room = DAYDREAM_LIMITS.sentAdded;
	const added = record.added.map((content) => {
		const kept = content.slice(0, Math.max(0, room));
		room -= kept.length;
		return kept;
	});
	const cut =
		record.system.length > DAYDREAM_LIMITS.sentSystem ||
		added.some((content, at) => content !== record.added[at]);
	return {
		system: record.system.slice(0, DAYDREAM_LIMITS.sentSystem),
		added,
		history: record.history,
		...(cut || record.truncated ? { truncated: true } : {})
	};
}

/**
 * Whether a request only added to the one before: its history is the
 * previous request's history, what that request added, and the passage it
 * wrote, as the model was shown it. Null when it cannot be told: the
 * previous passage recorded nothing, or this record was cut.
 */
export async function appendedToPrevious(
	record: SentRecord,
	previous: { record: SentRecord; passage: string } | null
): Promise<boolean | null> {
	if (!previous) {
		return record.history.messages === 0 && record.history.chain === EMPTY_CHAIN;
	}
	if (previous.record.truncated) {
		return null;
	}
	const expected = await extendChain(previous.record.history.chain, [
		...previous.record.added.map((content) => ({ role: 'user', content })),
		{ role: 'assistant', content: previous.passage }
	]);
	return (
		record.history.chain === expected &&
		record.history.messages === previous.record.history.messages + previous.record.added.length + 1
	);
}
