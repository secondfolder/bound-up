import { describe, expect, it } from 'vitest';
import { DAYDREAM_LIMITS } from '../daydream';
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
		expect(parseReply('She waits.\n<meta>\n["a list"]\n</meta>').meta).toBeNull();
	});

	it('drops a part that is not what it should be, and keeps the rest', () => {
		const parsed = parseReply(
			`x\n<meta>\n${JSON.stringify({ ...meta, suggestions: 'no' })}\n</meta>`
		);
		expect(parsed.meta?.suggestions).toEqual([]);
		expect(parsed.meta?.directions).toEqual(meta.directions);
	});

	// As a real reply wrote it: directions as a plain list, and no closing tag.
	it('reads directions written as a plain list as the ones to add', () => {
		const block =
			'{"suggestions": ["Walk up behind them", "Watch for a while"], "directions": [{"id": "surprise-me", "label": "Surprise me"}]}';
		expect(parseReply(`She hums.\n\n<meta>\n${block}`).meta).toEqual({
			suggestions: ['Walk up behind them', 'Watch for a while'],
			directions: { add: [{ id: 'surprise-me', label: 'Surprise me' }], remove: [] }
		});
	});

	// As real replies wrote them: `"label":Comply"`, `"label": Take your time"`.
	it('mends a label missing its opening quote', () => {
		const block =
			'{"suggestions": ["Kneel."], "directions": {"add": [{"id": "comply", "label":Comply"}, {"id": "slower", "label": Take your time"}], "remove": []}}';
		expect(parseReply(`x\n<meta>\n${block}\n</meta>`).meta?.directions.add).toEqual([
			{ id: 'comply', label: 'Comply' },
			{ id: 'slower', label: 'Take your time' }
		]);
	});

	it('keeps the good directions beside a bad one, and makes an id for a bare or bad one', () => {
		const block = JSON.stringify({
			suggestions: ['Kneel.', 'x'.repeat(400)],
			directions: {
				add: [
					'Go slower',
					{ id: 'Make It Hurt', label: 'Make it hurt' },
					{ id: 'ok', label: '' },
					{ id: 'faster', label: 'Faster' }
				],
				remove: ['old']
			}
		});
		expect(parseReply(`x\n<meta>\n${block}\n</meta>`).meta).toEqual({
			suggestions: ['Kneel.'],
			directions: {
				add: [
					{ id: 'go-slower', label: 'Go slower' },
					{ id: 'make-it-hurt', label: 'Make it hurt' },
					{ id: 'faster', label: 'Faster' }
				],
				remove: ['old']
			}
		});
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

	it('keeps the picture the model described, and drops one too long to send', () => {
		const image = 'A woman in her thirties, kneeling by the fire';
		expect(
			parseReply(`x\n<meta>\n${JSON.stringify({ ...meta, image })}\n</meta>`).meta?.image
		).toBe(image);
		// Too long: salvaged without it, the rest kept.
		const long = parseReply(
			`x\n<meta>\n${JSON.stringify({ ...meta, image: 'x'.repeat(DAYDREAM_LIMITS.imagePrompt + 1) })}\n</meta>`
		).meta;
		expect(long?.image).toBeUndefined();
		expect(long?.suggestions).toEqual(meta.suggestions);
	});

	it('drops a placeholder for a picture, as if the model had left it out', () => {
		// Seen from GLM 5.2: the reply format's own `"image": "..."` copied back.
		for (const image of ['...', '…', 'none', 'N/A', ' . . . ']) {
			const parsed = parseReply(`x\n<meta>\n${JSON.stringify({ ...meta, image })}\n</meta>`).meta;
			expect(parsed?.image, image).toBeUndefined();
			expect(parsed?.suggestions).toEqual(meta.suggestions);
		}
		// The same in a block the strict schema refuses, read part by part.
		const salvaged = parseReply(
			`x\n<meta>\n${JSON.stringify({ ...meta, image: '...', roll: { sides: 6 } })}\n</meta>`
		).meta;
		expect(salvaged?.image).toBeUndefined();
		expect(salvaged?.suggestions).toEqual(meta.suggestions);
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

describe('parseReply, settings', () => {
	const withMeta = (block: string) => parseReply(`She slows down.\n<meta>\n${block}\n</meta>`).meta;

	it('reads the settings the user asked for', () => {
		expect(withMeta('{"settings": {"length": "long", "heat": 4}}')?.settings).toEqual({
			length: 'long',
			heat: 4
		});
	});

	it('keeps what holds of them, drops the rest, and never takes what they were from the model', () => {
		const salvaged = withMeta(
			'{"suggestions": ["Go on."], "settings": {"length": "endless", "pace": 2, "limits": "none"}, "settingsBefore": {"pace": 5}}'
		);
		expect(salvaged?.settings).toEqual({ pace: 2 });
		expect(salvaged?.settingsBefore).toBeUndefined();
		expect(salvaged?.suggestions).toEqual(['Go on.']);
		expect(withMeta('{"settings": {"heat": 9}}')?.settings).toBeUndefined();
	});
});

describe('parseReply, drift', () => {
	it('keeps the line on how the story moved on, held to its cap', () => {
		const block = (drifted: string) =>
			parseReply(
				`She softens.\n<meta>\n${JSON.stringify({ suggestions: ['x'], drifted })}\n</meta>`
			).meta;
		expect(block('Mara is tender now.')?.drifted).toBe('Mara is tender now.');
		expect(block('x'.repeat(201))?.drifted).toBeUndefined();
	});
});

describe('parseReply, trackers', () => {
	it('hands back what the reply moved, by name and as written, and never as stored metadata', () => {
		const parsed = parseReply(
			`She kneels.\n<meta>\n${JSON.stringify({ suggestions: ['x'], directions: { add: [], remove: [] }, trackers: { Submission: 25 } })}\n</meta>`
		);
		expect(parsed.trackers).toEqual({ Submission: 25 });
		expect(parsed.meta).not.toHaveProperty('trackers');
	});

	it('keeps them from a block the schema refused, and has none for a reply that moved none', () => {
		const salvaged = parseReply(
			`x\n<meta>\n${JSON.stringify({ suggestions: [7], trackers: { Rules: ['Kneel'] } })}\n</meta>`
		);
		expect(salvaged.trackers).toEqual({ Rules: ['Kneel'] });
		expect(salvaged.meta).not.toHaveProperty('trackers');
		expect(parseReply('x\n<meta>\n{"suggestions": []}\n</meta>')).not.toHaveProperty('trackers');
		expect(parseReply('x')).not.toHaveProperty('trackers');
	});
});
