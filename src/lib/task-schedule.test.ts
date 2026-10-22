import { describe, expect, it } from 'vitest';
import {
	addTaskDuration,
	completionsInWindow,
	describeTaskSchedule,
	initialNextEligibleAt,
	nextEligibleAtAfterCompletion,
	resolveTaskLocalDateTime,
	scheduledCurrentOrNextOccurrence,
	shortAvailability,
	shortTaskSchedule,
	taskLocalDateTimeInputValue,
	windowLowerBound
} from './task-schedule';
import type { TaskSchedule, TaskWeekday } from './types';

describe('resolveTaskLocalDateTime', () => {
	it('converts a local datetime in the owner timezone to UTC', () => {
		expect(resolveTaskLocalDateTime('2026-01-15T09:30', 'America/New_York')?.toISOString()).toBe(
			'2026-01-15T14:30:00.000Z'
		);
	});
});

describe('taskLocalDateTimeInputValue', () => {
	it('converts a UTC instant back into a local datetime input value', () => {
		expect(
			taskLocalDateTimeInputValue(new Date('2026-01-15T14:30:00.000Z'), 'America/New_York')
		).toBe('2026-01-15T09:30');
	});
});

describe('addTaskDuration', () => {
	it('adds month-based durations in the owner timezone', () => {
		expect(
			addTaskDuration(new Date('2026-01-31T15:00:00.000Z'), 1, 'month', 'UTC').toISOString()
		).toBe('2026-02-28T15:00:00.000Z');
	});
});

describe('scheduledCurrentOrNextOccurrence', () => {
	it('returns the current due occurrence when a scheduled task is already due', () => {
		const occurrence = scheduledCurrentOrNextOccurrence(
			{
				mode: 'scheduled',
				anchorLocal: '2026-09-14T09:00',
				frequency: 'day',
				interval: 1,
				end: { kind: 'never' }
			},
			'Europe/London',
			new Date('2026-09-14T12:00:00.000Z')
		);

		expect(occurrence?.toISOString()).toBe('2026-09-14T08:00:00.000Z');
	});

	it('returns the next monthly nth-weekday occurrence', () => {
		const occurrence = scheduledCurrentOrNextOccurrence(
			{
				mode: 'scheduled',
				anchorLocal: '2026-09-01T10:00',
				frequency: 'month',
				interval: 1,
				monthlyPattern: { kind: 'nth-weekday', ordinal: 2, weekday: 'tu' },
				end: { kind: 'never' }
			},
			'Europe/London',
			new Date('2026-09-05T12:00:00.000Z')
		);

		expect(occurrence?.toISOString()).toBe('2026-09-08T09:00:00.000Z');
	});
});

describe('initialNextEligibleAt', () => {
	it('is null for unscheduled tasks', () => {
		expect(initialNextEligibleAt({ mode: 'one-off' }, 'UTC')).toBeNull();
	});
});

describe('nextEligibleAtAfterCompletion', () => {
	it('locks an after-completion task until the interval elapses', () => {
		expect(
			nextEligibleAtAfterCompletion(
				{ mode: 'after-completion', every: 2, unit: 'day' },
				'Europe/London',
				new Date('2026-09-14T12:00:00.000Z')
			)?.toISOString()
		).toBe('2026-09-16T12:00:00.000Z');
	});

	it('uses the rolling window limit to compute the next available time', () => {
		expect(
			nextEligibleAtAfterCompletion(
				{
					mode: 'rolling-window',
					limit: { completions: 2, every: 1, unit: 'day' }
				},
				'UTC',
				new Date('2026-09-14T12:00:00.000Z'),
				[new Date('2026-09-14T09:00:00.000Z')]
			)?.toISOString()
		).toBe('2026-09-15T09:00:00.000Z');
	});

	it('advances a scheduled task to the next future occurrence after completion', () => {
		expect(
			nextEligibleAtAfterCompletion(
				{
					mode: 'scheduled',
					anchorLocal: '2026-09-14T09:00',
					frequency: 'week',
					interval: 1,
					weekdays: ['mo'],
					end: { kind: 'never' }
				},
				'Europe/London',
				new Date('2026-09-14T12:00:00.000Z')
			)?.toISOString()
		).toBe('2026-09-21T08:00:00.000Z');
	});
});

describe('describeTaskSchedule', () => {
	it('says each mode in full, to follow "Repeats"', () => {
		expect(describeTaskSchedule({ mode: 'one-off' })).toBe('No, just once');
		expect(describeTaskSchedule({ mode: 'rolling-window', limit: null })).toBe(
			'Anytime, as often as you like'
		);
		expect(
			describeTaskSchedule({
				mode: 'rolling-window',
				limit: { completions: 3, every: 1, unit: 'week' }
			})
		).toBe('Anytime, up to 3 times a week');
		expect(describeTaskSchedule({ mode: 'after-completion', every: 3, unit: 'week' })).toBe(
			'3 weeks after it was last done'
		);
	});
});

describe('completionsInWindow', () => {
	const weekly: TaskSchedule = {
		mode: 'rolling-window',
		limit: { completions: 3, every: 1, unit: 'week' }
	};
	const now = new Date('2026-10-22T12:00:00.000Z');

	it('counts only the completions whose window has not run out', () => {
		const completions = [
			new Date('2026-10-21T12:00:00.000Z'),
			new Date('2026-10-16T12:00:00.000Z'),
			new Date('2026-10-15T11:59:00.000Z')
		];
		expect(completionsInWindow(weekly, 'UTC', completions, now)).toBe(2);
	});

	it('is null for a task with no limit to count against', () => {
		expect(completionsInWindow({ mode: 'rolling-window', limit: null }, 'UTC', [], now)).toBeNull();
		expect(completionsInWindow({ mode: 'one-off' }, 'UTC', [now], now)).toBeNull();
	});

	it('has a lower bound for the query that keeps every completion it would count', () => {
		const bound = windowLowerBound(weekly, now);
		expect(bound?.toISOString()).toBe('2026-10-14T12:00:00.000Z');
		expect(windowLowerBound({ mode: 'one-off' }, now)).toBeNull();
	});
});

describe('shortTaskSchedule', () => {
	it.each<[TaskSchedule, string]>([
		[{ mode: 'one-off' }, 'One-off'],
		[{ mode: 'rolling-window', limit: null }, 'Anytime'],
		[{ mode: 'rolling-window', limit: { completions: 3, every: 1, unit: 'week' } }, '3× a week'],
		[{ mode: 'rolling-window', limit: { completions: 1, every: 1, unit: 'hour' } }, 'Once an hour'],
		[
			{ mode: 'rolling-window', limit: { completions: 2, every: 3, unit: 'day' } },
			'2× every 3 days'
		],
		[{ mode: 'after-completion', every: 2, unit: 'day' }, '2 days after the last'],
		[{ mode: 'after-completion', every: 1, unit: 'week' }, '1 week after the last']
	])('%j reads as %s', (schedule, expected) => {
		expect(shortTaskSchedule(schedule)).toBe(expected);
	});

	const scheduled = (
		frequency: 'day' | 'week' | 'month' | 'year',
		interval: number,
		weekdays?: TaskWeekday[]
	): TaskSchedule => ({
		mode: 'scheduled',
		anchorLocal: '2026-10-01T09:00',
		frequency,
		interval,
		weekdays,
		end: { kind: 'never' }
	});

	it('names the common calendar patterns', () => {
		expect(shortTaskSchedule(scheduled('day', 1))).toBe('Daily');
		expect(shortTaskSchedule(scheduled('week', 1))).toBe('Weekly');
		expect(shortTaskSchedule(scheduled('week', 1, ['mo', 'tu', 'we', 'th', 'fr']))).toBe(
			'Weekdays'
		);
		expect(shortTaskSchedule(scheduled('week', 1, ['su', 'sa']))).toBe('Weekends');
		expect(shortTaskSchedule(scheduled('week', 1, ['we', 'mo']))).toBe('Mon, Wed');
		expect(shortTaskSchedule(scheduled('month', 1))).toBe('Monthly');
		expect(shortTaskSchedule(scheduled('year', 1))).toBe('Yearly');
		expect(shortTaskSchedule(scheduled('day', 3))).toBe('Every 3 days');
		expect(shortTaskSchedule(scheduled('week', 2, ['fr']))).toBe('Every 2 weeks, Fri');
	});
});

describe('shortAvailability', () => {
	const now = new Date('2026-10-22T10:00:00.000Z');
	const at = (iso: string) => shortAvailability(new Date(iso), now, 'UTC', 'en-US');

	it('counts minutes inside the hour', () => {
		expect(at('2026-10-22T10:20:00.000Z')).toBe('in 20 minutes');
		expect(at('2026-10-22T10:00:30.000Z')).toBe('in 1 minute');
	});

	it('names today, tomorrow and the days of the coming week', () => {
		expect(at('2026-10-22T18:00:00.000Z')).toBe('Today 6pm');
		expect(at('2026-10-23T09:00:00.000Z')).toBe('Tomorrow 9am');
		expect(at('2026-10-24T19:00:00.000Z')).toBe('Sat 7pm');
	});

	it('gives a date past the coming week, and the year only when it differs', () => {
		expect(at('2026-11-03T09:00:00.000Z')).toBe('Nov 3');
		expect(at('2027-01-03T09:00:00.000Z')).toBe('Jan 3, 2027');
	});

	it('can be lower-case, to follow a word', () => {
		expect(
			shortAvailability(new Date('2026-10-23T09:00:00.000Z'), now, 'UTC', 'en-US', {
				capitalise: false
			})
		).toBe('tomorrow 9am');
	});

	it('decides the day in the time zone it is given', () => {
		// 23:30 UTC on the 22nd is already the 23rd in Sydney.
		const late = new Date('2026-10-22T23:30:00.000Z');
		expect(shortAvailability(late, now, 'Australia/Sydney', 'en-US')).toBe('Tomorrow 10:30am');
	});
});
