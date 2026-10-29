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

function responsesStream(): Response {
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
			event({ type: 'response.output_text.delta', delta: READING }),
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
	upstream = vi.fn((url: string) =>
		Promise.resolve(url.endsWith('/responses') ? responsesStream() : chatStream())
	);
	vi.stubGlobal('fetch', upstream);
});

afterEach(() => {
	harness.close();
	vi.unstubAllGlobals();
});

async function read(brief: string, tools: boolean) {
	const settings: Partial<Record<ServerSettingKey, string>> = {
		openrouterApiKey: 'sk-or-test',
		storyModel: JSON.stringify({
			provider: 'openrouter',
			openrouterModelId: 'test/model',
			...(tools ? { tools: true } : {})
		})
	};
	const response = await POST(
		fakeEvent({ db, user: ada, settings: testSettings(settings), json: body(brief) })
	);
	const events: DreamEvent[] = [];
	for await (const event of readEvents(response.body as ReadableStream<Uint8Array>)) {
		events.push(event);
	}
	const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
	return { events, url, sent: JSON.parse(String(init.body)) };
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
			}
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

	it('tells a model that cannot call tools that the links cannot be opened', async () => {
		const { url, sent } = await read('Like this: https://www.reddit.com/r/x/1.', false);
		expect(url).toBe('https://models.test/api/v1/chat/completions');
		expect(sent.tools).toBeUndefined();
		expect(sent.messages[0].content).toContain('You cannot open links.');
	});

	it('uses no tool for a brief with no links', async () => {
		const { url } = await read('A quiet evening.', true);
		expect(url).toBe('https://models.test/api/v1/chat/completions');
	});
});
