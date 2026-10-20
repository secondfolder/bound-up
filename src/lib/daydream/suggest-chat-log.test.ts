import { describe, expect, it } from 'vitest';
import { suggestChatLog } from './suggest-chat-log';

const sent = {
	model: 'test/model',
	api: 'responses',
	messages: [
		{ role: 'system', content: 'The rules' },
		{ role: 'user', content: 'A brief' }
	]
};

describe('suggestChatLog', () => {
	it('is null for an answer with nothing sent in it', () => {
		expect(suggestChatLog({ choices: [{ message: { content: '{}' } }] })).toBeNull();
		expect(suggestChatLog(null)).toBeNull();
	});

	it('reads a Chat Completions answer: what was sent, the reasoning, the reply, how it ended', () => {
		const log = suggestChatLog({
			choices: [
				{ message: { content: '{"voice":"talk"}', reasoning: 'Thinking' }, finish_reason: 'stop' }
			],
			usage: { total_tokens: 10 },
			boundUpSent: { ...sent, api: 'chat/completions' }
		});
		expect(log?.model).toBe('test/model');
		expect(log?.api).toBe('chat/completions');
		expect(log?.entries.map(({ who, label }) => [who, label])).toEqual([
			['system', 'System prompt'],
			['user', 'Sent'],
			['model', 'Reasoning'],
			['model', 'Reply'],
			['end', 'How it ended']
		]);
		expect(log?.entries[3]?.text).toBe('{"voice":"talk"}');
		expect(log?.entries[4]?.text).toContain('"total_tokens": 10');
	});

	it('reads a Responses answer item by item, fetched pages whole', () => {
		const page = 'x'.repeat(5000);
		const log = suggestChatLog({
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
			boundUpSent: sent
		});
		const entries = log?.entries.slice(2) ?? [];
		expect(entries.map(({ label }) => label)).toEqual([
			'Reasoning',
			'Fetched https://a.test/ (completed · HTTP 200 · “r/Example”)',
			'Fetched https://b.test/ (failed)',
			'Reasoning',
			'something_new',
			'Reply',
			'How it ended'
		]);
		expect(entries[0]?.text).toBe('Plan');
		expect(entries[1]?.text).toBe(page);
		expect(entries[2]?.text).toBe('blocked');
		expect(entries[3]?.text).toBe('(not shown by the provider)');
		expect(entries[4]?.text).toContain('"value": 1');
		expect(entries[5]?.text).toBe('{"voice":"monologue"}');
		expect(entries[6]?.text).toContain('"status": "completed"');
	});
});
