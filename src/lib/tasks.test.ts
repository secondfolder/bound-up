import { describe, expect, it } from 'vitest';
import type { PartnershipControl } from './partnership';
import { managersFromControl, type SpaceForRules } from './spaces';
import {
	canCompleteTask,
	groupTasksSet,
	groupTasksToDo,
	isTaskCompletableAt,
	type TaskRuleRecord,
	taskListFor
} from './tasks';

const ADA = 'ada';
const JUN = 'jun';
const MO = 'mo';

/** Ada and Jun's shared space, Ada having invited Jun, under a given control. */
function shared(control: PartnershipControl): SpaceForRules {
	return {
		kind: 'shared',
		members: managersFromControl(control, { inviterId: ADA, inviteeId: JUN })
	};
}

const solo: SpaceForRules = { kind: 'solo', members: [{ userId: ADA, canManage: true }] };

/** A task Ada wrote for Jun, unless told otherwise. */
function task(overrides: Partial<TaskRuleRecord> = {}): TaskRuleRecord {
	return {
		createdByUserId: ADA,
		assigneeUserId: JUN,
		active: true,
		nextEligibleAt: null,
		...overrides
	};
}

describe('isTaskCompletableAt', () => {
	const now = new Date('2026-09-14T12:00:00Z');

	it('allows an active task with no next eligibility gate', () => {
		expect(isTaskCompletableAt({ active: true, nextEligibleAt: null }, now)).toBe(true);
	});

	it('blocks inactive tasks and future-gated tasks', () => {
		expect(isTaskCompletableAt({ active: false, nextEligibleAt: null }, now)).toBe(false);
		expect(
			isTaskCompletableAt({ active: true, nextEligibleAt: new Date('2026-09-14T12:01:00Z') }, now)
		).toBe(false);
	});

	it('allows a task exactly when its gate is reached', () => {
		expect(
			isTaskCompletableAt({ active: true, nextEligibleAt: new Date('2026-09-14T12:00:00Z') }, now)
		).toBe(true);
	});
});

describe('taskListFor', () => {
	it('puts a task in your own space on your to-do list', () => {
		expect(taskListFor(task({ assigneeUserId: ADA }), solo, ADA)).toBe('to-do');
	});

	it('puts a task set for you on your to-do list, and the setter’s set-for-others', () => {
		expect(taskListFor(task(), shared('inviter'), JUN)).toBe('to-do');
		expect(taskListFor(task(), shared('inviter'), ADA)).toBe('set');
	});

	it('keeps the authorship rule under shared control', () => {
		// Ada wrote it for Jun: never on Ada's to-do list, whoever manages.
		expect(taskListFor(task(), shared('both'), ADA)).toBe('set');
		expect(taskListFor(task(), shared('both'), JUN)).toBe('to-do');
		expect(
			taskListFor(task({ createdByUserId: JUN, assigneeUserId: ADA }), shared('both'), ADA)
		).toBe('to-do');
	});

	it('hides what a change of manager left on the wrong side, rather than deleting it', () => {
		// Ada wrote it for Jun, and then Jun took control: Jun only sets tasks
		// now, and Ada no longer does.
		expect(taskListFor(task(), shared('invitee'), JUN)).toBeNull();
		expect(taskListFor(task(), shared('invitee'), ADA)).toBeNull();
		// And it comes back when control does.
		expect(taskListFor(task(), shared('inviter'), JUN)).toBe('to-do');
	});

	it('shows nothing to someone who is not in the space', () => {
		expect(taskListFor(task(), shared('both'), MO)).toBeNull();
		expect(taskListFor(task({ assigneeUserId: MO }), shared('both'), MO)).toBeNull();
	});

	it('gives a task assigned to nobody to nobody to do', () => {
		expect(taskListFor(task({ assigneeUserId: null }), shared('both'), JUN)).toBe('set');
		expect(taskListFor(task({ assigneeUserId: null }), shared('both'), ADA)).toBe('set');
	});
});

describe('canCompleteTask', () => {
	const now = new Date('2026-09-14T12:00:00Z');

	it('lets the person it is for complete it once it is ready', () => {
		expect(canCompleteTask(task({ nextEligibleAt: now }), shared('both'), JUN, now)).toBe(true);
		expect(canCompleteTask(task({ assigneeUserId: ADA }), solo, ADA, now)).toBe(true);
	});

	it('never lets the author complete it, even under shared control', () => {
		expect(canCompleteTask(task(), shared('both'), ADA, now)).toBe(false);
	});

	it('rejects inactive and not-yet-eligible tasks', () => {
		expect(canCompleteTask(task({ active: false }), shared('inviter'), JUN, now)).toBe(false);
		expect(
			canCompleteTask(
				task({ nextEligibleAt: new Date('2026-09-14T12:01:00Z') }),
				shared('inviter'),
				JUN,
				now
			)
		).toBe(false);
	});
});

describe('grouping tasks', () => {
	const now = new Date('2026-10-22T12:00:00.000Z');
	const groupable = (
		id: string,
		overrides: Partial<{ active: boolean; canComplete: boolean; nextEligibleAt: Date | null }>
	) => ({
		id,
		active: true,
		canComplete: true,
		nextEligibleAt: null,
		...overrides
	});

	it('splits a to-do list into ready, later (soonest first) and inactive', () => {
		const groups = groupTasksToDo([
			groupable('ready-1', {}),
			groupable('later-far', {
				canComplete: false,
				nextEligibleAt: new Date('2026-10-30T00:00:00Z')
			}),
			groupable('off', { active: false, canComplete: false }),
			groupable('ready-2', {}),
			groupable('later-near', {
				canComplete: false,
				nextEligibleAt: new Date('2026-10-23T00:00:00Z')
			})
		]);
		expect(groups.ready.map((t) => t.id)).toEqual(['ready-1', 'ready-2']);
		expect(groups.later.map((t) => t.id)).toEqual(['later-near', 'later-far']);
		expect(groups.inactive.map((t) => t.id)).toEqual(['off']);
	});

	it('splits tasks set for a partner into waiting on them, done for now and inactive', () => {
		// `canComplete` is false on all of these: the viewer set them, so it is
		// never theirs to tick. What matters is whether the partner can.
		const groups = groupTasksSet(
			[
				groupable('open', { canComplete: false }),
				groupable('done', { canComplete: false, nextEligibleAt: new Date('2026-10-23T00:00:00Z') }),
				groupable('due-again', {
					canComplete: false,
					nextEligibleAt: new Date('2026-10-22T11:00:00Z')
				}),
				groupable('off', { active: false, canComplete: false })
			],
			now
		);
		expect(groups.waiting.map((t) => t.id)).toEqual(['open', 'due-again']);
		expect(groups.doneForNow.map((t) => t.id)).toEqual(['done']);
		expect(groups.inactive.map((t) => t.id)).toEqual(['off']);
	});
});
