import { describe, expect, it } from 'vitest';
import { fieldText, KNOWN_FIELD_IDS, withField } from '$lib/daydream';
import { testCharacter, testIdea } from '$lib/testing/daydream-setup';
import {
	characterDifferences,
	ideaDifferences,
	takeCharacterField,
	takeIdeaField
} from './copy-differences';

const OWN = '00000000-0000-4000-8000-000000000c01';

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
			fields: withField(library.fields, 'tone', 'warm'),
			dials: { heat: 4 as const, kink: null }
		};
		const updated = takeIdeaField(library, here, 'heat');
		expect(updated.dials.heat).toBe(4);
		expect(updated.premise).toBe('A strict interview.');
		expect(takeIdeaField(here, library, 'premise').premise).toBe('A strict interview.');
		expect(fieldText(takeIdeaField(here, library, 'premise').fields, 'tone')).toBe('warm');
	});

	it('compares fields by id: one added, one changed, its openings', () => {
		const here = {
			...library,
			fields: [
				...withField(library.fields, 'setting', 'a lift'),
				{ id: OWN, kind: null, label: 'The rule', value: 'no talking', spoiler: false }
			],
			openings: [{ id: OWN, label: 'Stuck', situation: 'The lift stops.' }]
		};
		expect(ideaDifferences(here, library)).toEqual([
			{
				key: `field:${KNOWN_FIELD_IDS.setting}`,
				label: 'Where',
				here: 'a lift',
				library: '(not there)'
			},
			{ key: `field:${OWN}`, label: 'The rule', here: 'no talking', library: '(not there)' },
			{ key: 'openings', label: 'Where it can start', here: 'Stuck', library: '(none)' }
		]);
		// Taken from the library, a field it does not have goes.
		expect(takeIdeaField(here, library, `field:${OWN}`).fields.map((field) => field.id)).toEqual([
			KNOWN_FIELD_IDS.setting
		]);
	});

	it('never shows what a spoiler says', () => {
		const here = {
			...library,
			fields: [{ id: OWN, kind: null, label: 'The twist', value: 'she planned it', spoiler: true }]
		};
		const [difference] = ideaDifferences(here, library);
		expect(difference).toMatchObject({ label: 'The twist', here: '(a spoiler, kept hidden)' });
		expect(JSON.stringify(ideaDifferences(here, library))).not.toContain('planned');
	});
});

describe('characterDifferences', () => {
	const library = testCharacter({ name: 'Mara', personality: 'cold' });

	it('compares the fields and every dial', () => {
		const here = {
			...library,
			fields: withField(library.fields, 'personality', 'tender'),
			dials: { ...library.dials, libido: 5 as const, tone: 'warm' as const }
		};
		expect(characterDifferences(here, library).map((difference) => difference.key)).toEqual([
			`field:${KNOWN_FIELD_IDS.personality}`,
			'tone',
			'libido'
		]);
		const libido = characterDifferences(here, library).find((each) => each.key === 'libido');
		expect(libido).toMatchObject({ label: 'Libido', here: 'Slutty' });
		const [personality] = characterDifferences(here, library);
		expect(personality).toMatchObject({ label: 'Personality', here: 'tender', library: 'cold' });
	});

	it('takes one field or dial across', () => {
		const here = {
			...library,
			fields: withField(library.fields, 'personality', 'tender'),
			dials: { ...library.dials, libido: 5 as const }
		};
		expect(takeCharacterField(library, here, 'libido').dials.libido).toBe(5);
		const taken = takeCharacterField(here, library, `field:${KNOWN_FIELD_IDS.personality}`);
		expect(fieldText(taken.fields, 'personality')).toBe('cold');
	});
});
