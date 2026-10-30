import { describe, expect, it } from 'vitest';
import type { DreamPreference, DreamSetup } from '../sealed-kinds/dreams';
import { defined } from '../testing/defined';
import { passageRequestFor, recentFrom, wordPreferences } from './assemble';
import { codePick, newSetup, withReading } from './setup-flow';

const pref = (text: string, firmness: DreamPreference['firmness']): DreamPreference => ({
	id: text,
	text,
	firmness,
	appliesTo: '',
	source: 'typed'
});

describe('wordPreferences', () => {
	it('makes hard ones limits, and says how firm the rest are', () => {
		const worded = wordPreferences(
			[pref('No feet', 'hard'), pref('Older people', 'leaning')],
			[pref('Slow', 'default')]
		);
		expect(worded).toEqual({
			limits: ['No feet'],
			preferences: ['Usually: Older people', 'By default: Slow']
		});
	});

	it('leaves a leaning out now and then, and a limit never', () => {
		const worded = wordPreferences(
			[pref('No feet', 'hard'), pref('Older people', 'leaning')],
			[],
			() => 0.1
		);
		expect(worded).toEqual({ limits: ['No feet'], preferences: [] });
	});
});

describe('recentFrom', () => {
	const built = (brief: string, direction: string, name: string): DreamSetup => {
		const read = withReading(newSetup(brief), {
			musts: [],
			research: { needed: false, text: '' },
			spread: { n: 1, reason: '' },
			directions: [{ id: 'd1', p: 1, text: direction }],
			pick: { by: 'code', reason: '' },
			ask: null,
			rest: []
		});
		const picked = codePick(read, 1);
		return {
			...picked,
			build: {
				title: 't',
				heat: 'steamy',
				telling: '',
				presentation: { view: 'scroll', notes: '' },
				capabilities: [],
				elements: [
					{ id: 'a', type: 'character', name, also: [], shown: true, fields: [], stats: [] },
					{ id: 'you', type: 'you', name: 'You', also: [], shown: true, fields: [], stats: [] }
				]
			}
		};
	};

	it('avoids directions taken for briefs like this one, and every name given', () => {
		const recent = recentFrom(
			[
				built('a training dynamic with reports', 'Weekly reports.', 'Ines Varga'),
				built('pirates on a ship', 'A mutiny.', 'Hal Brine')
			],
			'a training dynamic'
		);
		expect(recent.directions).toEqual(['Weekly reports.']);
		expect(recent.names).toEqual(['Ines Varga', 'Ines', 'Varga', 'Hal Brine', 'Hal', 'Brine']);
	});

	it('remembers people, not places or things, which used to crowd them out', () => {
		const setup = built('a brief', 'A direction.', 'Gwen Pryce');
		const withPlace = {
			...setup,
			build: {
				...defined(setup.build, 'the build'),
				elements: [
					...defined(setup.build, 'the build').elements,
					{
						id: 'counter',
						type: 'place',
						name: 'The kitchen counter',
						also: [],
						shown: true,
						fields: [],
						stats: []
					}
				]
			}
		};
		expect(recentFrom([withPlace], 'another').names).toEqual(['Gwen Pryce', 'Gwen', 'Pryce']);
	});

	it('asks for delivery cues and sounds only while the user is listening', () => {
		const setup = built('a brief', 'A direction.', 'Ines Varga');
		const story = { elements: [], summaries: [], history: [], take: null, repeated: [] };
		const worded = { limits: [], preferences: [] };
		const build = defined(setup.build, 'the build');
		const request = (listening: boolean) =>
			passageRequestFor({ ...setup, build }, worded, { ...story, listening });
		expect(request(false).setup.capabilities).not.toContain('voice');
		expect(request(true).setup.capabilities).toContain('voice');
	});
});
