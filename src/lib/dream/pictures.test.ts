import { describe, expect, it } from 'vitest';
import type { DreamElement } from './elements';
import { picturePrompt } from './pictures';

const ottilie: DreamElement = {
	id: 'ottilie',
	type: 'character',
	name: 'Ottilie',
	also: [],
	shown: true,
	fields: [
		{ name: 'appearance', text: 'Silver bob, reading glasses on a chain.', shown: true },
		{ name: 'unspoken', text: 'Waiting for you.', shown: false }
	],
	stats: []
};
const study: DreamElement = {
	id: 'study',
	type: 'place',
	name: 'The study',
	also: [],
	shown: true,
	fields: [{ name: 'feel', text: 'Lamplight on old leather.', shown: true }],
	stats: []
};

describe('picturePrompt', () => {
	it('describes people and places only from their recorded appearance', () => {
		expect(
			picturePrompt(
				{ of: 'ottilie, study', caption: 'She waits by the desk.' },
				[ottilie, study],
				'steamy'
			)
		).toEqual({
			prompt:
				'She waits by the desk.\nOttilie: Silver bob, reading glasses on a chain.\nThe study: Lamplight on old leather.',
			heat: 3
		});
	});

	it('leaves out what is not appearance, and anyone unknown', () => {
		const asked = picturePrompt({ of: 'ottilie nobody', caption: '' }, [ottilie], 'none');
		expect(asked?.prompt).not.toContain('Waiting');
		expect(asked?.heat).toBe(1);
		expect(picturePrompt({ of: 'nobody', caption: ' ' }, [ottilie], 'none')).toBeNull();
	});
});
