import { describe, expect, it } from 'vitest';
import { DAYDREAM_LIMITS } from '../daydream';
import { RECEIVED_LIMITS, ReplyReceipt } from './received-record';

const chunk = (delta: object, more: object = {}) => ({ choices: [{ delta }], ...more });

function receiptOf(...events: unknown[]) {
	const receipt = new ReplyReceipt();
	for (const event of events) {
		receipt.take(event);
	}
	return receipt;
}

describe('ReplyReceipt', () => {
	it('gathers the reasoning, who answered, why it stopped and its usage', () => {
		const receipt = receiptOf(
			chunk({ role: 'assistant' }, { id: 'gen-1', model: 'a/model', provider: 'Prov' }),
			chunk({ reasoning: 'First, ' }),
			chunk({ reasoning: 'then.' }),
			chunk({ content: 'Sit.' }),
			{ choices: [{ delta: {}, finish_reason: 'length' }] },
			{ choices: [], usage: { prompt_tokens: 3, completion_tokens: 4 } }
		);
		expect(receipt.record('Sit.')).toEqual({
			reasoning: 'First, then.',
			model: 'a/model',
			provider: 'Prov',
			generationId: 'gen-1',
			finishReason: 'length',
			usage: JSON.stringify({ prompt_tokens: 3, completion_tokens: 4 }, null, 2)
		});
	});

	it('reads reasoning details only when there is no reasoning, so nothing is counted twice', () => {
		const both = chunk({
			reasoning: 'Once.',
			reasoning_details: [{ type: 'reasoning.text', text: 'Once.' }]
		});
		const details = chunk({
			reasoning_details: [
				{ type: 'reasoning.summary', summary: 'In short. ' },
				{ type: 'reasoning.text', text: 'At length.' },
				{ type: 'reasoning.encrypted', data: 'xyz' }
			]
		});
		expect(receiptOf(both, details).record('')?.reasoning).toBe('Once.In short. At length.');
	});

	it('gives the reasoning only the room the reply leaves, and says when it was cut', () => {
		const reasoning = 'q'.repeat(100);
		const raw = 'r'.repeat(DAYDREAM_LIMITS.rawReply - 40);
		const record = receiptOf(chunk({ reasoning })).record(raw);
		expect(record).toEqual({ reasoning: 'q'.repeat(40), reasoningTruncated: true });
		expect(receiptOf(chunk({ reasoning })).record('short')).toEqual({ reasoning });
	});

	it('keeps an error for a failed reply’s log, never for a passage', () => {
		const receipt = receiptOf(chunk({ reasoning: 'Hm.' }), { error: { message: 'overloaded' } });
		expect(receipt.log).toEqual({
			reasoning: 'Hm.',
			error: JSON.stringify({ message: 'overloaded' }, null, 2)
		});
		expect(receipt.record('')).toEqual({ reasoning: 'Hm.' });
	});

	it('keeps nothing for a stream that carried nothing else, and passes over what it does not know', () => {
		expect(receiptOf(chunk({ content: 'Sit.' }), 'junk', null, [1]).record('Sit.')).toBeNull();
	});

	it('cuts long names, and drops a usage too long to keep rather than mangling it', () => {
		const record = receiptOf({
			model: 'm'.repeat(RECEIVED_LIMITS.name + 5),
			usage: { note: 'u'.repeat(RECEIVED_LIMITS.usage) }
		}).record('');
		expect(record).toEqual({ model: 'm'.repeat(RECEIVED_LIMITS.name) });
	});
});
