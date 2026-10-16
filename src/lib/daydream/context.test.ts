import { describe, expect, it } from 'vitest';
import { DAYDREAM_LIMITS } from '../daydream';
import { type ContextTurn, contextSize, toContextTurn, trimContext } from './context';

const said = (text: string, role: 'user' | 'story' = 'user'): ContextTurn => ({
	type: 'text',
	role,
	text
});

describe('trimContext', () => {
	it('keeps everything that fits, in order', () => {
		const turns = [said('a'), said('b', 'story'), said('c')];
		expect(trimContext(turns)).toEqual(turns);
	});

	it('drops the oldest turns first, and stops at the first that does not fit', () => {
		const turns = [said('oldest-'), said('middle', 'story'), said('newest')];
		expect(trimContext(turns, { chars: 12, turns: 10 })).toEqual([
			said('middle', 'story'),
			said('newest')
		]);
		expect(
			trimContext([said('x'.repeat(5)), said('y'), said('z'.repeat(5))], { chars: 7, turns: 10 })
		).toEqual([said('y'), said('z'.repeat(5))]);
	});

	it('counts typed turns by what they say', () => {
		const turns: ContextTurn[] = [
			said('x'.repeat(10)),
			{ type: 'direction', label: 'Slower' },
			{ type: 'safety', signal: 'red' }
		];
		expect(trimContext(turns, { chars: 14, turns: 10 })).toEqual(turns.slice(1));
	});

	it('keeps at most the turn budget', () => {
		expect(trimContext([said('a'), said('b'), said('c')], { chars: 100, turns: 2 })).toEqual([
			said('b'),
			said('c')
		]);
	});
});

describe('toContextTurn', () => {
	it('sends a passage’s text and reaction, never what it offered next', () => {
		expect(
			toContextTurn(
				'story',
				{
					type: 'text',
					text: 'Sit.',
					meta: {
						suggestions: ['Sit.'],
						directions: { add: [{ id: 'slower', label: 'Slower' }], remove: [] },
						readAs: 'action'
					}
				},
				'love'
			)
		).toEqual({ type: 'text', role: 'story', text: 'Sit.', reaction: 'love' });
	});

	it('marks a passage that stepped out of the story', () => {
		expect(
			toContextTurn('story', {
				type: 'text',
				text: 'Are you okay?',
				meta: { suggestions: [], directions: { add: [], remove: [] }, ooc: true }
			})
		).toEqual({ type: 'text', role: 'story', text: 'Are you okay?', ooc: true });
	});

	it('never puts a reaction on the user’s own turn', () => {
		expect(toContextTurn('user', { type: 'text', text: 'Hi' }, 'like')).toEqual(said('Hi'));
	});

	it('turns each kind of turn into what the model reads', () => {
		const quote = { start: 0, end: 4, text: 'Sit.' };
		expect(toContextTurn('user', { type: 'direction', id: 'slower', label: 'Slower' })).toEqual({
			type: 'direction',
			label: 'Slower'
		});
		expect(
			toContextTurn('user', {
				type: 'steer',
				action: 'more',
				targetTurnId: crypto.randomUUID(),
				quote
			})
		).toEqual({ type: 'steer', action: 'more', quote: 'Sit.' });
		expect(toContextTurn('user', { type: 'safety', signal: 'yellow' })).toEqual({
			type: 'safety',
			signal: 'yellow'
		});
		expect(
			toContextTurn('user', {
				type: 'roll',
				proposalTurnId: crypto.randomUUID(),
				sides: 6,
				result: 4,
				outcome: 'You hold'
			})
		).toEqual({ type: 'roll', sides: 6, result: 4, outcome: 'You hold' });
	});

	it('cuts a text turn to the turn limit', () => {
		const long = toContextTurn('user', {
			type: 'text',
			text: 'y'.repeat(DAYDREAM_LIMITS.turn + 10)
		});
		expect(long && contextSize(long)).toBe(DAYDREAM_LIMITS.turn);
	});
});
