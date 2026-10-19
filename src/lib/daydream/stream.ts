/**
 * Reading a reply as it arrives.
 *
 * The reply endpoint passes OpenRouter's server-sent events through untouched
 * (see its comment for why), so this is a reader for the OpenAI-compatible
 * stream format: `data: {json}` events, each carrying a piece of the reply in
 * `choices[0].delta.content`, ending with `data: [DONE]`. OpenRouter also
 * sends `: comment` lines to keep the connection open, and an error that
 * happens mid-reply arrives as an event with an `error` field rather than as
 * an HTTP status, because the status was sent long before.
 *
 * Pure: it takes bytes and calls back with text, so it is tested without a
 * network. `EventSource` cannot be used, because it can only send a GET.
 */

export type StreamOutcome =
	/** The stream said it was done, or simply ended. */
	| { kind: 'done' }
	/** The provider reported a failure partway through. */
	| { kind: 'error' };

const LINE_BREAK = /\r?\n/;

type StreamEvent = {
	choices?: { delta?: { content?: unknown } }[];
	error?: unknown;
	/** The reply endpoint's own event, first, for debug mode: what it sent the model. */
	boundUpSent?: unknown;
};

/**
 * Feeds every piece of reply text in `body` to `onText`, in order, and says
 * how the stream ended. Rejects only as the read does: an abort, or the
 * connection dropping.
 */
export async function readReplyStream(
	body: ReadableStream<Uint8Array>,
	onText: (piece: string) => void,
	/** Given the endpoint's record of what it sent, when it was asked for one. */
	onSent: (record: unknown) => void = () => undefined
): Promise<StreamOutcome> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffered = '';
	try {
		for (;;) {
			const { done, value } = await reader.read();
			buffered += done ? decoder.decode() : decoder.decode(value, { stream: true });
			// Events end at a blank line; a line may arrive split across chunks,
			// so only complete lines are handled and the rest waits.
			const lines = buffered.split(LINE_BREAK);
			buffered = done ? '' : (lines.pop() ?? '');
			for (const line of lines) {
				const outcome = handleLine(line, onText, onSent);
				if (outcome) {
					return outcome;
				}
			}
			if (done) {
				return { kind: 'done' };
			}
		}
	} finally {
		reader.releaseLock();
	}
}

function handleLine(
	line: string,
	onText: (piece: string) => void,
	onSent: (record: unknown) => void
): StreamOutcome | null {
	if (!line.startsWith('data:')) {
		// Blank separators, `: keep-alive` comments, `event:` and `id:` fields.
		return null;
	}
	const data = line.slice('data:'.length).trim();
	if (data === '[DONE]') {
		return { kind: 'done' };
	}
	let event: StreamEvent;
	try {
		event = JSON.parse(data) as StreamEvent;
	} catch {
		// Not an event this reader understands; the rest of the reply still is.
		return null;
	}
	if (event.boundUpSent !== undefined) {
		onSent(event.boundUpSent);
		return null;
	}
	if (event.error) {
		return { kind: 'error' };
	}
	const piece = event.choices?.[0]?.delta?.content;
	if (typeof piece === 'string' && piece !== '') {
		onText(piece);
	}
	return null;
}
