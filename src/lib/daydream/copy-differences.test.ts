import { describe, expect, it } from 'vitest';
import { testCharacter, testIdea } from '$lib/testing/daydream-setup';
import {
	characterDifferences,
	ideaDifferences,
	takeCharacterField,
	takeIdeaField
} from './copy-differences';

describe('ideaDifferences', () => {
	const library = testIdea({ premise: 'A strict interview.', dials: { heat: 1, kink: null } });

	it('names each field that differs, the dials in their own words, and nothing else', () => {
		const here = {
			...library,
			premise: 'A tender evening.',
			dials: { heat: 4 as const, kink: null }
		};
		expect(ideaDifferences(here, library)).toEqual([
			{
				key: 'premise',
				label: 'What it’s about',
				here: 'A tender evening.',
				library: 'A strict interview.'
			},
			{ key: 'heat', label: 'Heat', here: 'Explicit', library: 'SFW' }
		]);
		expect(ideaDifferences(library, { ...library, premise: ' A strict interview. ' })).toEqual([]);
	});

	it('takes one field across, either way, leaving the rest', () => {
		const here = {
			...library,
			premise: 'A tender evening.',
			tone: 'warm',
			dials: { heat: 4 as const, kink: null }
		};
		const updated = takeIdeaField(library, here, 'heat');
		expect(updated.dials.heat).toBe(4);
		expect(updated.premise).toBe('A strict interview.');
		expect(takeIdeaField(here, library, 'premise').premise).toBe('A strict interview.');
		expect(takeIdeaField(here, library, 'premise').tone).toBe('warm');
	});
});

describe('characterDifferences', () => {
	const library = testCharacter({ name: 'Mara', personality: 'cold' });

	it('compares the fields and every dial', () => {
		const here = {
			...library,
			personality: 'tender',
			dials: { ...library.dials, libido: 5 as const, tone: 'warm' as const }
		};
		expect(characterDifferences(here, library).map((difference) => difference.key)).toEqual([
			'personality',
			'tone',
			'libido'
		]);
		const libido = characterDifferences(here, library).find((each) => each.key === 'libido');
		expect(libido).toMatchObject({ label: 'Libido', here: 'Slutty' });
	});

	it('takes one field or dial across', () => {
		const here = { ...library, dials: { ...library.dials, libido: 5 as const } };
		expect(takeCharacterField(library, here, 'libido').dials.libido).toBe(5);
		expect(takeCharacterField(here, library, 'personality').personality).toBe('cold');
	});
});
