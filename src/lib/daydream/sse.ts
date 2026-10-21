/**
 * Server-sent events read from a body, for the two places a stream is read
 * that `EventSource` cannot: it only sends a GET, and both are POSTs. The
 * suggest endpoint reads the model provider's stream with it, and the
 * browser reads the suggest endpoint's (`client.ts`).
 *
 * Only what both need: an event's `event:` name and its `data:` lines,
 * joined, with comments (`: keep-alive`) dropped. Pure, and alias-free.
 */

/** One event: its name, when it had one, and its data. */
export type SseEvent = { event: string | null; data: string };

const LINE_BREAK = /\r?\n/;
/** The one space a field's value may start with, which is not part of it. */
const LEADING_SPACE = /^ /;

/**
 * Every event in `body`, in order, as each one is complete. A line split
 * across chunks waits for the rest of it. Rejects only as the read does: an
 * abort, or the connection dropping.
 */
export async function* readSseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffered = '';
	let name: string | null = null;
	let data: string[] = [];
	try {
		for (;;) {
			const { done, value } = await reader.read();
			buffered += done ? decoder.decode() : decoder.decode(value, { stream: true });
			const lines = buffered.split(LINE_BREAK);
			buffered = done ? '' : (lines.pop() ?? '');
			// A stream that simply ends still ends its last event.
			if (done) {
				lines.push('');
			}
			for (const line of lines) {
				if (line === '') {
					if (data.length > 0) {
						yield { event: name, data: data.join('\n') };
					}
					name = null;
					data = [];
				} else if (line.startsWith('data:')) {
					data.push(line.slice('data:'.length).replace(LEADING_SPACE, ''));
				} else if (line.startsWith('event:')) {
					name = line.slice('event:'.length).trim();
				}
				// Anything else is a `: comment`, an `id:` or a `retry:`, which nothing here reads.
			}
			if (done) {
				return;
			}
		}
	} finally {
		reader.releaseLock();
	}
}

/** One event as the suggest endpoint writes it: a name and a JSON body, on one line each. */
export function encodeNamedEvent(event: string, data: unknown): string {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
