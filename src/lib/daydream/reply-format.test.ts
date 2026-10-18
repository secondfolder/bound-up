import { describe, expect, it } from 'vitest';
import { parseReply, visiblePassage, visibleReply } from './reply-format';

const meta = {
	suggestions: ['Kneel.', 'Ask why.'],
	directions: { add: [{ id: 'slower', label: 'Slower' }], remove: ['faster'] },
	readAs: 'action'
};

describe('visiblePassage', () => {
	it('shows everything before the block', () => {
		expect(visiblePassage('She waits.\n\n<meta>\n{"sugg')).toBe('She waits.');
	});

	it('hides a half-arrived opening tag', () => {
		for (const partial of ['<', '<m', '<me', '<met', '<meta']) {
			expect(visiblePassage(`She waits.\n${partial}`)).toBe('She waits.');
		}
	});

	it('leaves ordinary text alone', () => {
		expect(visiblePassage('She waits')).toBe('She waits');
		expect(visiblePassage('a < b')).toBe('a < b');
	});
});

describe('visibleReply', () => {
	const written = '<yours>\n"Charlie, the fox is safe."\n</yours>\nCharlie sighs.';

	it('is just the passage when the turn was not written out', () => {
		expect(visibleReply('She waits.\n<me')).toEqual({
			passage: 'She waits.',
			expansion: null,
			reading: null
		});
	});

	it('shows nothing of a half-arrived opening tag', () => {
		for (const partial of ['<', '<y', '<your', '<yours', '\n<yours', '<re', '<reading>dir']) {
			expect(visibleReply(partial)).toEqual({ passage: '', expansion: null, reading: null });
		}
	});

	it('shows the written-out turn as it arrives, and no passage until it closes', () => {
		expect(visibleReply('<yours>\n"Charlie, the')).toEqual({
			passage: '',
			expansion: '"Charlie, the',
			reading: null
		});
		expect(visibleReply('<yours>\n"Charlie, the fox is safe."\n</you')).toEqual({
			passage: '',
			expansion: '"Charlie, the fox is safe."',
			reading: null
		});
	});

	it('shows the passage after it, without either block', () => {
		expect(visibleReply(`${written}\n<meta>\n{"sugg`)).toEqual({
			passage: 'Charlie sighs.',
			expansion: '"Charlie, the fox is safe."',
			reading: null
		});
	});

	it('knows the reading as soon as its tag closes, before anything else shows', () => {
		expect(visibleReply('<reading>direction</reading>\n')).toEqual({
			passage: '',
			expansion: null,
			reading: 'direction'
		});
		expect(visibleReply('<reading>direction</reading>\nThe air war')).toEqual({
			passage: 'The air war',
			expansion: null,
			reading: 'direction'
		});
		expect(visibleReply('<reading>instruction</reading>\n<yours>"Mara, the')).toEqual({
			passage: '',
			expansion: '"Mara, the',
			reading: 'instruction'
		});
	});

	it('only takes a block at the very start', () => {
		expect(visibleReply('She says <yours> is hers.').expansion).toBeNull();
	});
});

describe('parseReply', () => {
	it('splits off the user’s turn written out, before the passage', () => {
		const parsed = parseReply(
			`  <yours>\n"Charlie, the fox is safe."\n</yours>\n\nCharlie sighs.\n<meta>\n${JSON.stringify({ ...meta, readAs: 'instruction' })}\n</meta>`
		);
		expect(parsed.expansion).toBe('"Charlie, the fox is safe."');
		expect(parsed.passage).toBe('Charlie sighs.');
		expect(parsed.meta?.readAs).toBe('instruction');
	});

	it('keeps everything as the passage when the written-out turn never closes', () => {
		expect(parseReply('<yours>\nI tell her.\nShe smiles.')).toEqual({
			passage: 'I tell her.\nShe smiles.',
			meta: null,
			expansion: null,
			reading: null
		});
	});

	it('reads the reading first, then the written-out turn, then the passage', () => {
		const parsed = parseReply(
			'<reading> Instruction </reading>\n<yours>"Mara, the fox is safe."</yours>\nMara sighs.\n<meta>{}</meta>'
		);
		expect(parsed).toMatchObject({
			reading: 'instruction',
			expansion: '"Mara, the fox is safe."',
			passage: 'Mara sighs.'
		});
	});

	it('ignores a reading it cannot name, and keeps the rest', () => {
		expect(parseReply('<reading>sideways</reading>\nShe smiles.')).toMatchObject({
			reading: null,
			passage: 'She smiles.'
		});
	});

	it('drops an empty written-out turn', () => {
		expect(parseReply('<yours> </yours>She smiles.').expansion).toBeNull();
	});

	it('splits the passage from a valid block', () => {
		const parsed = parseReply(`She waits.\n\n<meta>\n${JSON.stringify(meta)}\n</meta>`);
		expect(parsed.passage).toBe('She waits.');
		expect(parsed.meta).toMatchObject(meta);
	});

	it('keeps the passage when there is no block', () => {
		expect(parseReply('  She waits.  ')).toEqual({
			passage: 'She waits.',
			meta: null,
			expansion: null,
			reading: null
		});
	});

	it('keeps the passage when the block does not parse', () => {
		expect(parseReply('She waits.\n<meta>\n{not json\n</meta>')).toEqual({
			passage: 'She waits.',
			meta: null,
			expansion: null,
			reading: null
		});
		expect(parseReply('She waits.\n<meta>\n{"suggestions": "no"}\n</meta>').meta).toBeNull();
	});

	it('accepts a fenced block, and one never closed', () => {
		const fenced = parseReply(`x\n<meta>\n\`\`\`json\n${JSON.stringify(meta)}\n\`\`\`\n</meta>`);
		expect(fenced.meta?.suggestions).toEqual(meta.suggestions);
		expect(parseReply(`x\n<meta>\n${JSON.stringify(meta)}`).meta?.readAs).toBe('action');
	});

	it('fills in what the model left out', () => {
		expect(parseReply('x\n<meta>\n{}\n</meta>').meta).toEqual({
			suggestions: [],
			directions: { add: [], remove: [] }
		});
	});

	it('drops a roll that misses a face, and keeps the rest', () => {
		const bad = {
			...meta,
			roll: { prompt: 'Roll', sides: 6, outcomes: [{ min: 1, max: 3, label: 'No' }] }
		};
		const parsed = parseReply(`x\n<meta>\n${JSON.stringify(bad)}\n</meta>`);
		expect(parsed.meta?.roll).toBeUndefined();
		expect(parsed.meta?.suggestions).toEqual(meta.suggestions);
	});

	it('keeps a roll that covers every face', () => {
		const roll = {
			prompt: 'Roll to hold still',
			sides: 6,
			outcomes: [
				{ min: 1, max: 2, label: 'You move' },
				{ min: 3, max: 6, label: 'You hold' }
			]
		};
		expect(parseReply(`x\n<meta>${JSON.stringify({ roll })}</meta>`).meta?.roll).toEqual(roll);
	});
});
