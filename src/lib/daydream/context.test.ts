import { describe, expect, it } from 'vitest';
import { DAYDREAM_LIMITS } from '../daydream';
import { type ContextTurn, trimContext } from './context';

const turn = (text: string, role: ContextTurn['role'] = 'user'): ContextTurn => ({ role, text });

describe('trimContext', () => {
	it('keeps everything that fits, in order', () => {
		const turns = [turn('a'), turn('b', 'character'), turn('c')];
		expect(trimContext(turns)).toEqual(turns);
	});

	it('drops the oldest turns first when over the character budget', () => {
		const turns = [turn('oldest-'), turn('middle', 'character'), turn('newest')];
		expect(trimContext(turns, { chars: 12, turns: 10 })).toEqual([
			turn('middle', 'character'),
			turn('newest')
		]);
	});

	it('drops the oldest turns first when over the turn budget', () => {
		const turns = [turn('1'), turn('2'), turn('3'), turn('4')];
		expect(trimContext(turns, { chars: 1000, turns: 2 })).toEqual([turn('3'), turn('4')]);
	});

	it('stops at the first turn that does not fit rather than skipping over it', () => {
		// A gap in the middle of a conversation would make it read as if the
		// character had answered something it never saw.
		const turns = [turn('short'), turn('x'.repeat(50)), turn('end')];
		expect(trimContext(turns, { chars: 20, turns: 10 })).toEqual([turn('end')]);
	});

	it('never sends a turn longer than a turn may be', () => {
		const [only] = trimContext([turn('y'.repeat(DAYDREAM_LIMITS.turn + 10))]);
		expect(only?.text).toHaveLength(DAYDREAM_LIMITS.turn);
	});
});
