import { describe, expect, it } from 'vitest';
import { readReplyStream } from './stream';

/** A body that arrives in exactly these pieces, as a network might split it. */
function body(...pieces: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const piece of pieces) {
				controller.enqueue(encoder.encode(piece));
			}
			controller.close();
		}
	});
}

const event = (content: string) =>
	`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

async function read(stream: ReadableStream<Uint8Array>) {
	const pieces: string[] = [];
	const outcome = await readReplyStream(stream, (piece) => pieces.push(piece));
	return { text: pieces.join(''), pieces, outcome };
}

describe('readReplyStream', () => {
	it('joins the pieces of a reply, in order, and ends at [DONE]', async () => {
		const result = await read(
			body(event('Mara '), event('looks '), event('up.'), 'data: [DONE]\n\n', event('after'))
		);
		expect(result.text).toBe('Mara looks up.');
		expect(result.outcome).toEqual({ kind: 'done' });
	});

	it('reassembles an event split across chunks, even mid-character', async () => {
		const whole = event('café ☕');
		const bytes = new TextEncoder().encode(whole);
		// Split inside the multi-byte "é" and inside the JSON.
		const cut = whole.indexOf('é') + 1;
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(bytes.slice(0, cut));
				controller.enqueue(bytes.slice(cut, cut + 5));
				controller.enqueue(bytes.slice(cut + 5));
				controller.close();
			}
		});
		expect((await read(stream)).text).toBe('café ☕');
	});

	it("ignores OpenRouter's keep-alive comments and events with no text", async () => {
		const result = await read(
			body(
				': OPENROUTER PROCESSING\n\n',
				`data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] })}\n\n`,
				event('Hello'),
				'data: not json\n\n',
				'data: [DONE]\n\n'
			)
		);
		expect(result.pieces).toEqual(['Hello']);
	});

	it('reports a failure the provider sends partway through', async () => {
		const result = await read(
			body(event('Half a '), `data: ${JSON.stringify({ error: { message: 'overloaded' } })}\n\n`)
		);
		expect(result).toMatchObject({ text: 'Half a ', outcome: { kind: 'error' } });
	});

	it('hands the endpoint’s record of what it sent to its own callback, not the reply', async () => {
		const sent: unknown[] = [];
		const pieces: string[] = [];
		const record = { system: 'RULES', added: ['I sit.'], history: { messages: 0, chain: 'x' } };
		const outcome = await readReplyStream(
			body(
				`data: ${JSON.stringify({ boundUpSent: record })}\n\n`,
				event('Sit.'),
				'data: [DONE]\n\n'
			),
			(piece) => pieces.push(piece),
			(value) => sent.push(value)
		);
		expect(sent).toEqual([record]);
		expect(pieces.join('')).toBe('Sit.');
		expect(outcome).toEqual({ kind: 'done' });
	});

	it('hands every provider event on whole, the one that ends it in error included', async () => {
		const events: unknown[] = [];
		const reasoning = { choices: [{ delta: { reasoning: 'Hm.' } }], model: 'm' };
		const failure = { error: { message: 'overloaded' } };
		await readReplyStream(
			body(
				`data: ${JSON.stringify(reasoning)}\n\n`,
				event('Sit.'),
				`data: ${JSON.stringify(failure)}\n\n`
			),
			() => undefined,
			() => undefined,
			(value) => events.push(value)
		);
		expect(events).toEqual([reasoning, { choices: [{ delta: { content: 'Sit.' } }] }, failure]);
	});

	it('treats a stream that just ends as done', async () => {
		expect((await read(body(event('No DONE'), event(' marker')))).outcome).toEqual({
			kind: 'done'
		});
	});

	it('handles CRLF line endings', async () => {
		const crlf = `data: ${JSON.stringify({ choices: [{ delta: { content: 'ok' } }] })}\r\n\r\n`;
		expect((await read(body(crlf, 'data: [DONE]\r\n\r\n'))).text).toBe('ok');
	});
});
