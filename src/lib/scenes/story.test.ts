import { describe, expect, it } from 'vitest';
import {
	chipsAt,
	STORY_LINES,
	STORY_STARTERS,
	startersAt,
	storyLineText,
	storyLineValue
} from './story';

describe('story lines', () => {
	it('round-trips a line through its text', () => {
		const text = storyLineText('where', 'a hotel room');
		expect(text).toBe('Where: a hotel room');
		expect(storyLineValue('where', text)).toBe('a hotel room');
		expect(storyLineValue('tone', text)).toBeNull();
	});

	/** A chip is toggled in and out of a comma-separated line, so a comma would split it in two. */
	it('has no chip with a comma in it', () => {
		for (const line of STORY_LINES) {
			expect(chipsAt(5, line).filter((chip) => chip.includes(','))).toEqual([]);
		}
	});

	it('shows the commonest half of each line’s chips first, and the rest further up', () => {
		for (const line of STORY_LINES) {
			expect(chipsAt(2, line).length).toBeLessThan(chipsAt(3, line).length);
		}
	});
});

describe('starters', () => {
	it('have unique ids and only lines the page knows', () => {
		expect(new Set(STORY_STARTERS.map((starter) => starter.id)).size).toBe(STORY_STARTERS.length);
		for (const starter of STORY_STARTERS) {
			expect(
				Object.keys(starter.lines).every((line) =>
					(STORY_LINES as readonly string[]).includes(line)
				)
			).toBe(true);
		}
	});

	it('run sweet to filthy as More goes up', () => {
		expect(startersAt(1).every((starter) => starter.heat === 1)).toBe(true);
		expect(startersAt(5)).toHaveLength(STORY_STARTERS.length);
		expect(startersAt(0).length).toBe(startersAt(1).length);
	});
});
