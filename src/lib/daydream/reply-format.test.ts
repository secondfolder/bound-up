import { describe, expect, it } from 'vitest';
import { parseReply, visiblePassage } from './reply-format';

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

describe('parseReply', () => {
	it('splits the passage from a valid block', () => {
		const parsed = parseReply(`She waits.\n\n<meta>\n${JSON.stringify(meta)}\n</meta>`);
		expect(parsed.passage).toBe('She waits.');
		expect(parsed.meta).toMatchObject(meta);
	});

	it('keeps the passage when there is no block', () => {
		expect(parseReply('  She waits.  ')).toEqual({ passage: 'She waits.', meta: null });
	});

	it('keeps the passage when the block does not parse', () => {
		expect(parseReply('She waits.\n<meta>\n{not json\n</meta>')).toEqual({
			passage: 'She waits.',
			meta: null
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
