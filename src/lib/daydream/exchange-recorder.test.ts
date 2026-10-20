import { describe, expect, it } from 'vitest';
import { EXCHANGE_LIMITS } from './exchange';
import { ExchangeRecorder, stripOwnEvent } from './exchange-recorder';

/** A body that arrives in exactly these pieces, one read at a time, then ends or fails. */
function stream(pieces: (string | Uint8Array)[], fail = false): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	const left = [...pieces];
	return new ReadableStream({
		pull(controller) {
			const piece = left.shift();
			if (piece !== undefined) {
				controller.enqueue(typeof piece === 'string' ? encoder.encode(piece) : piece);
			} else if (fail) {
				controller.error(new TypeError('network'));
			} else {
				controller.close();
			}
		}
	});
}

const REQUEST = JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'a\nb' }] });
const OWN = `data: ${JSON.stringify({ boundUpRequest: REQUEST })}\n\n`;

describe('stripOwnEvent', () => {
	it('cuts the endpoint’s own event and nothing else, however its body is spaced', () => {
		expect(stripOwnEvent(`${OWN}: comment\n\ndata: {}\n\n`)).toBe(': comment\n\ndata: {}\n\n');
		expect(stripOwnEvent('data: {}\n\n')).toBe('data: {}\n\n');
		expect(stripOwnEvent(OWN.slice(0, 20))).toBe('');
	});
});

describe('ExchangeRecorder', () => {
	it('keeps the request and every byte that arrived, split mid-character or not', async () => {
		const recorder = new ExchangeRecorder(100);
		recorder.request(REQUEST);
		const accented = new TextEncoder().encode('data: {"x":"café"}\n\n');
		recorder.capture(
			200,
			stream([OWN, accented.slice(0, 15), accented.slice(15), 'data: [DONE]\n\n'])
		);
		expect(await recorder.exchange('done', () => 400)).toEqual({
			endpoint: 'chat/completions',
			request: REQUEST,
			response: { status: 200, body: 'data: {"x":"café"}\n\ndata: [DONE]\n\n' },
			ended: 'done',
			startedAt: 100,
			endedAt: 400
		});
	});

	it('keeps what had arrived when the connection drops', async () => {
		const recorder = new ExchangeRecorder();
		recorder.request(REQUEST);
		recorder.capture(200, stream([OWN, 'data: {"a":1}\n\n'], true));
		expect((await recorder.exchange('dropped'))?.response.body).toBe('data: {"a":1}\n\n');
	});

	it('cuts a response past its cap, and says so', async () => {
		const recorder = new ExchangeRecorder();
		recorder.request(REQUEST);
		recorder.capture(200, stream(['x'.repeat(EXCHANGE_LIMITS.response + 5)]));
		const kept = await recorder.exchange('done');
		expect(kept?.response.body).toHaveLength(EXCHANGE_LIMITS.response);
		expect(kept?.response.truncated).toBe(true);
	});

	it('keeps nothing when the endpoint sent no request: not recording, or no grant', async () => {
		const recorder = new ExchangeRecorder();
		recorder.capture(200, stream(['data: {}\n\n']));
		expect(await recorder.exchange('done')).toBeNull();
	});
});
