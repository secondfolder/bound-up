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
