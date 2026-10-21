import { describe, expect, it } from 'vitest';
import { dayLabel, RUN_GAP_MS, timelineMarks } from './message-timeline';

// Local-time constructors throughout, so the tests hold in any time zone the
// suite runs in: the module works in the viewer's own calendar days.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);
const now = at(21, 12);

describe('dayLabel', () => {
	it('names today and yesterday', () => {
		expect(dayLabel(at(21, 0, 1), now, 'en-GB')).toBe('Today');
		expect(dayLabel(at(20, 23, 59), now, 'en-GB')).toBe('Yesterday');
	});

	it('uses the weekday for the rest of the past week', () => {
		expect(dayLabel(at(16, 9), now, 'en-GB')).toBe('Friday');
	});

	it('uses a date beyond a week, with the year only when it is not this one', () => {
		expect(dayLabel(at(14, 9), now, 'en-GB')).toBe('Wed 14 Oct');
		expect(dayLabel(new Date(2025, 9, 14, 9), now, 'en-GB')).toBe('Tue, 14 Oct 2025');
	});
});

describe('timelineMarks', () => {
	it('shows the time only on the last of a run from one side', () => {
		const marks = timelineMarks(
			[
				{ mine: false, createdAt: at(21, 10, 0) },
				{ mine: false, createdAt: at(21, 10, 1) },
				{ mine: true, createdAt: at(21, 10, 2) }
			],
			now,
			'en-GB'
		);
		expect(marks.map((mark) => mark.showTime)).toEqual([false, true, true]);
		expect(marks.map((mark) => mark.continuesRun)).toEqual([false, true, false]);
	});

	it('starts a new run after a long enough gap, even from the same side', () => {
		const first = at(21, 10, 0);
		const marks = timelineMarks(
			[
				{ mine: true, createdAt: first },
				{ mine: true, createdAt: new Date(first.getTime() + RUN_GAP_MS + 1) }
			],
			now,
			'en-GB'
		);
		expect(marks.map((mark) => mark.showTime)).toEqual([true, true]);
		expect(marks[1]?.continuesRun).toBe(false);
	});

	it('labels the first message of each day, and never runs across midnight', () => {
		const marks = timelineMarks(
			[
				{ mine: true, createdAt: at(20, 23, 58) },
				{ mine: true, createdAt: at(21, 0, 1) },
				{ mine: true, createdAt: at(21, 0, 2) }
			],
			now,
			'en-GB'
		);
		expect(marks.map((mark) => mark.day)).toEqual(['Yesterday', 'Today', null]);
		expect(marks.map((mark) => mark.showTime)).toEqual([true, false, true]);
		expect(marks[1]?.continuesRun).toBe(false);
	});

	it('has nothing to say about an empty thread', () => {
		expect(timelineMarks([], now)).toEqual([]);
	});
});
