import { describe, expect, it } from 'vitest';
import {
	type Block,
	formatPassage,
	plainPassage,
	type Run,
	voiceOf,
	withQuotes
} from './passage-format';

const paragraphs = (blocks: Block[]) =>
	blocks.map((block) =>
		block.kind === 'break' ? '<break>' : block.runs.map((run) => run.text).join('')
	);

const runs = (text: string, options = {}) =>
	formatPassage(text, options).flatMap((block) => (block.kind === 'paragraph' ? block.runs : []));

/** The runs as `text` plus the flags that are set, for readable expectations. */
const shape = (list: Run[]) =>
	list.map((run) =>
		[
			run.text,
			run.bold ? 'b' : '',
			run.italic ? 'i' : '',
			run.dialogue ? 'd' : '',
			run.speaker ? `@${run.speaker}` : '',
			run.sound ? 's' : '',
			run.marked ? 'm' : ''
		]
			.filter(Boolean)
			.join(' ')
	);

/** Whether every run, everywhere, is exactly the stored text at its offsets. */
const verbatim = (text: string, blocks: Block[]) =>
	blocks.every(
		(block) =>
			block.kind === 'break' ||
			block.runs.every((run) => text.slice(run.start, run.end) === run.text)
	);

describe('paragraphs and scene breaks', () => {
	it('splits on blank lines and keeps single line breaks in a paragraph', () => {
		const text = '  She waits.\nStill.\n\n\nYou come in.  ';
		const blocks = formatPassage(text);
		expect(paragraphs(blocks)).toEqual(['She waits.\nStill.', 'You come in.']);
		expect(verbatim(text, blocks)).toBe(true);
	});

	it('draws a line of asterisks, dashes or underscores as a scene break', () => {
		for (const line of ['***', '* * *', '---', '- - - -', '___', '⁂']) {
			const blocks = formatPassage(`Night falls.\n\n${line}\n\nMorning.`);
			expect(paragraphs(blocks)).toEqual(['Night falls.', '<break>', 'Morning.']);
		}
	});

	it('takes a break on its own line even without blank lines around it', () => {
		expect(paragraphs(formatPassage('Night falls.\n* * *\nMorning.'))).toEqual([
			'Night falls.',
			'<break>',
			'Morning.'
		]);
	});

	it('collapses repeated breaks, and marks the paragraph after one', () => {
		const blocks = formatPassage('A.\n\n***\n\n---\n\nB.');
		expect(paragraphs(blocks)).toEqual(['A.', '<break>', 'B.']);
		expect(blocks[0]).toMatchObject({ afterBreak: false });
		expect(blocks[2]).toMatchObject({ afterBreak: true });
	});

	it('is nothing for an empty passage', () => {
		expect(formatPassage('')).toEqual([]);
		expect(formatPassage('\n\n  \n')).toEqual([]);
	});
});

describe('emphasis', () => {
	it('reads italic, bold and both, hiding the markers', () => {
		const text = 'A *soft* word, a **hard** one, and ***both***, _too_.';
		expect(shape(runs(text))).toEqual([
			'A ',
			'soft i',
			' word, a ',
			'hard b',
			' one, and ',
			'both b i',
			', ',
			'too i',
			'.'
		]);
		expect(verbatim(text, formatPassage(text))).toBe(true);
	});

	it('shows a marker that does not pair up as written', () => {
		expect(paragraphs(formatPassage('Five * three, and *an open one'))).toEqual([
			'Five * three, and *an open one'
		]);
		expect(paragraphs(formatPassage('**half*'))).toEqual(['**half*']);
	});

	it('leaves an underscore inside a word alone', () => {
		expect(shape(runs('snake_case_name and _this_'))).toEqual(['snake_case_name and ', 'this i']);
	});

	it('does not carry emphasis across a paragraph', () => {
		expect(paragraphs(formatPassage('*one\n\ntwo*'))).toEqual(['*one', 'two*']);
	});

	it('nests emphasis inside dialogue', () => {
		expect(shape(runs('"Do *not* move."'))).toEqual(['"Do  d', 'not i d', ' move." d']);
	});
});

describe('dialogue', () => {
	it('sets apart straight and curly quotes, marks included', () => {
		expect(shape(runs('"Sit," she says. “Now.”'))).toEqual(['"Sit," d', ' she says. ', '“Now.” d']);
	});

	it('carries unclosed speech to the end of its paragraph only', () => {
		expect(shape(runs('"I waited all night,\n\nShe stops.'))).toEqual([
			'"I waited all night, d',
			'She stops.'
		]);
	});

	it('leaves apostrophes alone', () => {
		expect(shape(runs("She's sure it's fine."))).toEqual(["She's sure it's fine."]);
	});
});

describe('say tags', () => {
	it('hides the tags and says whose line it is', () => {
		const text = '<say who="Mara">"Sit down,"</say> she says.';
		expect(shape(runs(text))).toEqual(['"Sit down," d @Mara', ' she says.']);
		expect(verbatim(text, formatPassage(text))).toBe(true);
	});

	it('reads who in single quotes, or bare', () => {
		expect(runs("<say who='Mara'>Hi</say>")[0]?.speaker).toBe('Mara');
		expect(runs('<say who=Mara>Hi</say>')[0]?.speaker).toBe('Mara');
		expect(runs('<say>Hi</say>')[0]).toMatchObject({ speaker: null, dialogue: true });
	});

	it('tells one line from the next by its speaker', () => {
		const text = '<say who="Mara">"*Sit*."</say><say who="Jo">"No."</say>';
		expect(shape(runs(text))).toEqual(['" d @Mara', 'Sit i d @Mara', '." d @Mara', '"No." d @Jo']);
	});

	it('ends an unclosed tag with its paragraph, and hides a stray closing one', () => {
		expect(shape(runs('<say who="Mara">"Sit.\n\nShe waits.</say>'))).toEqual([
			'"Sit. d @Mara',
			'She waits.'
		]);
	});

	it('does not read quotation marks inside a tag as speech of their own', () => {
		expect(shape(runs('<say who="Mara">"Sit."</say> and "go"'))).toEqual([
			'"Sit." d @Mara',
			' and ',
			'"go" d'
		]);
	});
});

describe('sound tags', () => {
	it('hides the tags and marks what is between them a sound', () => {
		expect(shape(runs('A <sound>crack</sound>, then quiet.'))).toEqual([
			'A ',
			'crack s',
			', then quiet.'
		]);
	});

	it('keeps the speaker of a sound inside their line', () => {
		expect(shape(runs('<say who="Mara">"<sound>Ah</sound> — more."</say>'))).toEqual([
			'" d @Mara',
			'Ah d @Mara s',
			' — more." d @Mara'
		]);
	});

	it('ends an unclosed sound with its paragraph, and hides a stray closing tag', () => {
		expect(paragraphs(formatPassage('<sound>Mmmph\n\nNext</sound>'))).toEqual(['Mmmph', 'Next']);
		expect(shape(runs('<sound>Mmmph\n\nNext</sound>'))).toEqual(['Mmmph s', 'Next']);
	});

	it('is left out of the plain words', () => {
		expect(plainPassage('A <sound>crack</sound>.')).toBe('A crack.');
	});
});

describe('while it streams', () => {
	const streaming = { streaming: true };

	it('hides a say or sound tag still arriving', () => {
		for (const tail of [
			'<',
			'<s',
			'<sa',
			'<say',
			'<say who="Ma',
			'</sa',
			'<so',
			'<sound',
			'</soun'
		]) {
			expect(paragraphs(formatPassage(`She says ${tail}`, streaming))).toEqual(['She says ']);
		}
	});

	it('formats after an opener whose closer has not come yet, and hides a marker at the end', () => {
		expect(shape(runs('A **hard wo', streaming))).toEqual(['A ', 'hard wo b']);
		expect(shape(runs('A **hard*', streaming))).toEqual(['A ', 'hard b']);
		expect(paragraphs(formatPassage('A word *', streaming))).toEqual(['A word ']);
	});

	it('only does so in the last paragraph', () => {
		expect(paragraphs(formatPassage('A *open\n\nNext', streaming))).toEqual(['A *open', 'Next']);
	});

	it('hides a last line that may be becoming a scene break', () => {
		expect(paragraphs(formatPassage('Night.\n\n* *', streaming))).toEqual(['Night.']);
		expect(paragraphs(formatPassage('Night.\n\n* *'))).toEqual(['Night.', '* *']);
	});

	it('shows the same as a finished passage once it has all arrived', () => {
		const text = 'A **hard** <say who="Mara">"word"</say>.\n\n***\n\n*Later.*';
		expect(formatPassage(`${text} more`, streaming).length).toBe(3);
		expect(shape(runs(text, streaming))).toEqual(shape(runs(text)));
	});
});

describe('withQuotes', () => {
	it('marks a quote across formatting, keeping every run verbatim', () => {
		const text = 'She **holds** still.';
		const blocks = withQuotes(formatPassage(text), [[6, 15]]);
		expect(
			shape(blocks.flatMap((block) => (block.kind === 'paragraph' ? block.runs : [])))
		).toEqual(['She ', 'holds b m', ' s m', 'till.']);
		expect(verbatim(text, blocks)).toBe(true);
	});
});

describe('plainPassage', () => {
	it('is the words without markup, paragraphs apart, breaks left out', () => {
		expect(plainPassage('A **hard** <say who="Mara">"word"</say>.\n\n***\n\n*Later.*')).toBe(
			'A hard "word".\n\nLater.'
		);
	});

	it('drops a marker cut off from its partner, as at the ends of a quote', () => {
		expect(plainPassage('hard** and *soft')).toBe('hard and soft');
	});
});

describe('voiceOf', () => {
	const cast = { you: ['you', 'Sam'], characters: ['Mara Quinn', 'Jo', 'Ines', 'Kit', 'Fifth'] };

	it('gives the user their own voice, by "you" or their name', () => {
		expect(voiceOf('You', cast)).toBe('you');
		expect(voiceOf('sam', cast)).toBe('you');
	});

	it('gives each cast member theirs, matching a first name', () => {
		expect(voiceOf('Mara', cast)).toBe(1);
		expect(voiceOf('mara quinn', cast)).toBe(1);
		expect(voiceOf('Jo', cast)).toBe(2);
		expect(voiceOf('Kit', cast)).toBe(4);
	});

	it('gives no one else a voice of their own', () => {
		expect(voiceOf('Fifth', cast)).toBeNull();
		expect(voiceOf('A guard', cast)).toBeNull();
		expect(voiceOf(null, cast)).toBeNull();
	});
});
