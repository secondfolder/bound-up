import { describe, expect, it } from 'vitest';
import { defined } from '../testing/defined';
import { EXCHANGE_LIMITS } from './exchange';
import { setupExchangeLog, suggestionLog } from './exchange-log';
import { setupExchangeFrom } from './setup-exchange';

const timing = { startedAt: 1000, endedAt: 4000 };

const chatAnswer = {
	choices: [{ message: { content: '{"voice":"talk"}' }, finish_reason: 'stop' }],
	boundUpRequest: JSON.stringify({
		model: 'test/model',
		messages: [
			{ role: 'system', content: 'The rules' },
			{ role: 'user', content: 'A brief' }
		]
	})
};

describe('setupExchangeFrom', () => {
	it('keeps the request as sent and the answer without it', () => {
		expect(
			setupExchangeFrom('ideas', { choices: [], boundUpRequest: '{"model":"m"}' }, timing)
		).toEqual({
			task: 'ideas',
			request: '{"model":"m"}',
			response: { body: '{"choices":[]}' },
			startedAt: 1000,
			endedAt: 4000
		});
	});

	it('is null for an answer with no request in it', () => {
		expect(setupExchangeFrom('daydream', { choices: [] }, timing)).toBeNull();
		expect(setupExchangeFrom('daydream', null, timing)).toBeNull();
	});

	it('keeps only the start of an answer past the cap, and says so', () => {
		const kept = setupExchangeFrom(
			'daydream',
			{ page: 'x'.repeat(EXCHANGE_LIMITS.response), boundUpRequest: '{}' },
			timing
		);
		expect(kept?.response.body).toHaveLength(EXCHANGE_LIMITS.response);
		expect(kept?.response.truncated).toBe(true);
	});
});

describe('setupExchangeLog', () => {
	it('reads a kept exchange as the new-daydream page read its answer', () => {
		const kept = defined(setupExchangeFrom('daydream', chatAnswer, timing), 'the exchange');
		expect(setupExchangeLog(kept)).toEqual(suggestionLog(chatAnswer));
	});

	it('reads a Responses answer, fetched pages and all', () => {
		const responses = {
			output: [
				{
					type: 'openrouter:web_fetch',
					url: 'https://a.test/',
					status: 'completed',
					content: 'Page'
				},
				{ type: 'message', content: [{ type: 'output_text', text: '{"ideas":[]}' }] }
			],
			status: 'completed',
			boundUpRequest: JSON.stringify({ model: 'test/model', input: [] })
		};
		const log = setupExchangeLog(
			defined(setupExchangeFrom('ideas', responses, timing), 'the exchange')
		);
		expect(log?.api).toBe('responses');
		expect(log?.entries.map(({ label }) => label)).toContain('Fetched https://a.test/ (completed)');
	});

	it('shows an answer cut short whole, rather than dropping it', () => {
		const kept = defined(setupExchangeFrom('daydream', chatAnswer, timing), 'the exchange');
		const body = kept.response.body.slice(0, 20);
		const log = setupExchangeLog({ ...kept, response: { body, truncated: true } });
		expect(log?.entries.map(({ text }) => text).join('\n')).toContain(JSON.stringify(body));
	});
});
