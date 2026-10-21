import { describe, expect, it } from 'vitest';
import type { IdeaTracker } from '../daydream';
import type { DaydreamTurnContent } from '../sealed-kinds/daydreams';
import {
	applyTrackerChanges,
	completeValues,
	describeMove,
	MAX_LIST_ITEMS,
	startValue,
	trackerMoves,
	trackersAt
} from './trackers';

const tracker = (overrides: Partial<IdeaTracker>): IdeaTracker => ({
	id: 'id',
	name: 'Name',
	kind: 'meter',
	start: '',
	about: '',
	...overrides
});

const submission = tracker({ id: 's', name: 'Submission', kind: 'meter', start: '10' });
const days = tracker({ id: 'd', name: 'Days kept', kind: 'count', start: '3' });
const rules = tracker({ id: 'r', name: 'Rules in force', kind: 'list', start: 'Kneel; Eyes down' });
const mood = tracker({ id: 'm', name: 'Mood', kind: 'text', start: 'Wary' });
const all = [submission, days, rules, mood];

const passage = (trackers?: Record<string, number | string | string[]>) => ({
	content: {
		type: 'text',
		text: 'A passage.',
		meta: {
			suggestions: [],
			directions: { add: [], remove: [] },
			...(trackers ? { trackers } : {})
		}
	} satisfies DaydreamTurnContent
});

describe('startValue', () => {
	it('reads what the user wrote as the kind holds it', () => {
		expect(startValue(submission)).toBe(10);
		expect(startValue(days)).toBe(3);
		expect(startValue(rules)).toEqual(['Kneel', 'Eyes down']);
		expect(startValue(mood)).toBe('Wary');
	});

	it('starts a meter or count with nothing written, or nothing numeric, at 0, and keeps a meter on its scale', () => {
		expect(startValue(tracker({ kind: 'meter', start: '' }))).toBe(0);
		expect(startValue(tracker({ kind: 'count', start: 'lots' }))).toBe(0);
		expect(startValue(tracker({ kind: 'meter', start: '250' }))).toBe(100);
		expect(startValue(tracker({ kind: 'meter', start: '-4' }))).toBe(0);
	});

	it('takes a list one item to a line too, dropping blanks and repeats', () => {
		expect(startValue(tracker({ kind: 'list', start: 'Kneel\n\nkneel\nEyes down' }))).toEqual([
			'Kneel',
			'Eyes down'
		]);
	});
});

describe('trackersAt', () => {
	it('holds every start before any passage moved one', () => {
		expect(trackersAt([passage(), passage()], all)).toEqual({
			s: 10,
			d: 3,
			r: ['Kneel', 'Eyes down'],
			m: 'Wary'
		});
	});

	it('takes the latest values stored on the path, a tracker added since falling back to its start', () => {
		const path = [passage({ s: 20 }), passage(), passage({ s: 40, d: 5 }), passage()];
		expect(trackersAt(path, all)).toEqual({ s: 40, d: 5, r: ['Kneel', 'Eyes down'], m: 'Wary' });
	});

	it('leaves out a tracker the idea no longer has, and starts one whose kind changed', () => {
		const path = [passage({ s: 40, gone: 3 })];
		const nowCounted = { ...submission, kind: 'list' as const, start: 'a' };
		expect(trackersAt(path, [nowCounted])).toEqual({ s: ['a'] });
	});
});

describe('applyTrackerChanges', () => {
	const current = completeValues(all, {});

	it('moves what the reply named, matching names whatever their case, and keeps the rest', () => {
		expect(
			applyTrackerChanges(all, current, {
				submission: 25,
				'RULES IN FORCE': ['Kneel', 'Ask first']
			})
		).toEqual({ s: 25, d: 3, r: ['Kneel', 'Ask first'], m: 'Wary' });
	});

	it('coerces to the kind: a meter kept from 0 to 100 and whole, a count whole, relative moves read as such', () => {
		expect(applyTrackerChanges(all, current, { Submission: 140 })?.s).toBe(100);
		expect(applyTrackerChanges(all, current, { Submission: '+5' })?.s).toBe(15);
		expect(applyTrackerChanges(all, current, { Submission: '-20' })?.s).toBe(0);
		expect(applyTrackerChanges(all, current, { 'Days kept': 4.6 })?.d).toBe(5);
		expect(applyTrackerChanges(all, current, { 'Days kept': '12' })?.d).toBe(12);
	});

	it('drops a change it cannot read, at no cost to the others', () => {
		expect(
			applyTrackerChanges(all, current, {
				Submission: 'a lot',
				'Rules in force': 'Kneel',
				Mood: 'x'.repeat(201),
				'Days kept': 4
			})
		).toEqual({ ...current, d: 4 });
	});

	it('keeps a list to items that fit, once each, and to its cap', () => {
		const many = Array.from({ length: MAX_LIST_ITEMS + 5 }, (_, index) => `Rule ${index}`);
		expect(
			applyTrackerChanges(all, current, {
				'Rules in force': [' Kneel ', 'kneel', '', 'y'.repeat(81)]
			})?.r
		).toEqual(['Kneel']);
		expect(applyTrackerChanges(all, current, { 'Rules in force': many })?.r).toHaveLength(
			MAX_LIST_ITEMS
		);
	});

	it('is null when nothing moved: no block, names it does not know, or the same values', () => {
		expect(applyTrackerChanges(all, current, undefined)).toBeNull();
		expect(applyTrackerChanges(all, current, ['Submission'])).toBeNull();
		expect(applyTrackerChanges(all, current, { Trust: 50 })).toBeNull();
		expect(applyTrackerChanges(all, current, { Submission: 10, Mood: 'Wary' })).toBeNull();
		expect(applyTrackerChanges([], {}, { Submission: 10 })).toBeNull();
	});
});

describe('trackerMoves and describeMove', () => {
	it('says what moved, in the idea’s order, from what to what', () => {
		const before = completeValues(all, {});
		const after = { ...before, r: ['Kneel', 'Ask first'], s: 25 };
		const moves = trackerMoves(all, before, after);
		expect(moves.map((move) => move.name)).toEqual(['Submission', 'Rules in force']);
		expect(moves.map(describeMove)).toEqual([
			'Submission 10 → 25',
			'Rules in force: + Ask first, − Eyes down'
		]);
		expect(describeMove({ id: 'm', name: 'Mood', from: 'Wary', to: 'Eager' })).toBe('Mood: Eager');
		expect(trackerMoves(all, before, before)).toEqual([]);
	});
});
