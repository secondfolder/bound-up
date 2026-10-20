import { describe, expect, it } from 'vitest';
import {
	historyAgainst,
	parseRequest,
	sentEntry,
	streamEntries,
	suggestionLog
} from './exchange-log';

const event = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const delta = (value: object, more: object = {}) => event({ choices: [{ delta: value }], ...more });

const request = (messages: { role: string; content: unknown }[], more: object = {}) =>
	JSON.stringify({ model: 'test/model', messages, max_tokens: 1200, ...more });

describe('parseRequest', () => {
	it('reads the messages and keeps every other setting', () => {
		const parsed = parseRequest(
			request(
				[
					{ role: 'system', content: 'RULES' },
					{ role: 'user', content: [{ type: 'text', text: 'parts' }] }
				],
				{ temperature: 0.9 }
			)
		);
		expect(parsed).toMatchObject({ model: 'test/model', api: 'chat/completions' });
		expect(parsed?.messages[0]).toEqual({ role: 'system', content: 'RULES' });
		// Content that is not a string is shown as it was, as JSON.
		expect(parsed?.messages[1]?.content).toContain('"text": "parts"');
		expect(parsed?.settings).toEqual({ model: 'test/model', max_tokens: 1200, temperature: 0.9 });
	});

	it('reads a Responses request’s input, and nothing that is not a request', () => {
		expect(parseRequest(JSON.stringify({ model: 'm', input: [] }))?.api).toBe('responses');
		expect(parseRequest('not json')).toBeNull();
		expect(parseRequest('[]')).toBeNull();
		expect(parseRequest('{"model":"m"}')).toBeNull();
	});
});

describe('historyAgainst', () => {
	const first = parseRequest(
		request([
			{ role: 'system', content: 'RULES' },
			{ role: 'user', content: '(Begin.)' }
		])
	);
	const second = parseRequest(
		request([
			{ role: 'system', content: 'RULES' },
			{ role: 'user', content: '(Begin.)' },
			{ role: 'assistant', content: 'Sit.' },
			{ role: 'user', content: 'I sit.' }
		])
	);
	const changed = parseRequest(
		request([
			{ role: 'system', content: 'OTHER RULES' },
			{ role: 'user', content: '(Begin.)' },
			{ role: 'assistant', content: 'Sit.' }
		])
	);

	it('counts the history a request shares with the one before, exactly', () => {
		if (!(first && second && changed)) {
			throw new Error('the requests should parse');
		}
		expect(historyAgainst(first, null)).toEqual({ shared: 0, appended: true });
		expect(historyAgainst(second, first)).toEqual({ shared: 2, appended: true });
		expect(historyAgainst(changed, first)).toEqual({ shared: 0, appended: false });
	});
});

describe('streamEntries', () => {
	it('gathers reasoning, the reply and how it ended from every event, in order', () => {
		const body = [
			': OPENROUTER PROCESSING\n\n',
			delta({ role: 'assistant' }, { id: 'gen-1', model: 'a/model', provider: 'Prov' }),
			delta({
				reasoning: 'First, ',
				reasoning_details: [{ type: 'reasoning.text', text: 'First, ' }]
			}),
			delta({
				reasoning_details: [
					{ type: 'reasoning.summary', summary: 'then.' },
					{ type: 'reasoning.encrypted', data: 'xyz' }
				]
			}),
			delta({ content: 'Sit' }),
			delta({ content: '.' }),
			event({ choices: [{ delta: {}, finish_reason: 'stop', native_finish_reason: 'end_turn' }] }),
			event({ choices: [], usage: { total_tokens: 9 } }),
			'data: [DONE]\n\n'
		].join('');
		const entries = streamEntries(body);
		expect(entries.map((entry) => entry.label)).toEqual([
			'Reasoning',
			'Reply',
			'How it ended: stopped: stop · a/model · via Prov'
		]);
		// Read once though sent twice, and an encrypted piece said, not shown.
		expect(entries[0]?.text).toBe('First, then.\n\n(1 more piece, encrypted by the provider.)');
		expect(entries[1]?.text).toBe('Sit.');
		const ending = JSON.parse(entries[2]?.text ?? '{}');
		expect(ending).toMatchObject({
			id: 'gen-1',
			native_finish_reason: 'end_turn',
			usage: { total_tokens: 9 },
			keepAliveComments: 1,
			saidDone: true
		});
	});

	it('shows an error, tool calls and any event it does not read, rather than dropping them', () => {
		const body = [
			delta({ content: 'Half' }),
			delta({ tool_calls: [{ index: 0, function: { name: 'look' } }] }),
			event({ something_new: 1 }),
			'data: not json\n\n',
			event({ error: { message: 'overloaded' } })
		].join('');
		const labels = streamEntries(body).map((entry) => entry.label);
		expect(labels).toEqual([
			'Reply',
			'Tool calls',
			'An event not read here',
			'An event not read here',
			'Error',
			'How it ended'
		]);
		expect(streamEntries('').map((entry) => entry.text)[0]).toBe('(no reply)');
	});
});

describe('sentEntry', () => {
	it('labels each message by who it is from', () => {
		expect(sentEntry({ role: 'system', content: 'x' }).label).toBe('System prompt');
		expect(sentEntry({ role: 'user', content: 'x' }).who).toBe('user');
		expect(sentEntry({ role: 'assistant', content: 'x' }).who).toBe('model');
	});
});

describe('suggestionLog', () => {
	const sent = request([
		{ role: 'system', content: 'The rules' },
		{ role: 'user', content: 'A brief' }
	]);

	it('is null for an answer with no request in it', () => {
		expect(suggestionLog({ choices: [{ message: { content: '{}' } }] })).toBeNull();
		expect(suggestionLog(null)).toBeNull();
	});

	it('reads a Chat Completions answer: what was sent, the reasoning, the reply, how it ended', () => {
		const log = suggestionLog({
			choices: [
				{ message: { content: '{"voice":"talk"}', reasoning: 'Thinking' }, finish_reason: 'stop' }
			],
			usage: { total_tokens: 10 },
			boundUpRequest: sent
		});
		expect(log?.model).toBe('test/model');
		expect(log?.api).toBe('chat/completions');
		expect(log?.entries.map(({ who, label }) => [who, label])).toEqual([
			['system', 'System prompt'],
			['user', 'Sent'],
			['settings', 'Settings'],
			['model', 'Reasoning'],
			['model', 'Reply'],
			['end', 'How it ended']
		]);
		expect(log?.entries[4]?.text).toBe('{"voice":"talk"}');
		expect(log?.entries[5]?.text).toContain('"total_tokens": 10');
		// The request is not shown again as part of the answer.
		expect(log?.entries.some((entry) => entry.text.includes('boundUpRequest'))).toBe(false);
	});

	it('reads a Responses answer item by item, fetched pages whole', () => {
		const page = 'x'.repeat(5000);
		const log = suggestionLog({
			output: [
				{ type: 'reasoning', summary: [{ type: 'summary_text', text: 'Plan' }] },
				{
					type: 'openrouter:web_fetch',
					url: 'https://a.test/',
					status: 'completed',
					httpStatus: 200,
					title: 'r/Example',
					content: page
				},
				{
					type: 'openrouter:web_fetch',
					url: 'https://b.test/',
					status: 'failed',
					error: 'blocked'
				},
				{ type: 'reasoning', encrypted_content: '…' },
				{ type: 'something_new', value: 1 },
				{ type: 'message', content: [{ type: 'output_text', text: '{"voice":"monologue"}' }] }
			],
			status: 'completed',
			boundUpRequest: JSON.stringify({ model: 'test/model', input: [] })
		});
		expect(log?.api).toBe('responses');
		const entries = log?.entries.slice(1) ?? [];
		expect(entries.map(({ label }) => label)).toEqual([
			'Reasoning',
			'Fetched https://a.test/ (completed · HTTP 200 · “r/Example”)',
			'Fetched https://b.test/ (failed)',
			'Reasoning',
			'something_new',
			'Reply',
			'How it ended'
		]);
		expect(entries[1]?.text).toBe(page);
		expect(entries[2]?.text).toBe('blocked');
		expect(entries[3]?.text).toBe('(not shown by the provider)');
	});
});
