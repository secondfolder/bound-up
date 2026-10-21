import { describe, expect, it } from 'vitest';
import {
	type Block,
	formatPassage,
	plainPassage,
	type Run,
	voiceOf,
	withQuotes
} from './passage-format';

const textOf = (list: readonly Run[]) => list.map((run) => run.text).join('');

/** Each block as text: a list as `<ul: a | b>`, or `<ol: 1 a | 2 b>` with its numbers. */
const paragraphs = (blocks: Block[]) =>
	blocks.map((block) => {
		switch (block.kind) {
			case 'break':
				return '<break>';
			case 'list':
				return `<${block.ordered ? 'ol' : 'ul'}: ${block.items
					.map((item) => (item.number === null ? '' : `${item.number} `) + textOf(item.runs))
					.join(' | ')}>`;
			default:
				return textOf(block.runs);
		}
	});

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
			run.thought ? 't' : '',
			run.marked ? 'm' : ''
		]
			.filter(Boolean)
			.join(' ')
	);

/** Whether every run, everywhere, is exactly the stored text at its offsets. */
const verbatim = (text: string, blocks: Block[]) =>
	blocks
		.flatMap((block) => {
			switch (block.kind) {
				case 'break':
					return [];
				case 'list':
					return block.items.flatMap((item) => item.runs);
				default:
					return block.runs;
			}
		})
		.every((run) => text.slice(run.start, run.end) === run.text);

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

	it('marks a paragraph that is bold throughout as a standout line, and no other', () => {
		const blocks = formatPassage(
			'**Being owned is a relief.**\n\nI mean it. **Someone** decides.\n\n**Twice.** **Always.**\n\nPlain.'
		);
		expect(blocks.map((block) => block.kind === 'paragraph' && block.standout)).toEqual([
			true,
			false,
			true,
			false
		]);
		expect(paragraphs(blocks)[0]).toBe('Being owned is a relief.');
		// A bold marker that never closes is shown as written, so is not a standout.
		expect(formatPassage('**Never closed.')[0]).toMatchObject({ standout: false });
	});

	it('is nothing for an empty passage', () => {
		expect(formatPassage('')).toEqual([]);
		expect(formatPassage('\n\n  \n')).toEqual([]);
	});
});

describe('lists', () => {
	it('draws bulleted lines as a list, after a line introducing it, with no blank line needed', () => {
		const text =
			'Say it with me:\n- I am an object.\n* I exist to be used.\n+ I am grateful.\nGood.';
		const blocks = formatPassage(text);
		expect(paragraphs(blocks)).toEqual([
			'Say it with me:',
			'<ul: I am an object. | I exist to be used. | I am grateful.>',
			'Good.'
		]);
		expect(verbatim(text, blocks)).toBe(true);
	});

	it('keeps an ordered list’s numbers as written, with either punctuation', () => {
		const blocks = formatPassage('1. Stand on the line.\n2) Speak only to answer.\n7. Wait.');
		expect(paragraphs(blocks)).toEqual([
			'<ol: 1 Stand on the line. | 2 Speak only to answer. | 7 Wait.>'
		]);
	});

	it('carries an item on through indented lines, hiding the indentation', () => {
		const text = '- Kneel.\n  Hands open.\n- Wait.';
		const blocks = formatPassage(text);
		expect(paragraphs(blocks)).toEqual(['<ul: Kneel.\nHands open. | Wait.>']);
		expect(verbatim(text, blocks)).toBe(true);
	});

	it('keeps one list across blank lines, and starts another when the kind changes', () => {
		expect(paragraphs(formatPassage('- One.\n\n- Two.\n\n1. Three.'))).toEqual([
			'<ul: One. | Two.>',
			'<ol: 1 Three.>'
		]);
	});

	it('formats inside an item, and leaves emphasis, scene breaks and bare markers alone', () => {
		const list = formatPassage('- **I am an object.**').at(0);
		expect(list?.kind === 'list' && shape(list.items[0]?.runs ?? [])).toEqual([
			'I am an object. b'
		]);
		expect(paragraphs(formatPassage('**Bold.** Then more.\n\n*Leaning.*'))).toEqual([
			'Bold. Then more.',
			'Leaning.'
		]);
		expect(paragraphs(formatPassage('One.\n\n* * *\n\n- - -\n\nTwo.'))).toEqual([
			'One.',
			'<break>',
			'Two.'
		]);
		expect(paragraphs(formatPassage('-not a list\n1.5 times'))).toEqual(['-not a list\n1.5 times']);
	});

	it('hides a number that may be starting an item while it streams, and shows it when done', () => {
		expect(paragraphs(formatPassage('Begin.\n12', { streaming: true }))).toEqual(['Begin.']);
		expect(paragraphs(formatPassage('Begin.\n12.', { streaming: true }))).toEqual(['Begin.']);
		expect(paragraphs(formatPassage('Begin.\n12. Kn', { streaming: true }))).toEqual([
			'Begin.',
			'<ol: 12 Kn>'
		]);
		expect(paragraphs(formatPassage('Begin.\n12'))).toEqual(['Begin.\n12']);
	});

	it('marks quotes inside items, and writes items out one to a line', () => {
		const text = '- I am an object.\n- I exist.';
		const [list] = withQuotes(formatPassage(text), [[4, 10]]);
		expect(list?.kind === 'list' && shape(list.items[0]?.runs ?? [])).toEqual([
			'I ',
			'am an  m',
			'object.'
		]);
		expect(plainPassage(text)).toBe('I am an object.\nI exist.');
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

describe('thought tags', () => {
	it('hides the tags, says whose thought it is, and never reads it as speech', () => {
		const text =
			'<say who="Mara">"Fine,"</say> she says. <thought who="Mara">It is not fine.</thought>';
		expect(shape(runs(text))).toEqual([
			'"Fine," d @Mara',
			' she says. ',
			'It is not fine. @Mara t'
		]);
		expect(verbatim(text, formatPassage(text))).toBe(true);
		// Quotation marks a model put in one anyway are not dialogue.
		expect(shape(runs('<thought who="Jo">"Run."</thought>'))).toEqual(['"Run." @Jo t']);
	});

	it('keeps emphasis inside a thought, ends an unclosed one with its paragraph, and has no thinker for none named', () => {
		expect(shape(runs('<thought who="Mara">*Now*, then.\n\nShe moves.'))).toEqual([
			'Now i @Mara t',
			', then. @Mara t',
			'She moves.'
		]);
		expect(runs('<thought>Hm.</thought>')[0]).toMatchObject({ speaker: null, thought: true });
	});

	it('is left as words in the plain passage', () => {
		expect(plainPassage('She nods. <thought who="Mara">Liar.</thought>')).toBe('She nods. Liar.');
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
			'</soun',
			'<t',
			'<thou',
			'<thought who="Ma',
			'</thought'
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
