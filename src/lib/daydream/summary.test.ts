import { describe, expect, it } from 'vitest';
import type { DaydreamNarrator, DaydreamStance, DialValue } from '../daydream';
import { testCharacter, testIdea } from '../testing/daydream-setup';
import {
	MAX_SUMMARY,
	type MarkedSummary,
	parseMarkedSummary,
	type SummaryPiece,
	setupSummary
} from './summary';

function setup(
	narrator: DaydreamNarrator,
	stance: DaydreamStance,
	names: string[],
	heat: DialValue | null = 3,
	protagonistName = ''
) {
	return {
		voice: { narrator, stance, protagonistName },
		characters: names.map((name, at) =>
			testCharacter({
				name,
				casting: {
					partId: at === 0 ? 'p1' : null,
					relationship: at === 0 ? 'your boss' : '',
					part: ''
				}
			})
		),
		idea: testIdea({
			title: 'After hours',
			premise: 'kept late after the presentation you botched',
			parts: [{ id: 'p1', name: 'the interviewer', description: '' }],
			dials: { heat, kink: null }
		})
	};
}

/** Each paragraph as text, with each blank in brackets. */
const read = (paragraphs: SummaryPiece[][]) =>
	paragraphs.map((pieces) =>
		pieces.map((piece) => (piece.kind === 'text' ? piece.text : `[${piece.label}]`)).join('')
	);

/** A summary as the model marks it, read for `names`. */
function marked(raw: string, names = ['Mara']): MarkedSummary {
	const parsed = parseMarkedSummary(raw, names);
	if (!parsed) {
		throw new Error(`"${raw}" did not parse`);
	}
	return parsed;
}

describe('parseMarkedSummary', () => {
	it('makes each marked first mention a blank, with the words the model used', () => {
		expect(
			parseMarkedSummary(
				'A [[heat|slow-burning]] night in [[idea|the empty office]], where [[mara|your boss]] asks you to stay. [[voice|She talks to you]].',
				['Mara']
			)
		).toEqual([
			{ kind: 'text', text: 'A ' },
			{ kind: 'slot', slot: { kind: 'heat' }, words: 'slow-burning', key: 'heat' },
			{ kind: 'text', text: ' night in ' },
			{ kind: 'slot', slot: { kind: 'idea' }, words: 'the empty office', key: 'idea' },
			{ kind: 'text', text: ', where ' },
			{
				kind: 'slot',
				slot: { kind: 'character', name: 'Mara' },
				words: 'your boss',
				key: 'mara'
			},
			{ kind: 'text', text: ' asks you to stay. ' },
			{ kind: 'slot', slot: { kind: 'voice' }, words: 'She talks to you', key: 'voice' },
			{ kind: 'text', text: '.' }
		]);
	});

	it('keeps the words of a marker for nothing in the story, or for something already marked, and the marker for debug mode', () => {
		expect(
			parseMarkedSummary('[[Mara|Mara]] meets [[Bel|Bel]], and [[Mara|Mara]] smiles.', ['Mara'])
		).toEqual([
			{ kind: 'slot', slot: { kind: 'character', name: 'Mara' }, words: 'Mara', key: 'Mara' },
			{ kind: 'text', text: ' meets ' },
			{ kind: 'text', text: 'Bel', marker: '[[Bel|Bel]]' },
			{ kind: 'text', text: ', and ' },
			{ kind: 'text', text: 'Mara', marker: '[[Mara|Mara]]' },
			{ kind: 'text', text: ' smiles.' }
		]);
	});

	it('tidies whitespace, and has nothing to say about a summary with no markers', () => {
		expect(parseMarkedSummary('  The office\n\nhas   emptied out. ', [])).toEqual([
			{ kind: 'text', text: 'The office has emptied out.' }
		]);
	});

	it('is null for a summary that is not one, is too long, or shows a marker it got wrong', () => {
		expect(parseMarkedSummary(undefined, [])).toBeNull();
		expect(parseMarkedSummary('   ', [])).toBeNull();
		expect(parseMarkedSummary('x'.repeat(MAX_SUMMARY + 1), [])).toBeNull();
		expect(parseMarkedSummary('On [[idea the train]].', [])).toBeNull();
		expect(parseMarkedSummary('On [[idea|the [[train]].', [])).toBeNull();
	});
});

describe('setupSummary, without the model’s', () => {
	it('starts from the premise, and says every piece of the setup after it', () => {
		expect(read(setupSummary(setup('none', 'self', ['Mara']), null))).toEqual([
			'Kept late after the presentation you botched.',
			'It’s a [steamy] daydream: [After hours], with [Mara] (the interviewer, your boss). It’s told [in the characters’ own words, with no narrator].'
		]);
	});

	it('says how each preset is told in a sentence of its own', () => {
		const second = (narrator: DaydreamNarrator, stance: DaydreamStance, names: string[]) =>
			read(setupSummary(setup(narrator, stance, names), null))[1];
		expect(second('second-person', 'self', [])).toBe(
			'It’s a [steamy] daydream: [After hours]. It’s told [to you by a narrator].'
		);
		expect(second('third-person', 'absent', ['Ash', 'Bel', 'Cy'])).toBe(
			'It’s a [steamy] daydream: [After hours], with [Ash] (the interviewer, your boss), [Bel] and [Cy]. It’s told [by a narrator, as you watch from outside].'
		);
		expect(second('impersonal', 'self', ['Mara'])).toMatch(
			/\. It’s told \[as a system’s orders to you\]\.$/
		);
	});

	it('takes “an” before a vowel, keeps SFW as it is, and has a blank for no heat at all', () => {
		const second = (heat: DialValue | null) =>
			read(setupSummary(setup('none', 'self', ['Mara'], heat), null))[1];
		expect(second(4)).toMatch(/^It’s an \[explicit\] daydream/);
		expect(second(1)).toMatch(/^It’s a \[SFW\] daydream/);
		expect(second(null)).toMatch(/^It’s \[any kind of\] daydream/);
	});

	it('names a voice no preset gives, with whoever the user is playing', () => {
		expect(read(setupSummary(setup('third-person', 'persona', ['Mara'], 3, 'Kit'), null))[1]).toBe(
			'It’s a [steamy] daydream: [After hours], with [Mara] (the interviewer, your boss). It’s told [your own way], as Kit.'
		);
	});

	it('says a part once when who they are already names it', () => {
		const trainee = setup('none', 'self', ['Remy']);
		trainee.characters[0] = testCharacter({
			name: 'Remy',
			casting: { partId: 'p1', relationship: 'The interviewer you are assessing', part: '' }
		});
		expect(read(setupSummary(trainee, null))[1]).toContain(
			'[Remy] (The interviewer you are assessing)'
		);
	});

	it('leaves a premise that ends its sentence as it is, and has no paragraph for none', () => {
		const ended = setup('none', 'self', ['Mara']);
		ended.idea.premise = 'Is this a test?';
		expect(read(setupSummary(ended, null))[0]).toBe('Is this a test?');
		ended.idea.premise = '';
		expect(read(setupSummary(ended, null))).toHaveLength(1);
	});
});

describe('setupSummary, with the model’s', () => {
	const story = setup('none', 'self', ['Mara', 'Bel']);
	const written = (raw: string) => ({ marked: marked(raw, ['Mara', 'Bel']), draft: story });

	it('says only what the model’s paragraph left out', () => {
		expect(
			read(
				setupSummary(
					story,
					written('A [[heat|slow-burning]] evening: [[Mara|your boss]] keeps you late.')
				)
			)
		).toEqual([
			'A [slow-burning] evening: [your boss] keeps you late.',
			'The idea is [After hours], with [Bel]. It’s told [in the characters’ own words, with no narrator].'
		]);
	});

	it('only adds who and where once the heat and the voice are both in it', () => {
		expect(
			read(
				setupSummary(
					story,
					written('A [[heat|hot]] night where you [[voice|in their own words]] Mara.')
				)
			)[1]
		).toBe('The idea is [After hours], with [Mara] (the interviewer, your boss) and [Bel].');
		expect(
			read(
				setupSummary(
					story,
					written(
						'A [[heat|hot]] night in [[idea|the office]] where you [[voice|in their own words]] [[Mara|Mara]].'
					)
				)
			)[1]
		).toBe('[Bel] is in it too.');
		expect(
			read(
				setupSummary(
					story,
					written(
						'A [[heat|hot]] night in [[idea|the office]] where you [[voice|in their own words]] [[Mara|Mara]] and [[Bel|Bel]].'
					)
				)
			)
		).toHaveLength(1);
	});

	it('points each character blank at their place in the list', () => {
		const [first] = setupSummary(story, written('[[Bel|Bel]] and [[Mara|Mara]] are waiting.'));
		expect(first?.filter((piece) => piece.kind === 'character')).toEqual([
			{ kind: 'character', index: 1, label: 'Bel', key: 'Bel' },
			{ kind: 'character', index: 0, label: 'Mara', key: 'Mara' }
		]);
	});

	it('says a heat changed since in its own word, with the article before it agreeing', () => {
		const changed = structuredClone(story);
		changed.idea.dials.heat = 5;
		expect(read(setupSummary(changed, written('A [[heat|slow-burning]] evening.')))[0]).toBe(
			'A [filthy] evening.'
		);
		changed.idea.dials.heat = 4;
		expect(
			read(
				setupSummary(changed, written('It is a [[heat|slow-burning]] evening. A [[Mara|Mara]].'))
			)[0]
		).toBe('It is an [explicit] evening. A [Mara].');
		expect(read(setupSummary(changed, written('An [[heat|explicit]] evening.')))[0]).toBe(
			'An [explicit] evening.'
		);
		changed.idea.dials.heat = 2;
		expect(read(setupSummary(changed, written('An [[heat|explicit]] evening.')))[0]).toBe(
			'A [flirty] evening.'
		);
	});

	it('gives way to the premise once it no longer describes the setup', () => {
		const paragraph = written('[[Mara|Mara]] keeps you late in [[idea|the office]].');
		const premise = 'Kept late after the presentation you botched.';

		const renamed = structuredClone(story);
		renamed.characters[0] = {
			...story.characters[0],
			name: 'Mira'
		} as (typeof story.characters)[0];
		expect(read(setupSummary(renamed, paragraph))[0]).toBe(premise);

		const toldNow = structuredClone(story);
		toldNow.voice = { ...story.voice, narrator: 'second-person' };
		expect(read(setupSummary(toldNow, paragraph))[0]).toBe(premise);

		const otherIdea = structuredClone(story);
		otherIdea.idea.title = 'Elsewhere';
		expect(read(setupSummary(otherIdea, paragraph))[0]).toBe(premise);

		// Someone added is only someone it does not mention yet.
		const more = structuredClone(story);
		more.characters.push(testCharacter({ name: 'Cy' }));
		expect(read(setupSummary(more, paragraph))[0]).toBe('[Mara] keeps you late in [the office].');
	});
});
