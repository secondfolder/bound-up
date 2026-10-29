import { describe, expect, it } from 'vitest';
import type { DreamInputTurn, DreamPassageTurn, DreamSummary } from '../sealed-kinds/dreams';
import type { DreamElement } from './elements';
import {
	changedStat,
	elementsAt,
	expansionsAt,
	historyFor,
	isStuck,
	memoryFor,
	needsFilling,
	type PathTurn,
	proseOf,
	repeatedAt,
	sceneToSummarise,
	similarity
} from './story';

const passage = (id: string, source: string): PathTurn => ({
	id,
	turn: {
		kind: 'passage',
		source,
		request: 'next',
		ended: 'complete',
		model: 'm',
		provider: 'p'
	} satisfies DreamPassageTurn
});

const input = (id: string, text: string): PathTurn => ({
	id,
	turn: {
		kind: 'input',
		text,
		cycles: [],
		answers: [],
		rolls: [],
		fields: []
	} satisfies DreamInputTurn
});

const summary = (turnId: string, text: string): { turnId: string; summary: DreamSummary } => ({
	turnId,
	summary: { text, fromTurnId: 'x' }
});

const ottilie: DreamElement = {
	id: 'ottilie',
	type: 'character',
	name: 'Ottilie',
	also: [],
	shown: true,
	fields: [{ name: 'manner', text: 'Precise.', shown: true }],
	stats: [{ name: 'composure', kind: 'meter', value: 30, max: 100, description: '' }]
};

describe('historyFor', () => {
	it('pairs each passage with what the user did after it', () => {
		const path = [
			passage('p1', 'One.'),
			input('u1', 'I sit.'),
			passage('p2', 'Two.'),
			passage('p3', 'Three.'),
			input('u2', 'I stand.')
		];
		expect(historyFor(path, { kind: 'words', text: 'I stand.' })).toEqual([
			{ passage: 'One.', turn: { kind: 'words', text: 'I sit.' } },
			// Continue: a passage straight after a passage.
			{ passage: 'Two.', turn: { kind: 'continue' } },
			{ passage: 'Three.', turn: { kind: 'words', text: 'I stand.' } }
		]);
	});

	it('reads an empty turn as Continue', () => {
		const path = [passage('p1', 'One.'), input('u1', '  '), passage('p2', 'Two.')];
		expect(historyFor(path, { kind: 'continue' })[0]?.turn).toEqual({ kind: 'continue' });
	});
});

describe('memoryFor', () => {
	it('sends finished scenes as summaries and the passages since word for word', () => {
		const path: PathTurn[] = [];
		for (let index = 1; index <= 12; index += 1) {
			path.push(passage(`p${index}`, `Passage ${index}.`));
		}
		const memory = memoryFor(path, [summary('p9', 'The first scene.')], { kind: 'continue' });
		expect(memory.summaries).toEqual(['The first scene.']);
		// Only three since the summary, but never fewer than six.
		expect(memory.history.map((entry) => entry.passage)).toEqual([
			'Passage 7.',
			'Passage 8.',
			'Passage 9.',
			'Passage 10.',
			'Passage 11.',
			'Passage 12.'
		]);
	});

	it('ignores a summary from another branch, and caps the passages sent', () => {
		const path: PathTurn[] = [];
		for (let index = 1; index <= 20; index += 1) {
			path.push(passage(`p${index}`, `Passage ${index}.`));
		}
		const memory = memoryFor(path, [summary('elsewhere', 'Not this branch.')], {
			kind: 'continue'
		});
		expect(memory.summaries).toEqual([]);
		expect(memory.history).toHaveLength(16);
		expect(memory.history.at(-1)?.passage).toBe('Passage 20.');
	});
});

describe('elementsAt', () => {
	it('adds new elements from footers, moves stats, and takes the latest detail', () => {
		const path = [
			passage(
				'p1',
				'She waits.\n<after>\n{"new":"character","id":"renwick","name":"Renwick","seed":"the porter"}\n{"set":{"ottilie.composure":250}}\n</after>'
			),
			input('u1', 'I knock.'),
			passage('p2', 'He opens.')
		];
		const filled: DreamElement = {
			...ottilie,
			id: 'renwick',
			name: 'Renwick',
			fields: [{ name: 'manner', text: 'Gruff.', shown: true }],
			stats: []
		};
		const elements = elementsAt([ottilie], path, [
			{ turnId: 'p2', detail: { kind: 'element', element: filled } },
			{ turnId: 'elsewhere', detail: { kind: 'element', element: { ...filled, name: 'Wrong' } } }
		]);
		const byId = new Map(elements.map((element) => [element.id, element]));
		// A meter stays within its range.
		expect(byId.get('ottilie')?.stats[0]?.value).toBe(100);
		expect(byId.get('renwick')?.fields).toEqual([{ name: 'manner', text: 'Gruff.', shown: true }]);
	});

	it('knows a card that is still only a name and a seed', () => {
		const [stub] = elementsAt(
			[],
			[
				passage(
					'p1',
					'<after>\n{"new":"place","id":"attic","name":"The attic","seed":"dusty"}\n</after>'
				)
			],
			[]
		);
		expect(stub && needsFilling(stub)).toBe(true);
		expect(needsFilling(ottilie)).toBe(false);
	});
});

describe('expansionsAt', () => {
	it('keeps the latest expansion on this branch for each key', () => {
		const path = [passage('p1', 'x'), passage('p2', 'y')];
		const expansions = expansionsAt(path, [
			{ turnId: 'p1', detail: { kind: 'more', key: 'p1:0', text: 'First.' } },
			{ turnId: 'p1', detail: { kind: 'more', key: 'p1:0', text: 'Second.' } },
			{ turnId: 'gone', detail: { kind: 'more', key: 'gone:0', text: 'No.' } }
		]);
		expect([...expansions]).toEqual([['p1:0', 'Second.']]);
	});
});

describe('sceneToSummarise', () => {
	it('summarises at a scene break', () => {
		const path = [
			passage('p1', 'One.'),
			input('u1', 'go'),
			passage('p2', 'Two.<beat kind="scene"/>')
		];
		expect(sceneToSummarise(path, [])).toEqual({
			fromTurnId: 'p1',
			throughTurnId: 'p2',
			passages: ['One.', 'Two.<beat kind="scene"/>']
		});
	});

	it('summarises a long scene, and only what came after the last summary', () => {
		const path: PathTurn[] = [];
		for (let index = 1; index <= 10; index += 1) {
			path.push(passage(`p${index}`, `Passage ${index}.`));
		}
		expect(sceneToSummarise(path.slice(0, 7), [])).toBeNull();
		expect(sceneToSummarise(path.slice(0, 8), [])?.passages).toHaveLength(8);
		expect(sceneToSummarise(path, [summary('p8', 'Done.')])).toBeNull();
	});

	it('waits while the last turn is the user’s', () => {
		expect(
			sceneToSummarise([passage('p1', 'x<beat kind="scene"/>'), input('u', 'y')], [])
		).toBeNull();
	});
});

describe('repetition', () => {
	it('finds phrases repeated across passages, not in their footers', () => {
		const path = [
			passage('p1', 'She runs a hand through her hair.\n<after>\n{"next":"x"}\n</after>'),
			passage('p2', 'Again she runs a hand through her hair.')
		];
		expect(repeatedAt(path)).toContain('runs a hand through');
		expect(proseOf('Words.<after>{"next":"x"}</after>')).toBe('Words.');
	});
});

describe('escaping a loop', () => {
	const noted = (id: string, next: string) =>
		passage(id, `Words.\n<after>\n${JSON.stringify({ next })}\n</after>`);

	it('notices next-step notes going round in circles', () => {
		const looping = [
			noted('p1', 'She tests whether you will hold still.'),
			noted('p2', 'She tests again whether you will hold still.'),
			noted('p3', 'Again she tests whether you hold still.')
		];
		expect(isStuck(looping, { kind: 'words', text: 'ok' })).toBe(true);
		const moving = [
			noted('p1', 'She tests whether you will hold still.'),
			noted('p2', 'The doorbell rings: a guest arrives early.'),
			noted('p3', 'You are sent to the market alone.')
		];
		expect(isStuck(moving, { kind: 'continue' })).toBe(false);
		expect(similarity('a b', '')).toBe(0);
	});

	it('notices Continue pressed four times running, and nothing else', () => {
		const path = [
			passage('p1', 'One.'),
			input('u1', 'I sit.'),
			passage('p2', 'Two.'),
			passage('p3', 'Three.'),
			input('u2', ''),
			passage('p4', 'Four.'),
			passage('p5', 'Five.')
		];
		// p3 after p2, the empty turn, p5 after p4, and this one: four.
		expect(isStuck(path, { kind: 'continue' })).toBe(true);
		expect(isStuck(path.slice(0, 6), { kind: 'continue' })).toBe(false);
		expect(isStuck(path, { kind: 'words', text: 'I stand.' })).toBe(false);
	});
});

describe('stats', () => {
	it('moves a stat by a change, keeping a meter in range and a count above zero', () => {
		const meter = { kind: 'meter', value: 30, max: 50 };
		expect(changedStat(meter, '+5')).toBe(35);
		expect(changedStat(meter, '+90')).toBe(50);
		expect(changedStat(meter, '-90')).toBe(0);
		expect(changedStat(meter, 12)).toBe(12);
		expect(changedStat({ kind: 'count', value: 2 }, '-5')).toBe(0);
		expect(changedStat({ kind: 'list', value: ['a'] }, 'b')).toEqual(['a', 'b']);
		expect(changedStat({ kind: 'line', value: 'calm' }, 'shaken')).toBe('shaken');
	});

	it('applies changes earned in the text, along this branch only', () => {
		const path = [
			passage('p1', 'You hold still. <set ottilie.composure="+5">She notices.</set>'),
			input('u1', 'x'),
			passage('p2', '<set ottilie.composure="-10"/>A report.')
		];
		const [after] = elementsAt([ottilie], path, []);
		expect(after?.stats[0]?.value).toBe(25);
		const [first] = elementsAt([ottilie], path.slice(0, 1), []);
		expect(first?.stats[0]?.value).toBe(35);
	});
});
