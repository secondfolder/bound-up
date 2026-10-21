import { describe, expect, it } from 'vitest';
import { testCharacter, testDaydreamSetup, testIdea } from '$lib/testing/daydream-setup';
import {
	describeSettings,
	settingsChange,
	stillInEffect,
	withoutDaydreamSettings,
	withSettings
} from './story-settings';

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
		expect(changed.dials).toEqual({ intensity: 3, pace: 3, length: 'long', thoughts: 'shown' });
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
		expect(describeSettings({ length: 'long' })).toBe('Now longer passages.');
		expect(describeSettings({ length: 'medium' })).toBe('Now no preferred passage length.');
		expect(describeSettings({ pace: 2, heat: 4, kink: 1 })).toBe(
			"Now pace slow, the idea's heat Explicit and the idea's kink Vanilla."
		);
		expect(describeSettings({ characters: [{ name: 'Mara', libido: 5, kink: 3 }] })).toBe(
			"Now Mara's libido Slutty and Mara's kink Kinky."
		);
	});
});

describe('a character’s own dials', () => {
	const cast = testDaydreamSetup({
		characters: [testCharacter({ name: 'Mara' })]
	});

	it('changes only what moved, for a character in the story, and puts it back', () => {
		const change = settingsChange(cast, {
			characters: [
				{ name: 'mara', libido: 5 },
				{ name: 'Nobody', libido: 5 }
			]
		});
		expect(change).toEqual({
			settings: { characters: [{ name: 'Mara', libido: 5 }] },
			settingsBefore: { characters: [{ name: 'Mara', libido: null }] }
		});
		const changed = withSettings(cast, change?.settings ?? {});
		expect(changed.characters[0]?.dials.libido).toBe(5);
		expect(stillInEffect(changed, change?.settings ?? {})).toBe(true);
		const undone = withSettings(changed, change?.settingsBefore ?? {});
		expect(undone.characters[0]?.dials.libido).toBeNull();
	});

	it('is all a reply to anything but the user’s own words may change', () => {
		expect(withoutDaydreamSettings({ heat: 5, characters: [{ name: 'Mara', libido: 4 }] })).toEqual(
			{ characters: [{ name: 'Mara', libido: 4 }] }
		);
		expect(withoutDaydreamSettings({ heat: 5 })).toBeUndefined();
	});
});
