import { describe, expect, it } from 'vitest';
import {
	type Axis,
	comboParams,
	describeCombo,
	diffTexts,
	placeholderSpans,
	sideBySide
} from './prompt-review';

const axes: Axis[] = [
	{ id: 'narrator', label: 'Narrator', kind: 'structural', values: [], baseline: 'none' },
	{ id: 'heat', label: 'Heat', kind: 'structural', values: [], baseline: 'unset' }
];

describe('combinations', () => {
	it('name only what differs from the baseline, in a line and in a query', () => {
		expect(describeCombo(axes, { narrator: 'none', heat: 'unset' })).toBe('baseline');
		expect(describeCombo(axes, { narrator: 'monologue', heat: 'unset' })).toBe(
			'narrator=monologue'
		);
		expect(comboParams(axes, { narrator: 'monologue', heat: '3' })).toEqual([
			['a.narrator', 'monologue'],
			['a.heat', '3']
		]);
	});
});

describe('placeholderSpans', () => {
	it('sets the user’s words apart from the prompt’s own', () => {
		expect(placeholderSpans('Name: ⟦character1.name⟧.')).toEqual([
			{ text: 'Name: ', placeholder: false },
			{ text: '⟦character1.name⟧', placeholder: true },
			{ text: '.', placeholder: false }
		]);
	});
});

describe('diffTexts', () => {
	it('marks the changed words inside a changed line', () => {
		const { lines, added, removed } = diffTexts(
			'One.\nThe quick fox.\nThree.',
			'One.\nThe slow fox.\nThree.'
		);
		expect({ added, removed }).toEqual({ added: 1, removed: 1 });
		expect(lines).toEqual([
			{ kind: 'same', text: 'One.', before: 1, after: 1 },
			{
				kind: 'removed',
				before: 2,
				spans: [
					{ text: 'The ', changed: false },
					{ text: 'quick', changed: true },
					{ text: ' fox.', changed: false }
				]
			},
			{
				kind: 'added',
				after: 2,
				spans: [
					{ text: 'The ', changed: false },
					{ text: 'slow', changed: true },
					{ text: ' fox.', changed: false }
				]
			},
			{ kind: 'same', text: 'Three.', before: 3, after: 3 }
		]);
	});

	it('folds unchanged lines far from any change', () => {
		const before = Array.from({ length: 20 }, (_, index) => `line ${index}`).join('\n');
		const after = before.replace('line 10', 'line ten');
		const { lines } = diffTexts(before, after, { context: 2 });
		expect(lines[0]).toEqual({ kind: 'skipped', count: 8 });
		expect(lines.at(-1)).toEqual({ kind: 'skipped', count: 7 });
		expect(lines.filter((line) => line.kind === 'same')).toHaveLength(4);
	});

	it('can leave out spaces at the ends of lines', () => {
		expect(diffTexts('a b \n', ' a b\n', { ignoreWhitespace: true }).added).toBe(0);
		expect(diffTexts('a b \n', ' a b\n').added).toBe(1);
	});

	it('pairs each removed line with the one that replaced it, side by side', () => {
		const { lines } = diffTexts('same\nold one\nold two\n', 'same\nnew one\n');
		const rows = sideBySide(lines);
		expect(rows.map(({ before, after }) => [before?.kind ?? null, after?.kind ?? null])).toEqual([
			['same', 'same'],
			['removed', 'added'],
			['removed', null]
		]);
	});
});
