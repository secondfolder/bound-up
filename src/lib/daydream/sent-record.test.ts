import { describe, expect, it } from 'vitest';
import { DAYDREAM_LIMITS } from '../daydream';
import {
	appendedToPrevious,
	capSent,
	EMPTY_CHAIN,
	extendChain,
	readSent,
	recordSent
} from './sent-record';

describe('recordSent', () => {
	it('keeps the system prompt and what came after the last passage, and chains the history', async () => {
		const record = await recordSent([
			{ role: 'system', content: 'RULES' },
			{ role: 'user', content: '(Begin the story.)' },
			{ role: 'assistant', content: 'Sit.' },
			{ role: 'user', content: 'I sit.' }
		]);
		expect(record).toEqual({
			system: 'RULES',
			added: ['I sit.'],
			history: {
				messages: 2,
				chain: await extendChain(EMPTY_CHAIN, [
					{ role: 'user', content: '(Begin the story.)' },
					{ role: 'assistant', content: 'Sit.' }
				])
			}
		});
	});

	it('has an empty history for the opening', async () => {
		const record = await recordSent([
			{ role: 'system', content: 'RULES' },
			{ role: 'user', content: '(Begin the story.)' }
		]);
		expect(record.history).toEqual({ messages: 0, chain: EMPTY_CHAIN });
		expect(await appendedToPrevious(record, null)).toBe(true);
	});
});

describe('extendChain', () => {
	it('is the chain of the whole when extended a part at a time', async () => {
		const a = { role: 'user', content: 'a' };
		const b = { role: 'assistant', content: 'b' };
		expect(await extendChain(await extendChain(EMPTY_CHAIN, [a]), [b])).toBe(
			await extendChain(EMPTY_CHAIN, [a, b])
		);
		expect(await extendChain(EMPTY_CHAIN, [a, b])).not.toBe(await extendChain(EMPTY_CHAIN, [b, a]));
	});
});

describe('appendedToPrevious', () => {
	it('cannot tell from a cut record', async () => {
		const record = await recordSent([{ role: 'system', content: 'RULES' }]);
		expect(
			await appendedToPrevious(record, {
				record: { ...record, truncated: true },
				passage: 'Sit.'
			})
		).toBeNull();
	});
});

describe('capSent and readSent', () => {
	it('cuts a record to what a passage keeps, and says so', () => {
		const record = capSent({
			system: 's'.repeat(DAYDREAM_LIMITS.sentSystem + 5),
			added: ['a'.repeat(DAYDREAM_LIMITS.sentAdded - 2), 'bbbb'],
			history: { messages: 0, chain: EMPTY_CHAIN }
		});
		expect(record.system).toHaveLength(DAYDREAM_LIMITS.sentSystem);
		expect(record.added[1]).toBe('bb');
		expect(record.truncated).toBe(true);
	});

	it('leaves a record that fits as it is', () => {
		const record = {
			system: 'RULES',
			added: ['I sit.'],
			history: { messages: 0, chain: EMPTY_CHAIN }
		};
		expect(capSent(record)).toEqual(record);
	});

	it('takes only a record of the right shape', () => {
		expect(readSent({ system: 'RULES' })).toBeNull();
		expect(
			readSent({ system: 'RULES', added: [], history: { messages: 0, chain: EMPTY_CHAIN } })
		).toEqual({ system: 'RULES', added: [], history: { messages: 0, chain: EMPTY_CHAIN } });
	});
});
