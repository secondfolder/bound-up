import { describe, expect, it } from 'vitest';
import { copyState, hasChip, mergeChips, toggleChip } from './chips';

describe('toggleChip', () => {
	it('adds a phrase to an empty field, or after what is there', () => {
		expect(toggleChip('', 'patient')).toBe('patient');
		expect(toggleChip('calm', 'patient')).toBe('calm, patient');
		expect(toggleChip('calm,', 'patient')).toBe('calm, patient');
		expect(toggleChip('calm\n', 'patient')).toBe('calm\npatient');
	});

	it('takes a phrase out, leaving the rest as written', () => {
		expect(toggleChip('calm, patient, sardonic', 'patient')).toBe('calm, sardonic');
		expect(toggleChip('calm, patient', 'calm')).toBe('patient');
		expect(toggleChip('patient', 'patient')).toBe('');
		expect(toggleChip('Watches everything.\npatient', 'patient')).toBe('Watches everything.');
		expect(toggleChip('patient\nWatches everything.', 'patient')).toBe('Watches everything.');
	});

	it('matches regardless of case and spacing', () => {
		expect(hasChip('Calm,  PATIENT ', 'patient')).toBe(true);
		expect(toggleChip('Calm,  PATIENT ', 'patient')).toBe('Calm');
	});

	it('does not match a phrase inside a longer one', () => {
		expect(hasChip('very patient', 'patient')).toBe(false);
		expect(toggleChip('very patient', 'patient')).toBe('very patient, patient');
	});

	it('toggles back to where it started', () => {
		const start = 'Calm. Never rushes.\nsardonic';
		expect(toggleChip(toggleChip(start, 'patient'), 'patient')).toBe(start);
	});

	it('ignores an empty chip', () => {
		expect(toggleChip('calm', '  ')).toBe('calm');
	});
});

describe('mergeChips', () => {
	it('adds new chips after the curated ones, without repeats', () => {
		expect(mergeChips(['calm', 'patient'], ['Patient', 'wry'])).toEqual(['calm', 'patient', 'wry']);
	});
});

describe('copyState', () => {
	const library = new Map([['c1', { revision: 3 }]]);

	it('says how a copy stands against the library', () => {
		expect(copyState({ sourceId: null, sourceRevision: null }, library)).toBe('unsaved');
		expect(copyState({ sourceId: 'gone', sourceRevision: 1 }, library)).toBe('missing');
		expect(copyState({ sourceId: 'c1', sourceRevision: 2 }, library)).toBe('updated');
		expect(copyState({ sourceId: 'c1', sourceRevision: 3 }, library)).toBe('in-sync');
	});
});
