import { describe, expect, it } from 'vitest';
import { DAYDREAM_LIMITS } from '../daydream';
import {
	CONTEXT_TRIM_STEP,
	type ContextTurn,
	chosenReadingIn,
	contextSize,
	expansionIn,
	passageAsSent,
	toContextTurn,
	trimContext
} from './context';

const said = (text: string, role: 'user' | 'story' = 'user'): ContextTurn => ({
	type: 'text',
	role,
	text
});

const OMITTED: ContextTurn = { type: 'omitted' };

describe('trimContext', () => {
	it('keeps everything that fits, in order, with no marker', () => {
		const turns = [said('a'), said('b', 'story'), said('c')];
		expect(trimContext(turns)).toEqual(turns);
	});

	it('drops the oldest turns first, and stops at the first that does not fit', () => {
		const turns = [said('oldest-'), said('middle', 'story'), said('newest')];
		expect(trimContext(turns, { chars: 12, turns: 10 })).toEqual([
			OMITTED,
			said('middle', 'story'),
			said('newest')
		]);
		expect(
			trimContext([said('x'.repeat(5)), said('y'), said('z'.repeat(5))], { chars: 7, turns: 10 })
		).toEqual([OMITTED, said('y'), said('z'.repeat(5))]);
	});

	it('counts typed turns by what they say', () => {
		const turns: ContextTurn[] = [
			said('x'.repeat(10)),
			{ type: 'direction', label: 'Slower' },
			{ type: 'safety', signal: 'red' }
		];
		expect(trimContext(turns, { chars: 14, turns: 10 })).toEqual([OMITTED, ...turns.slice(1)]);
	});

	it('keeps at most the turn budget', () => {
		expect(trimContext([said('a'), said('b'), said('c')], { chars: 100, turns: 2 })).toEqual([
			OMITTED,
			said('b'),
			said('c')
		]);
	});

	// A provider caches a prompt by its start, so where the kept history
	// starts must stay put while a long story grows.
	it('cuts at whole steps, so the history starts in the same place request after request', () => {
		const story = Array.from({ length: 60 }, (_, at) => said(`turn ${at}`.padEnd(10, '.')));
		const budget = { chars: 300, turns: 200 };
		const cuts = [40, 41, 45, 49, 50, 51, 59, 60].map(
			// Less one for the marker the trimmed story starts with.
			(length) => trimContext(story.slice(0, length), budget).length - 1 - length
		);
		// 30 turns fit; the cut moves only when it crosses a step.
		expect(cuts).toEqual([-10, -20, -20, -20, -20, -30, -30, -30]);
		expect(CONTEXT_TRIM_STEP).toBe(10);
	});

	it('keeps the newest turns that fit rather than nothing, when a step would take them all', () => {
		const turns = [said('x'.repeat(50)), said('y'.repeat(50)), said('newest')];
		expect(trimContext(turns, { chars: 60, turns: 10 })).toEqual([OMITTED, ...turns.slice(1)]);
	});
});

describe('toContextTurn', () => {
	it('sends a passage’s text, never what it offered next', () => {
		expect(
			toContextTurn('story', {
				type: 'text',
				text: 'Sit.',
				meta: {
					suggestions: ['Sit.'],
					directions: { add: [{ id: 'slower', label: 'Slower' }], remove: [] },
					readAs: 'action'
				}
			})
		).toEqual({ type: 'text', role: 'story', text: 'Sit.' });
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

	// Each turn goes back as it was first sent, so each request only adds to
	// the one before: the user's turn as they wrote it, and the written-out
	// turn with the passage that wrote it, as the model wrote it.
	it('sends a user’s turn as they wrote it, and the turn written out with the passage', () => {
		const answer = {
			type: 'text' as const,
			text: 'Charlie sighs.',
			meta: {
				suggestions: [],
				directions: { add: [], remove: [] },
				readAs: 'instruction' as const,
				expansion: '"Charlie, the fox is safe."'
			}
		};
		const instruction = { type: 'text' as const, text: 'Tell Charlie the fox is safe' };
		expect(toContextTurn('user', instruction)).toEqual(said('Tell Charlie the fox is safe'));
		expect(toContextTurn('story', answer)).toEqual({
			...said('Charlie sighs.', 'story'),
			expansion: '"Charlie, the fox is safe."'
		});
		expect(passageAsSent('Charlie sighs.', expansionIn(answer))).toBe(
			'<yours>\n"Charlie, the fox is safe."\n</yours>\nCharlie sighs.'
		);
		expect(passageAsSent('Charlie sighs.', null)).toBe('Charlie sighs.');
	});

	it('sends a passage back with the picture it described, and a user’s turn without one', () => {
		const pictured = {
			type: 'text' as const,
			text: 'Charlie sighs.',
			meta: {
				suggestions: [],
				directions: { add: [], remove: [] },
				image: 'A man sighs by a window.'
			}
		};
		expect(toContextTurn('story', pictured)).toEqual({
			...said('Charlie sighs.', 'story'),
			image: 'A man sighs by a window.'
		});
		expect(toContextTurn('user', pictured)).toEqual(said('Charlie sighs.'));
		expect(passageAsSent('Charlie sighs.', null, 'A man sighs by a window.')).toBe(
			'Charlie sighs.\n<meta>\n{"image":"A man sighs by a window."}\n</meta>'
		);
	});

	it('sends a rewrite with what it rewrote, so its request goes back with it', () => {
		const rewritten = {
			type: 'text' as const,
			text: 'Charlie laughs.',
			meta: {
				suggestions: [],
				directions: { add: [], remove: [] },
				rewriteOf: {
					turnId: crypto.randomUUID(),
					quote: { start: 0, end: 7, text: 'Charlie' },
					instruction: 'Warmer.'
				}
			}
		};
		expect(toContextTurn('story', rewritten, { rewrote: 'Charlie sighs.' })).toEqual({
			...said('Charlie laughs.', 'story'),
			rewrite: { targetText: 'Charlie sighs.', quote: 'Charlie', instruction: 'Warmer.' }
		});
		// Without the passage it rewrote (one that will not open), it goes as a plain one.
		expect(toContextTurn('story', rewritten)).toEqual(said('Charlie laughs.', 'story'));
	});

	it('sends another take with the take it replaced, and says it was one', () => {
		const take = {
			type: 'text' as const,
			text: 'Charlie laughs.',
			meta: {
				suggestions: [],
				directions: { add: [], remove: [] },
				rewriteOf: { turnId: crypto.randomUUID(), again: true as const }
			}
		};
		expect(toContextTurn('story', take, { rewrote: 'Charlie sighs.' })).toEqual({
			...said('Charlie laughs.', 'story'),
			rewrite: { targetText: 'Charlie sighs.', again: true }
		});
	});

	it('says how the user chose to have their turn read, and only theirs', () => {
		const answer = (readAsChosen: boolean) => ({
			type: 'text' as const,
			text: 'The story turns steamy.',
			meta: {
				suggestions: [],
				directions: { add: [], remove: [] },
				readAs: 'direction' as const,
				readAsChosen
			}
		});
		const turn = { type: 'text' as const, text: 'Make it steamy' };
		expect(chosenReadingIn(answer(true))).toBe('direction');
		// The model's own reading is not sent back.
		expect(chosenReadingIn(answer(false))).toBeNull();
		expect(toContextTurn('user', turn, { readAs: chosenReadingIn(answer(true)) })).toEqual({
			...said('Make it steamy'),
			readAs: 'direction'
		});
		expect(toContextTurn('story', answer(true), { readAs: 'direction' })).toEqual(
			said('The story turns steamy.', 'story')
		);
		// Written out by the passage after it or not, it goes with its reading,
		// as it was first sent.
		expect(toContextTurn('user', turn, { readAs: 'instruction' })).toEqual({
			...said('Make it steamy'),
			readAs: 'instruction'
		});
	});

	it('cuts a text turn to the turn limit', () => {
		const long = toContextTurn('user', {
			type: 'text',
			text: 'y'.repeat(DAYDREAM_LIMITS.turn + 10)
		});
		expect(long && contextSize(long)).toBe(DAYDREAM_LIMITS.turn);
	});
});
