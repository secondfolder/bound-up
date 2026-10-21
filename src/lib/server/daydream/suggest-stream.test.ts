import { describe, expect, it } from 'vitest';
import type { LiveDelta, ModelProgress } from '$lib/daydream/progress';
import type { SseEvent } from '$lib/daydream/sse';
import { ProgressGate } from './progress-gate';
import { SuggestStream } from './suggest-stream';

const chat = (fields: Record<string, unknown>): SseEvent => ({
	event: null,
	data: JSON.stringify({ id: 'gen-1', model: 'test/model', provider: 'Test', ...fields })
});
const delta = (piece: Record<string, unknown>) => chat({ choices: [{ delta: piece }] });
const DONE: SseEvent = { event: null, data: '[DONE]' };

const typed = (type: string, fields: Record<string, unknown> = {}): SseEvent => ({
	event: type,
	data: JSON.stringify({ type, ...fields })
});

/** Every event read, with what the live chat was told and the progress after each. */
function readAll(stream: SuggestStream, events: SseEvent[]) {
	const deltas: LiveDelta[] = [];
	const stages: ModelProgress['stage'][] = [];
	for (const event of events) {
		deltas.push(...stream.read(event));
		stages.push(stream.progress.stage);
	}
	return { deltas, stages };
}

describe('SuggestStream, Chat Completions', () => {
	it('puts the answer back as a call that was not streamed answers it', () => {
		const stream = new SuggestStream('chat/completions');
		const { deltas, stages } = readAll(stream, [
			delta({ reasoning: 'Hmm, ' }),
			delta({ reasoning: 'chips.' }),
			delta({ content: '{"chips":' }),
			delta({ content: '["praise"]}' }),
			chat({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
			chat({ choices: [], usage: { total_tokens: 12 } }),
			DONE
		]);
		expect(stream.end()).toEqual({
			ok: true,
			answer: {
				id: 'gen-1',
				model: 'test/model',
				provider: 'Test',
				choices: [
					{
						message: {
							role: 'assistant',
							content: '{"chips":["praise"]}',
							reasoning: 'Hmm, chips.'
						},
						finish_reason: 'stop'
					}
				],
				usage: { total_tokens: 12 }
			}
		});
		expect(deltas).toEqual([
			{ kind: 'reasoning', text: 'Hmm, ' },
			{ kind: 'reasoning', text: 'chips.' },
			{ kind: 'text', text: '{"chips":' },
			{ kind: 'text', text: '["praise"]}' }
		]);
		expect(stages).toEqual([
			'thinking',
			'thinking',
			'writing',
			'writing',
			'writing',
			'writing',
			'writing'
		]);
		expect(stream.progress).toEqual({
			stage: 'writing',
			chars: '{"chips":["praise"]}'.length,
			reasoningChars: 'Hmm, chips.'.length,
			pagesRead: 0
		});
	});

	it('starts out waiting, and skips what it cannot read', () => {
		const stream = new SuggestStream('chat/completions');
		expect(stream.progress.stage).toBe('waiting');
		readAll(stream, [{ event: null, data: 'not json' }, delta({ content: '{}' }), DONE]);
		expect(stream.end()).toMatchObject({ ok: true });
	});

	it('fails on an error partway, or a stream that stops before the answer does', () => {
		const failed = new SuggestStream('chat/completions');
		readAll(failed, [delta({ content: '{"ch' }), chat({ error: { message: 'overloaded' } })]);
		const ended = failed.end();
		expect(ended.ok).toBe(false);
		expect(!ended.ok && ended.detail).toContain('overloaded');

		const cut = new SuggestStream('chat/completions');
		readAll(cut, [delta({ content: '{"ch' })]);
		expect(cut.end()).toEqual({
			ok: false,
			detail: 'The model’s stream ended before its answer did.'
		});
	});
});

describe('SuggestStream, the Responses API', () => {
	const fetched = {
		type: 'openrouter:web_fetch',
		status: 'completed',
		url: 'https://a.test/',
		content: 'page'
	};
	const message = { type: 'message', content: [{ type: 'output_text', text: '{"ideas":[]}' }] };

	it('reads links, then writes, and answers the completed response', () => {
		const stream = new SuggestStream('responses');
		const completed = { id: 'resp-1', status: 'completed', output: [fetched, message] };
		const { deltas, stages } = readAll(stream, [
			typed('response.created', { response: { id: 'resp-1' } }),
			typed('response.output_item.added', { item: { ...fetched, status: 'in_progress' } }),
			typed('response.output_item.done', { item: fetched }),
			typed('response.reasoning_text.delta', { delta: 'Read it.' }),
			typed('response.output_item.added', { item: { ...message, content: [] } }),
			typed('response.output_text.delta', { delta: '{"ideas":' }),
			// OpenRouter's documentation's name for the same.
			typed('response.content_part.delta', { delta: '[]}' }),
			typed('response.output_item.done', { item: message }),
			typed('response.completed', { response: completed })
		]);
		expect(stream.end()).toEqual({ ok: true, answer: completed });
		expect(deltas).toEqual([
			{ kind: 'fetch', url: 'https://a.test/', status: 'completed' },
			{ kind: 'reasoning', text: 'Read it.' },
			{ kind: 'text', text: '{"ideas":' },
			{ kind: 'text', text: '[]}' }
		]);
		expect(stages).toEqual([
			'waiting',
			'reading',
			'reading',
			'thinking',
			'thinking',
			'writing',
			'writing',
			'writing',
			'writing'
		]);
		expect(stream.progress.pagesRead).toBe(1);
	});

	it('fills in the items when the final event leaves them out, under either name', () => {
		const stream = new SuggestStream('responses');
		readAll(stream, [
			typed('response.output_item.done', { item: fetched }),
			typed('response.output_item.done', { item: message }),
			typed('response.done', { response: { id: 'resp-1', status: 'completed' } })
		]);
		expect(stream.end()).toEqual({
			ok: true,
			answer: { id: 'resp-1', status: 'completed', output: [fetched, message] }
		});
	});

	it('fails on a failed response, an error event, or no response at all', () => {
		const failed = new SuggestStream('responses');
		readAll(failed, [
			typed('response.failed', { response: { status: 'failed', error: { code: 'x' } } })
		]);
		expect(failed.end().ok).toBe(false);

		const errored = new SuggestStream('responses');
		readAll(errored, [typed('error', { error: { message: 'boom' } })]);
		expect(errored.end().ok).toBe(false);

		const cut = new SuggestStream('responses');
		readAll(cut, [typed('response.output_text.delta', { delta: '{' })]);
		expect(cut.end().ok).toBe(false);
	});
});

describe('ProgressGate', () => {
	it('lets a new stage through at once, and the same stage only so often', () => {
		let now = 0;
		const gate = new ProgressGate(250, () => now);
		const at = (stage: ModelProgress['stage']) => ({
			stage,
			chars: 0,
			reasoningChars: 0,
			pagesRead: 0
		});
		expect(gate.shouldSend(at('waiting'))).toBe(true);
		now = 10;
		expect(gate.shouldSend(at('writing'))).toBe(true);
		now = 100;
		expect(gate.shouldSend(at('writing'))).toBe(false);
		now = 260;
		expect(gate.shouldSend(at('writing'))).toBe(true);
	});
});
