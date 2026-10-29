/**
 * The events the engine's streaming endpoints send (docs/dreams.md,
 * "Streaming"), and reading them in the browser. Our own events rather than
 * the provider's passed through, because the server reads the reply to tell
 * a refusal from a passage and retry it elsewhere.
 *
 * - `text`: more of the reply.
 * - `restart`: what came so far was refused; drop it, another provider is
 *   writing it again.
 * - `done`: the reply is finished, and how it ended.
 * - `failed`: it could not be finished; whatever came is kept.
 * - `fetch`: a page was read for the brief (`ok`), or could not be, or was
 *   not one the brief allowed (`allowed`).
 *
 * Pure and alias-free.
 */

export type Ended = 'complete' | 'stopped' | 'refused' | 'failed';

export type DreamEvent =
	| { type: 'text'; text: string }
	| { type: 'restart'; reason: 'refused' | 'failed' }
	| { type: 'done'; ended: Ended; model: string; provider: string }
	| { type: 'failed'; message: string }
	| { type: 'fetch'; url: string; ok: boolean; allowed: boolean };

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
			return typeof event.text === 'string' ? event : null;
		case 'restart':
		case 'done':
		case 'failed':
		case 'fetch':
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
