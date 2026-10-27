import { describe, expect, it } from 'vitest';
import { opensLater, quotaText, type TaskView } from './task-list';
import type { TaskSchedule } from './types';

const now = new Date('2026-10-22T12:00:00.000Z');
const threeAWeek: TaskSchedule = {
	mode: 'rolling-window',
	limit: { completions: 3, every: 1, unit: 'week' }
};

function task(overrides: Partial<TaskView> = {}): TaskView {
	return {
		id: 'task',
		active: true,
		creditsAwarded: 2,
		sealed: null,
		revision: 0,
		schedule: { mode: 'one-off' },
		timezoneOwnerUserId: 'ada',
		lastCompletedAt: null,
		completedCount: 0,
		nextEligibleAt: null,
		windowCompletions: null,
		canComplete: true,
		createdAt: now,
		updatedAt: now,
		timeZoneNote: null,
		...overrides
	} as TaskView;
}

describe('quotaText', () => {
	it('says what is left to whoever completes it, once some is used', () => {
		expect(quotaText(task({ schedule: threeAWeek, windowCompletions: 2 }), 'to-do')).toBe('1 left');
		expect(quotaText(task({ schedule: threeAWeek, windowCompletions: 0 }), 'to-do')).toBeNull();
	});

	it('says how far through it the partner is to whoever set it', () => {
		expect(quotaText(task({ schedule: threeAWeek, windowCompletions: 0 }), 'set')).toBe(
			'0 of 3 this week'
		);
		expect(quotaText(task({ schedule: threeAWeek, windowCompletions: 3 }), 'set')).toBe(
			'3 of 3 this week'
		);
	});

	it('names the period, however long it is', () => {
		const every = (count: number, unit: 'day' | 'hour' | 'week') =>
			task({
				schedule: { mode: 'rolling-window', limit: { completions: 2, every: count, unit } },
				windowCompletions: 1
			});
		expect(quotaText(every(1, 'day'), 'set')).toBe('1 of 2 today');
		expect(quotaText(every(1, 'hour'), 'set')).toBe('1 of 2 this hour');
		expect(quotaText(every(2, 'week'), 'set')).toBe('1 of 2 in 2 weeks');
	});

	it('says nothing for a task with no quota', () => {
		expect(quotaText(task(), 'to-do')).toBeNull();
		expect(
			quotaText(task({ schedule: { mode: 'rolling-window', limit: null } }), 'set')
		).toBeNull();
	});
});

describe('opensLater', () => {
	it('is true only for an active task with a time still to come', () => {
		expect(opensLater(task({ nextEligibleAt: new Date('2026-10-23T00:00:00Z') }), now)).toBe(true);
		expect(opensLater(task({ nextEligibleAt: new Date('2026-10-21T00:00:00Z') }), now)).toBe(false);
		expect(opensLater(task(), now)).toBe(false);
		expect(
			opensLater(task({ active: false, nextEligibleAt: new Date('2026-10-23T00:00:00Z') }), now)
		).toBe(false);
	});
});
