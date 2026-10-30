/**
 * The events the engine's streaming endpoints send (docs/dreams.md,
 * "Streaming"), and reading them in the browser. Our own events rather than
 * the provider's passed through, because the server reads the reply to tell
 * a refusal from a passage and retry it elsewhere.
 *
 * - `text`: more of the reply.
 * - `thinking`: more of the model's thinking before or between its words,
 *   shown while it works and never kept.
 * - `restart`: what came so far was refused; drop it, another provider is
 *   writing it again.
 * - `done`: the reply is finished, and how it ended.
 * - `failed`: it could not be finished; whatever came is kept.
 * - `fetch`: a page was read for the brief (`ok`), or could not be, or was
 *   not one the brief allowed (`allowed`).
 * - `search`: the web was searched for the brief, with what query.
 * - `research`: what a separate research step found, for a story model that
 *   cannot call tools; it is kept as the daydream's research as written.
 *
 * Speech (`/api/dreams/speak`, docs/dreams.md, "Read aloud") streams on the
 * same terms, ending with `done` or `failed`:
 *
 * - `audio`: more of the clip, base64, to be joined in order.
 * - `words`: the latest timings for one of the provider's chunks of text
 *   (`seq`), in seconds from the clip's start, replacing any before.
 *
 * Pure and alias-free.
 */

export type Ended = 'complete' | 'stopped' | 'refused' | 'failed';

/** A reply's tokens and cost, as the provider reported them. */
export type ReplyUsage = {
	promptTokens: number;
	cachedTokens: number;
	completionTokens: number;
	cost: number | null;
};

export type DreamEvent =
	| { type: 'text'; text: string }
	| { type: 'thinking'; text: string }
	| { type: 'restart'; reason: 'refused' | 'failed' }
	| {
			type: 'done';
			ended: Ended;
			model: string;
			provider: string;
			/** What it cost, and how much of the prompt the provider's cache served. */
			usage?: ReplyUsage;
			latencyMs?: number;
	  }
	| {
			type: 'failed';
			message: string;
			/** What went wrong, only for an account that can turn on debug mode. */
			detail?: string;
	  }
	/** The request as it went to the model, only for an account that can turn on debug mode. */
	| {
			type: 'exchange';
			request: unknown;
			/** A request before the reply's own: the research step's. */
			step?: 'research';
	  }
	| { type: 'fetch'; url: string; ok: boolean; allowed: boolean }
	| { type: 'search'; query: string; ok: boolean }
	| { type: 'research'; text: string }
	| { type: 'audio'; data: string }
	| { type: 'words'; seq: number; words: { text: string; start: number; end: number }[] };

/** One event as server-sent-event bytes. */
export function encodeEvent(event: DreamEvent): string {
	const { type, ...data } = event;
	return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

const LINE_BREAK = /\r?\n/;

function decode(name: string, data: string): DreamEvent | null {
	let value: unknown;
	try {
		value = JSON.parse(data);
	} catch {
		return null;
	}
	if (typeof value !== 'object' || value === null) {
		return null;
	}
	const event = { type: name, ...value } as DreamEvent;
	switch (event.type) {
		case 'text':
		case 'thinking':
		case 'research':
			return typeof event.text === 'string' ? event : null;
		case 'audio':
			return typeof event.data === 'string' ? event : null;
		case 'words':
			return Array.isArray(event.words) ? event : null;
		case 'restart':
		case 'done':
		case 'failed':
		case 'fetch':
		case 'search':
		case 'exchange':
			return event;
		default:
			return null;
	}
}

/**
 * Every event in a response body, in order, as each is complete. Rejects
 * only as the read does: an abort, or the connection dropping.
 */
export async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<DreamEvent> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffered = '';
	let name = '';
	let data: string[] = [];
	try {
		for (;;) {
			const { done, value } = await reader.read();
			buffered += done ? decoder.decode() : decoder.decode(value, { stream: true });
			const lines = buffered.split(LINE_BREAK);
			buffered = done ? '' : (lines.pop() ?? '');
			if (done) {
				lines.push('');
			}
			for (const line of lines) {
				if (line === '') {
					const event = data.length > 0 ? decode(name, data.join('\n')) : null;
					if (event) {
						yield event;
					}
					name = '';
					data = [];
				} else if (line.startsWith('event:')) {
					name = line.slice('event:'.length).trim();
				} else if (line.startsWith('data:')) {
					data.push(line.slice('data:'.length).trimStart());
				}
			}
			if (done) {
				return;
			}
		}
	} finally {
		reader.releaseLock();
	}
}
