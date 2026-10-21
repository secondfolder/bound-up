import { describe, expect, it } from 'vitest';
import { testDaydreamSetup, testIdea } from '$lib/testing/daydream-setup';
import { describeSettings, settingsChange, stillInEffect, withSettings } from './story-settings';

const setup = testDaydreamSetup({
	dials: { intensity: 3, pace: 3, length: 'medium' },
	idea: testIdea({ dials: { heat: null, kink: 2 } })
});

describe('settingsChange', () => {
	it('keeps only what moved, with what it was', () => {
		expect(settingsChange(setup, { length: 'long', pace: 3, heat: 4 })).toEqual({
			settings: { length: 'long', heat: 4 },
			settingsBefore: { length: 'medium', heat: null }
		});
	});

	it('is nothing when nothing moves, or nothing was said', () => {
		expect(settingsChange(setup, { length: 'medium', kink: 2 })).toBeNull();
		expect(settingsChange(setup, undefined)).toBeNull();
	});
});

describe('withSettings and stillInEffect', () => {
	it('applies the story dials and the idea’s heat and kink, and puts them back', () => {
		const changed = withSettings(setup, { length: 'long', heat: 4 });
		expect(changed.dials).toEqual({ intensity: 3, pace: 3, length: 'long' });
		expect(changed.idea.dials).toEqual({ heat: 4, kink: 2 });
		expect(stillInEffect(changed, { length: 'long', heat: 4 })).toBe(true);
		const undone = withSettings(changed, { length: 'medium', heat: null });
		expect(undone.dials).toEqual(setup.dials);
		expect(undone.idea.dials).toEqual(setup.idea.dials);
		expect(stillInEffect(undone, { length: 'long', heat: 4 })).toBe(false);
	});
});

describe('describeSettings', () => {
	it('says what is set now, in the dials’ own words', () => {
		expect(describeSettings({ length: 'long' })).toBe('Now long passages, as you asked.');
		expect(describeSettings({ pace: 2, heat: 4, kink: 1 })).toBe(
			'Now pace slow, heat Explicit and kink Vanilla, as you asked.'
		);
	});
});
