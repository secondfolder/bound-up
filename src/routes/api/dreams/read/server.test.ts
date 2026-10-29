import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type DreamEvent, readEvents } from '$lib/dream/events';
import type { ReadRequest } from '$lib/dream/requests';
import { acceptDisclosure } from '$lib/server/daydreams';
import type { Db } from '$lib/server/db';
import type { ServerSettingKey } from '$lib/server-settings';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent } from '$lib/testing/events';
import { createTestUser, grantTestDreams, type TestUser } from '$lib/testing/fixtures';
import { testSettings } from '$lib/testing/settings';
import { POST } from './+server';

/**
 * Step 1 reading a brief's links (docs/dreams.md, "Research"): only with a
 * model that calls tools, only the brief's own sites, each page reported.
 * `fetch` stands in for OpenRouter.
 */

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env }));

let harness: TestDb;
let db: Db;
let ada: TestUser;
let upstream: ReturnType<typeof vi.fn>;

const READING =
	'<musts>\n- what the post is about\n</musts><spread n="2">x</spread><directions><direction p="0.5">One.</direction></directions>';

const RESEARCH = 'The post is a list of trance phrases: "deeper now", "let go".';

/** A Responses API stream: a fetch and a search, then the step's answer. */
function responsesStream(text = READING): Response {
	const event = (fields: Record<string, unknown>) => `data: ${JSON.stringify(fields)}\n\n`;
	return new Response(
		[
			event({
				type: 'response.output_item.done',
				item: {
					type: 'openrouter:web_fetch',
					url: 'https://www.reddit.com/r/x/1',
					status: 'completed'
				}
			}),
			event({
				type: 'response.output_item.done',
				item: {
					type: 'openrouter:web_search',
					status: 'completed',
					action: { type: 'search', query: 'trance phrases', sources: [] }
				}
			}),
			event({ type: 'response.output_text.delta', delta: text }),
			event({ type: 'response.completed', response: { status: 'completed' } })
		].join(''),
		{ headers: { 'content-type': 'text/event-stream' } }
	);
}

function chatStream(): Response {
	const text = `data: ${JSON.stringify({ choices: [{ delta: { content: READING } }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`;
	return new Response(text, { headers: { 'content-type': 'text/event-stream' } });
}

const body = (brief: string): ReadRequest => ({
	brief,
	amendments: [],
	answer: null,
	limits: [],
	preferences: [],
	recentDirections: [],
	nudges: []
});

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
	await grantTestDreams(db, ada.id);
	await acceptDisclosure(db, ada.id);
	env.OPENROUTER_BASE_URL = 'https://models.test/api/v1';
	upstream = vi.fn((url: string, init: RequestInit) => {
		if (!url.endsWith('/responses')) {
			return Promise.resolve(chatStream());
		}
		// The research step's answer is its analysis, not a reading.
		const researching = String(init.body).includes('You research for a writer');
		return Promise.resolve(responsesStream(researching ? RESEARCH : READING));
	});
	vi.stubGlobal('fetch', upstream);
});

afterEach(() => {
	harness.close();
	vi.unstubAllGlobals();
});

async function read(brief: string, tools: boolean, researchModel = '') {
	const settings: Partial<Record<ServerSettingKey, string>> = {
		openrouterApiKey: 'sk-or-test',
		storyModel: JSON.stringify({
			provider: 'openrouter',
			openrouterModelId: 'test/model',
			...(tools ? { tools: true } : {})
		}),
		researchModel
	};
	const response = await POST(
		fakeEvent({ db, user: ada, settings: testSettings(settings), json: body(brief) })
	);
	const events: DreamEvent[] = [];
	for await (const event of readEvents(response.body as ReadableStream<Uint8Array>)) {
		events.push(event);
	}
	const calls = upstream.mock.calls.map(([url, init]) => ({
		url: url as string,
		sent: JSON.parse(String((init as RequestInit).body))
	}));
	const [first] = calls;
	return { events, calls, url: first?.url, sent: first?.sent };
}

describe('POST /api/dreams/read', () => {
	it('reads the brief’s links with the fetch tool, only on its own sites, and says so', async () => {
		const { events, url, sent } = await read('Like this: https://www.reddit.com/r/x/1.', true);
		expect(url).toBe('https://models.test/api/v1/responses');
		expect(sent.tools).toEqual([
			{
				type: 'openrouter:web_fetch',
				parameters: {
					engine: 'parallel',
					max_uses: 5,
					max_content_tokens: 6000,
					allowed_domains: ['www.reddit.com']
				}
			},
			expect.objectContaining({ type: 'openrouter:web_search' })
		]);
		expect(sent.provider.data_collection).toBe('deny');
		expect(events.find((event) => event.type === 'fetch')).toEqual({
			type: 'fetch',
			url: 'https://www.reddit.com/r/x/1',
			ok: true,
			allowed: true
		});
		expect(events.at(-1)).toMatchObject({ type: 'done', ended: 'complete' });
	});

	it('offers a search, and says what was searched, for a brief that asks for research', async () => {
		const { events, url, sent } = await read('Research common trance phrases and use them.', true);
		expect(url).toBe('https://models.test/api/v1/responses');
		expect(sent.tools).toEqual([
			{
				type: 'openrouter:web_search',
				parameters: {
					engine: 'parallel',
					max_results: 5,
					max_total_results: 15,
					max_characters: 4000
				}
			}
		]);
		expect(sent.input[0].content).toContain('never the user’s own words');
		expect(events.find((event) => event.type === 'search')).toEqual({
			type: 'search',
			query: 'trance phrases',
			ok: true
		});
	});

	it('has the research model research first for a story model without tools', async () => {
		const { events, calls } = await read(
			'Like this: https://www.reddit.com/r/x/1.',
			false,
			'z-ai/glm-5.2'
		);
		const [research, reading] = calls;
		expect(research?.url).toBe('https://models.test/api/v1/responses');
		expect(research?.sent.model).toBe('z-ai/glm-5.2');
		expect(research?.sent.provider.data_collection).toBe('deny');
		expect(research?.sent.tools.map((tool: { type: string }) => tool.type)).toEqual([
			'openrouter:web_fetch',
			'openrouter:web_search'
		]);
		// Only the brief goes to the research model.
		expect(research?.sent.input.at(-1).content).toBe(
			'<brief>\nLike this: https://www.reddit.com/r/x/1.\n</brief>'
		);
		expect(reading?.url).toBe('https://models.test/api/v1/chat/completions');
		expect(reading?.sent.model).toBe('test/model');
		expect(reading?.sent.messages[1].content).toContain(RESEARCH);
		expect(events.map((event) => event.type).slice(0, 3)).toEqual(['fetch', 'search', 'research']);
		expect(events.find((event) => event.type === 'research')).toEqual({
			type: 'research',
			text: RESEARCH
		});
		expect(events.at(-1)).toMatchObject({ type: 'done', ended: 'complete' });
	});

	it('reads on without research when the research step fails', async () => {
		upstream.mockImplementationOnce(() => Promise.resolve(new Response('no', { status: 500 })));
		const { events, calls } = await read(
			'Like this: https://www.reddit.com/r/x/1.',
			false,
			'z-ai/glm-5.2'
		);
		expect(calls[1]?.sent.messages[0].content).toContain('You cannot open links.');
		expect(events.some((event) => event.type === 'research')).toBe(false);
		expect(events.at(-1)).toMatchObject({ type: 'done', ended: 'complete' });
	});

	it('tells a model that cannot call tools that the links cannot be opened', async () => {
		const { url, sent, calls } = await read('Like this: https://www.reddit.com/r/x/1.', false);
		expect(calls).toHaveLength(1);
		expect(url).toBe('https://models.test/api/v1/chat/completions');
		expect(sent.tools).toBeUndefined();
		expect(sent.messages[0].content).toContain('You cannot open links.');
	});

	it('uses no tool for a brief with no links', async () => {
		const { url } = await read('A quiet evening.', true);
		expect(url).toBe('https://models.test/api/v1/chat/completions');
	});
});
