import { describe, expect, it, vi } from 'vitest';
import { type DreamEvent, readEvents } from '../../dream/events';
import type { ReplyOutcome } from '../../model-providers';
import type { Completion, CompletionRequest } from './openrouter';
import { relay } from './relay';

/**
 * The relay's routing (docs/dreams.md, "Adult-friendly providers"): one
 * endpoint per attempt, a refusal retried once elsewhere, words that arrived
 * kept on a failure, and each outcome credited to its endpoint.
 */

const PROSE = 'They close the door behind them, and the evening is theirs alone, slowly.';

type Script = Record<string, { text: string; fail?: 'before' | 'after'; finish?: string }>;

function stubStream(script: Script) {
	return vi.fn((request: CompletionRequest, onText: (text: string) => void = () => undefined) => {
		const provider = request.providers?.[0] ?? 'unpinned';
		const step = script[provider] ?? { text: PROSE };
		if (step.fail === 'before') {
			return Promise.reject(new Error('upstream 503'));
		}
		for (const word of step.text.split(' ')) {
			onText(`${word} `);
		}
		if (step.fail === 'after') {
			return Promise.reject(new Error('dropped'));
		}
		return Promise.resolve<Completion>({
			text: step.text,
			provider: 'Upstream',
			finishReason: step.finish ?? 'stop',
			usage: { promptTokens: 1, completionTokens: 1, cost: 0 },
			latencyMs: 1,
			firstTokenMs: 1
		});
	});
}

async function run(providers: string[], script: Script) {
	const recorded: [string, ReplyOutcome][] = [];
	const stream = stubStream(script);
	const body = relay({
		request: { baseUrl: 'https://openrouter.test', apiKey: 'k', messages: [] },
		listedModel: 'z-ai/glm-5.2',
		configuredModel: 'z-ai/glm-5.2@preset/nsfw',
		providers,
		record: (provider, outcome) => {
			recorded.push([provider, outcome]);
			return Promise.resolve();
		},
		stream
	});
	const events: DreamEvent[] = [];
	for await (const event of readEvents(body)) {
		events.push(event);
	}
	// A restart shows as "|", so a test can see what came before and after it.
	const pieces: Record<DreamEvent['type'], (event: DreamEvent) => string> = {
		text: (event) => (event.type === 'text' ? event.text : ''),
		restart: () => '|',
		done: () => '',
		failed: () => '',
		fetch: () => '',
		search: () => '',
		research: () => '',
		audio: () => '',
		words: () => ''
	};
	const text = events
		.map((event) => pieces[event.type](event))
		.join('')
		.trim();
	return { events, text, recorded, stream };
}

describe('relay', () => {
	it('streams a reply from the first provider and credits it', async () => {
		const { events, text, recorded, stream } = await run(['open/fp8', 'spare/fp8'], {});
		expect(text).toBe(PROSE);
		expect(events.at(-1)).toEqual({
			type: 'done',
			ended: 'complete',
			model: 'z-ai/glm-5.2',
			provider: 'open/fp8'
		});
		expect(recorded).toEqual([['open/fp8', 'complied']]);
		expect(stream.mock.calls[0]?.[0]).toMatchObject({
			model: 'z-ai/glm-5.2',
			providers: ['open/fp8']
		});
	});

	it('retries a refusal on the next provider, telling the page to start again', async () => {
		const { events, text, recorded } = await run(['prude/fp4', 'open/fp8'], {
			'prude/fp4': { text: "I'm sorry, but I can't write that." }
		});
		expect(events.filter((event) => event.type === 'restart')).toEqual([
			{ type: 'restart', reason: 'refused' }
		]);
		expect(text.split('|').at(-1)?.trim()).toBe(PROSE);
		expect(recorded).toEqual([
			['prude/fp4', 'refused'],
			['open/fp8', 'complied']
		]);
	});

	it('says a refusal was the end when no provider is left', async () => {
		const { events } = await run(['prude/fp4'], {
			'prude/fp4': { text: "I'm sorry, but I can't write that." }
		});
		expect(events.at(-1)).toMatchObject({ type: 'done', ended: 'refused' });
	});

	it('tries the next provider when one fails before any words', async () => {
		const { events, recorded } = await run(['down/fp8', 'open/fp8'], {
			'down/fp8': { text: '', fail: 'before' }
		});
		expect(events.at(-1)).toMatchObject({ type: 'done', provider: 'open/fp8' });
		expect(recorded[0]).toEqual(['down/fp8', 'error']);
	});

	it('keeps the words when a stream drops part way', async () => {
		const { events, text } = await run(['open/fp8', 'spare/fp8'], {
			'open/fp8': { text: PROSE, fail: 'after' }
		});
		expect(text).toBe(PROSE);
		expect(events.at(-1)).toMatchObject({ type: 'failed' });
		expect(events.some((event) => event.type === 'restart')).toBe(false);
	});

	it('says a passage stopped short when the provider ran out of room', async () => {
		const { events } = await run(['open/fp8'], { 'open/fp8': { text: PROSE, finish: 'length' } });
		expect(events.at(-1)).toMatchObject({ type: 'done', ended: 'stopped' });
	});

	it('goes unpinned, under the configured model, when no provider has been checked', async () => {
		const { recorded, stream } = await run([], {});
		expect(recorded).toEqual([]);
		const [request] = stream.mock.calls[0] ?? [];
		expect(request?.model).toBe('z-ai/glm-5.2@preset/nsfw');
		expect(request?.providers).toBeUndefined();
	});

	it('passes on each page a tool read, saying whether the brief allowed it, and each search', async () => {
		const events: DreamEvent[] = [];
		const body = relay({
			request: { baseUrl: 'https://openrouter.test', apiKey: 'k', messages: [] },
			listedModel: 'm',
			configuredModel: 'm',
			providers: [],
			record: () => Promise.resolve(),
			hosts: ['example.org'],
			stream: (_request, onText, onTool) => {
				onTool({ kind: 'fetch', url: 'https://example.org/a', ok: true });
				onTool({ kind: 'fetch', url: 'https://evil.test/?q=x', ok: true });
				onTool({ kind: 'search', query: 'obedience captions', ok: true });
				onText(PROSE);
				return Promise.resolve({
					text: PROSE,
					provider: 'p',
					finishReason: 'stop',
					usage: { promptTokens: 1, completionTokens: 1, cost: 0 },
					latencyMs: 1,
					firstTokenMs: 1
				});
			}
		});
		for await (const event of readEvents(body)) {
			events.push(event);
		}
		expect(events.filter((event) => event.type === 'fetch')).toEqual([
			{ type: 'fetch', url: 'https://example.org/a', ok: true, allowed: true },
			{ type: 'fetch', url: 'https://evil.test/?q=x', ok: true, allowed: false }
		]);
		expect(events.filter((event) => event.type === 'search')).toEqual([
			{ type: 'search', query: 'obedience captions', ok: true }
		]);
	});
});
