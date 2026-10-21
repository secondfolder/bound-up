import { describe, expect, it } from 'vitest';
import { encodeNamedEvent, readSseEvents, type SseEvent } from './sse';

/** A body that arrives in exactly these byte pieces, as a network might split it. */
function body(...pieces: Uint8Array[]): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			for (const piece of pieces) {
				controller.enqueue(piece);
			}
			controller.close();
		}
	});
}

const bytes = (text: string) => new TextEncoder().encode(text);

async function all(stream: ReadableStream<Uint8Array>): Promise<SseEvent[]> {
	const events: SseEvent[] = [];
	for await (const event of readSseEvents(stream)) {
		events.push(event);
	}
	return events;
}

describe('readSseEvents', () => {
	it('reads named and unnamed events, dropping comments', async () => {
		expect(
			await all(body(bytes(': keep-alive\n\nevent: progress\ndata: {"a":1}\n\ndata: [DONE]\n\n')))
		).toEqual([
			{ event: 'progress', data: '{"a":1}' },
			{ event: null, data: '[DONE]' }
		]);
	});

	it('reassembles an event split across chunks, even mid-character, and joins data lines', async () => {
		const whole = bytes('event: delta\ndata: {"text":"café"}\ndata: more\r\n\r\n');
		const cut = new TextDecoder().decode(whole).indexOf('é') + 1;
		expect(
			await all(body(whole.slice(0, cut), whole.slice(cut, cut + 3), whole.slice(cut + 3)))
		).toEqual([{ event: 'delta', data: '{"text":"café"}\nmore' }]);
	});

	it('ends an event the stream ends without a blank line', async () => {
		expect(await all(body(bytes('data: last')))).toEqual([{ event: null, data: 'last' }]);
	});

	it('reads back what encodeNamedEvent writes', async () => {
		const data = { message: 'line one\nline two' };
		const [event] = await all(body(bytes(encodeNamedEvent('failed', data))));
		expect(event?.event).toBe('failed');
		expect(JSON.parse(event?.data ?? '')).toEqual(data);
	});
});
