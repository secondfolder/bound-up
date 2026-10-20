/**
 * How a passage is drawn: paragraphs, scene breaks, a little Markdown,
 * dialogue, and who is speaking (docs/daydreams.md, "Reading a passage").
 *
 * The passage is stored exactly as the model wrote it, markup and all, and
 * never rewritten: quotes are offsets into that text (`quotes.ts`), and a
 * bookmark saved before any of this existed has to keep pointing at the same
 * words. So nothing here produces new text. Every run it returns is a
 * verbatim, contiguous slice of the stored passage with its offsets, and the
 * markup is simply the characters no run covers. The page draws each run as
 * its own element carrying its `start`, which is how a selection is turned
 * back into offsets (`passage-selection.ts`).
 *
 * Deliberately a small subset, because a story is prose: `*italic*` or
 * `_italic_`, `**bold**`, `***both***`, and a line of `* * *` (or `---`,
 * `___`, `⁂`) for a scene break. No headings, lists, links or tables. A
 * marker that does not pair up is shown as written rather than guessed at.
 *
 * Speech is set apart two ways. Anything in quotation marks is dialogue; and
 * the prompt asks the model to wrap a spoken line in
 * `<say who="Mara">"…"</say>`, which says whose it is, so each voice can have
 * a colour of its own.
 *
 * Sounds are set apart too: a moan, a gasp, a slap, in `<sound>…</sound>`,
 * drawn so they read as sounds rather than words. Inside a say tag a sound
 * keeps its speaker's colour; only its type changes.
 *
 * Pure and alias-free.
 */

export type Run = {
	/** Offsets into the stored passage: `text` is exactly `passage.slice(start, end)`. */
	start: number;
	end: number;
	text: string;
	bold: boolean;
	italic: boolean;
	/** Spoken aloud: inside quotation marks, or a say tag. */
	dialogue: boolean;
	/** Who says it, as the say tag named them; null for narration and unattributed speech. */
	speaker: string | null;
	/** A sound someone makes, in a sound tag. */
	sound: boolean;
	/** Inside a highlighted quote (`withQuotes`). */
	marked: boolean;
};

export type Block =
	| {
			kind: 'paragraph';
			runs: Run[];
			/** Straight after a scene break: its first line is set in small caps. */
			afterBreak: boolean;
	  }
	| { kind: 'break' };

export type FormatOptions = {
	/**
	 * The passage is still arriving. Markup only half there is hidden rather
	 * than shown and then snatched away: a tag being written (`<say wh`), a
	 * line that may become a scene break, a marker at the very end, and an
	 * opening marker whose closing one has not come yet, which formats what
	 * follows it as though it had.
	 */
	streaming?: boolean;
};

const SCENE_BREAK = /^(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,}|⁂)$/;
/** The start of a scene break, which may be one once the rest of the line arrives. */
const MAYBE_SCENE_BREAK = /^[*_\-⁂][*_\-⁂ \t]*$/;
const SAY_TAG = /<(?<close>\/)?say\b[^<>]*>/gi;
const WHO = /\bwho\s*=\s*(?:"(?<double>[^"]*)"|'(?<single>[^']*)'|(?<bare>[^\s"'>]+))/i;
const SOUND_TAG = /<(?<close>\/)?sound\b[^<>]*>/gi;
/**
 * A say or sound tag cut off by the end of what has arrived: `<`, `<sa`,
 * `</say`, `<say who="Ma`, `<sou`.
 */
const PARTIAL_TAG = /<(?:\/?(?:s(?:a(?:y(?:\b[^<>]*)?)?|o(?:u(?:n(?:d(?:\b[^<>]*)?)?)?)?)?)?)$/i;
const SPACE = /\s/;
const SPACES = /\s+/;
const WORD = /[\p{L}\p{N}]/u;

/** Per-character state while a passage is worked through. */
type Marks = {
	hidden: Uint8Array;
	bold: Uint8Array;
	italic: Uint8Array;
	dialogue: Uint8Array;
	sound: Uint8Array;
	/** Which say tag a character is inside, numbered from 1; 0 for none. */
	say: Uint32Array;
	speakers: (string | null)[];
};

type Span = { start: number; end: number };

/** The passage as blocks of runs, for drawing. */
export function formatPassage(text: string, options: FormatOptions = {}): Block[] {
	return format(text, { streaming: options.streaming === true, strays: 'show' });
}

/**
 * The passage's words without its markup, for showing it — or a quote from
 * it — somewhere that is not drawn as a passage: a bookmark, a written-out
 * turn. Paragraphs are separated by a blank line and scene breaks are left
 * out. A marker cut off from its partner, as one at either end of a quote can
 * be, is left out too.
 */
export function plainPassage(text: string): string {
	return format(text, { streaming: false, strays: 'hide' })
		.flatMap((block) =>
			block.kind === 'paragraph' ? [block.runs.map((run) => run.text).join('')] : []
		)
		.join('\n\n');
}

function format(
	text: string,
	{ streaming, strays }: { streaming: boolean; strays: 'show' | 'hide' }
): Block[] {
	const marks: Marks = {
		hidden: new Uint8Array(text.length),
		bold: new Uint8Array(text.length),
		italic: new Uint8Array(text.length),
		dialogue: new Uint8Array(text.length),
		sound: new Uint8Array(text.length),
		say: new Uint32Array(text.length),
		speakers: [null]
	};
	const layout = paragraphs(text, streaming);
	const last = layout.findLast((piece) => piece.kind === 'paragraph');
	for (const piece of layout) {
		if (piece.kind === 'paragraph') {
			const tail = streaming && piece === last;
			const end = tagsEnd(text, piece, marks, tail);
			sayTags(text, piece, marks, end);
			soundTags(text, piece, marks, end);
			quotationMarks(text, piece, marks);
			emphasis(text, piece, marks, { tail, strays });
		}
	}
	const blocks: Block[] = [];
	let afterBreak = false;
	for (const piece of layout) {
		if (piece.kind === 'break') {
			afterBreak = true;
			blocks.push({ kind: 'break' });
			continue;
		}
		const runs = runsOf(text, piece, marks);
		if (runs.length > 0) {
			blocks.push({ kind: 'paragraph', runs, afterBreak });
			afterBreak = false;
		}
	}
	return blocks;
}

/**
 * The passage's paragraphs, by blank lines, and its scene breaks, each a line
 * of its own. A single line break inside a paragraph stays in it, and is
 * drawn as one. Runs of breaks collapse to one.
 */
function paragraphs(
	text: string,
	streaming: boolean
): ({ kind: 'paragraph'; start: number; end: number } | { kind: 'break' })[] {
	const pieces: ({ kind: 'paragraph'; start: number; end: number } | { kind: 'break' })[] = [];
	let open: { kind: 'paragraph'; start: number; end: number } | null = null;
	let at = 0;
	const lines = text.split('\n');
	for (const [index, line] of lines.entries()) {
		const start = at;
		const end = at + line.length;
		at = end + 1;
		const trimmed = line.trim();
		const lastLine = index === lines.length - 1;
		if (trimmed === '' || (streaming && lastLine && MAYBE_SCENE_BREAK.test(trimmed))) {
			open = null;
			continue;
		}
		if (SCENE_BREAK.test(trimmed)) {
			open = null;
			if (pieces.at(-1)?.kind !== 'break') {
				pieces.push({ kind: 'break' });
			}
			continue;
		}
		if (open) {
			open.end = end;
		} else {
			open = { kind: 'paragraph', start, end };
			pieces.push(open);
		}
	}
	for (const piece of pieces) {
		if (piece.kind === 'paragraph') {
			while (piece.start < piece.end && SPACE.test(text[piece.start] ?? '')) {
				piece.start += 1;
			}
			while (piece.end > piece.start && SPACE.test(text[piece.end - 1] ?? '')) {
				piece.end -= 1;
			}
		}
	}
	return pieces;
}

function hide(marks: Marks, start: number, end: number) {
	marks.hidden.fill(1, start, end);
}

/**
 * Where a paragraph's tags may be read up to: its end, or, in the last
 * paragraph of a passage still arriving, the start of a tag cut off part way,
 * which is hidden until the rest of it comes.
 */
function tagsEnd(text: string, paragraph: Span, marks: Marks, tail: boolean): number {
	if (tail) {
		const partial: RegExpExecArray | null = PARTIAL_TAG.exec(
			text.slice(paragraph.start, paragraph.end)
		);
		if (partial) {
			const end = paragraph.start + partial.index;
			hide(marks, end, paragraph.end);
			return end;
		}
	}
	return paragraph.end;
}

/**
 * `<say who="…">` and `</say>`: the tags hidden, what is between them
 * dialogue, spoken by whoever they name. A tag never closed lasts to the end
 * of its paragraph, so a forgotten `</say>` colours one paragraph rather than
 * the rest of the passage; a closing tag with nothing open is just hidden.
 */
function sayTags(text: string, paragraph: Span, marks: Marks, end: number) {
	const body = text.slice(paragraph.start, end);
	let open: { from: number; id: number } | null = null;
	const finish = (to: number) => {
		if (open) {
			marks.say.fill(open.id, open.from, to);
			marks.dialogue.fill(1, open.from, to);
			open = null;
		}
	};
	for (const match of body.matchAll(SAY_TAG)) {
		const start = paragraph.start + match.index;
		const after = start + match[0].length;
		hide(marks, start, after);
		finish(start);
		if (!match.groups?.close) {
			const who: RegExpExecArray | null = WHO.exec(match[0]);
			const name = (who?.groups?.double ?? who?.groups?.single ?? who?.groups?.bare ?? '').trim();
			marks.speakers.push(name || null);
			open = { from: after, id: marks.speakers.length - 1 };
		}
	}
	finish(end);
}

/**
 * `<sound>` and `</sound>`: the tags hidden, what is between them a sound.
 * Unclosed, like a say tag, it lasts to the end of its paragraph. Sounds do
 * not nest, so a second opening tag is just hidden.
 */
function soundTags(text: string, paragraph: Span, marks: Marks, end: number) {
	let from = -1;
	for (const match of text.slice(paragraph.start, end).matchAll(SOUND_TAG)) {
		const start = paragraph.start + match.index;
		hide(marks, start, start + match[0].length);
		if (match.groups?.close) {
			if (from !== -1) {
				marks.sound.fill(1, from, start);
				from = -1;
			}
		} else if (from === -1) {
			from = start + match[0].length;
		}
	}
	if (from !== -1) {
		marks.sound.fill(1, from, end);
	}
}

/**
 * Quotation marks, straight or curly, outside say tags: the marks and what is
 * between them are dialogue. Speech carried on into the next paragraph
 * leaves its opening mark unclosed, as fiction does, so an unclosed mark is
 * dialogue to the end of its paragraph.
 */
function quotationMarks(text: string, paragraph: Span, marks: Marks) {
	let open = -1;
	for (let index = paragraph.start; index < paragraph.end; index += 1) {
		if (marks.hidden[index] || marks.say[index]) {
			continue;
		}
		const char = text[index];
		if (open === -1 && (char === '"' || char === '“')) {
			open = index;
		} else if (open !== -1 && (char === '"' || char === '”')) {
			marks.dialogue.fill(1, open, index + 1);
			open = -1;
		}
	}
	if (open !== -1) {
		marks.dialogue.fill(1, open, paragraph.end);
	}
}

type Delimiter = { char: string; start: number; length: number };

/** The nearest shown character before or after `index`, inside the paragraph. */
function neighbour(
	text: string,
	marks: Marks,
	paragraph: Span,
	index: number,
	step: -1 | 1
): string | null {
	for (let at = index; at >= paragraph.start && at < paragraph.end; at += step) {
		if (!marks.hidden[at]) {
			return text[at] ?? null;
		}
	}
	return null;
}

/**
 * Emphasis, CommonMark's rules cut down to what prose needs. A run of one to
 * three `*` or `_` opens when a word follows it and closes when one comes
 * before it; `_` also has to sit outside a word, so snake_case stays as it
 * is. A closer pairs with the nearest opener of the same character and
 * length; openers it skips over stay literal. Anything left unpaired is shown
 * as written — unless the passage is still arriving and this is its last
 * paragraph, when an opener formats everything after it (its closer may be
 * on the way) and a marker at the very end is hidden (it may be the first
 * half of one).
 */
function emphasis(
	text: string,
	paragraph: Span,
	marks: Marks,
	{ tail, strays }: { tail: boolean; strays: 'show' | 'hide' }
) {
	const openers: Delimiter[] = [];
	const apply = (from: number, to: number, length: number) => {
		if (length !== 1) {
			marks.bold.fill(1, from, to);
		}
		if (length !== 2) {
			marks.italic.fill(1, from, to);
		}
	};
	let index = paragraph.start;
	while (index < paragraph.end) {
		const char = text[index] ?? '';
		if (marks.hidden[index] || (char !== '*' && char !== '_')) {
			index += 1;
			continue;
		}
		let end = index;
		while (end < paragraph.end && text[end] === char && !marks.hidden[end]) {
			end += 1;
		}
		const run: Delimiter = { char, start: index, length: end - index };
		index = end;
		const before = neighbour(text, marks, paragraph, run.start - 1, -1);
		const after = neighbour(text, marks, paragraph, end, 1);
		if (tail && after === null) {
			hide(marks, run.start, end);
			continue;
		}
		if (run.length > 3) {
			continue;
		}
		const touchesBefore = before !== null && !SPACE.test(before);
		const touchesAfter = after !== null && !SPACE.test(after);
		const canClose = touchesBefore && !(char === '_' && WORD.test(after ?? ''));
		const canOpen = touchesAfter && !(char === '_' && WORD.test(before ?? ''));
		const partner = canClose
			? openers.findLastIndex((opener) => opener.char === run.char && opener.length === run.length)
			: -1;
		if (partner !== -1) {
			const opener = openers[partner] as Delimiter;
			hide(marks, opener.start, opener.start + opener.length);
			hide(marks, run.start, end);
			apply(opener.start + opener.length, run.start, run.length);
			openers.length = partner;
		} else if (canOpen) {
			openers.push(run);
		} else if (strays === 'hide') {
			hide(marks, run.start, end);
		}
	}
	for (const opener of openers) {
		if (tail) {
			hide(marks, opener.start, opener.start + opener.length);
			apply(opener.start + opener.length, paragraph.end, opener.length);
		} else if (strays === 'hide') {
			hide(marks, opener.start, opener.start + opener.length);
		}
	}
}

/** A paragraph's shown characters, grouped into runs that look alike and sit side by side in the text. */
function runsOf(text: string, paragraph: Span, marks: Marks): Run[] {
	const runs: Run[] = [];
	for (let index = paragraph.start; index < paragraph.end; index += 1) {
		if (marks.hidden[index]) {
			continue;
		}
		const bold = marks.bold[index] === 1;
		const italic = marks.italic[index] === 1;
		const dialogue = marks.dialogue[index] === 1;
		const sound = marks.sound[index] === 1;
		const speaker = marks.speakers[marks.say[index] ?? 0] ?? null;
		const last = runs.at(-1);
		if (
			last &&
			last.end === index &&
			last.bold === bold &&
			last.italic === italic &&
			last.dialogue === dialogue &&
			last.sound === sound &&
			last.speaker === speaker
		) {
			last.end = index + 1;
			continue;
		}
		const run: Run = {
			start: index,
			end: index + 1,
			text: '',
			bold,
			italic,
			dialogue,
			speaker,
			sound,
			marked: false
		};
		runs.push(run);
	}
	for (const run of runs) {
		run.text = text.slice(run.start, run.end);
	}
	return runs;
}

/**
 * The runs cut again where highlighted quotes begin and end, so a quote can
 * be marked across formatting. `ranges` are merged and sorted
 * (`quoteRanges`).
 */
export function withQuotes(
	blocks: Block[],
	ranges: readonly (readonly [number, number])[]
): Block[] {
	if (ranges.length === 0) {
		return blocks;
	}
	return blocks.map((block) => {
		if (block.kind !== 'paragraph') {
			return block;
		}
		const runs = block.runs.flatMap((run) => {
			const cuts = new Set([run.start, run.end]);
			for (const [start, end] of ranges) {
				for (const cut of [start, end]) {
					if (cut > run.start && cut < run.end) {
						cuts.add(cut);
					}
				}
			}
			const points = [...cuts].sort((a, b) => a - b);
			return points.slice(0, -1).map((start, index): Run => {
				const end = points[index + 1] as number;
				return {
					...run,
					start,
					end,
					text: run.text.slice(start - run.start, end - run.start),
					marked: ranges.some(([from, to]) => start >= from && end <= to)
				};
			});
		});
		return { ...block, runs };
	});
}

/** A voice's colour: the user's own, a cast member's by their place in the setup, or none. */
export type Voice = 'you' | 1 | 2 | 3 | 4 | null;

/**
 * Whose colour a speaker gets. The model is asked to name people as the
 * story knows them, which may be a first name only ("Mara" for "Mara
 * Quinn"), so a name matches a cast member's whole name or its first word.
 * A name that matches no one gets the plain dialogue colour: a passing
 * figure is not worth a colour of its own, and a guess would collide.
 */
export function voiceOf(
	speaker: string | null,
	cast: { you: readonly string[]; characters: readonly string[] }
): Voice {
	if (!speaker) {
		return null;
	}
	const said = speaker.trim().toLocaleLowerCase();
	const matches = (name: string) => {
		const whole = name.trim().toLocaleLowerCase();
		return whole !== '' && (whole === said || whole.split(SPACES)[0] === said);
	};
	if (cast.you.some(matches)) {
		return 'you';
	}
	const index = cast.characters.findIndex(matches);
	return index >= 0 && index < 4 ? ((index + 1) as 1 | 2 | 3 | 4) : null;
}
