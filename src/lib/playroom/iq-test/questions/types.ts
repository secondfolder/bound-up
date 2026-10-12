import type { Rng } from '../random';
import type { Vibe } from '../settings';

/**
 * The shape every generated question takes.
 *
 * Plain data, so a run can sit in `sessionStorage` and come back after a
 * reload, and so the components render a question without knowing which
 * generator made it.
 */

export type QuestionKind =
	| 'number-series'
	| 'letter-series'
	| 'analogy'
	| 'odd-one-out'
	| 'vocabulary'
	| 'syllogism'
	| 'matrix'
	| 'stroop'
	| 'stroop-count'
	| 'working-memory'
	| 'digit-span'
	| 'word-problem'
	| 'synonyms'
	| 'mental-rotation'
	| 'visual-memory'
	| 'anagrams'
	| 'central-point'
	| 'exposure-memory';

/** 1 is a warm-up, 5 is the hardest a generator makes. */
export type Difficulty = 1 | 2 | 3 | 4 | 5;

export const COLOURS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink'] as const;
export type Colour = (typeof COLOURS)[number];

export const SHAPES = ['circle', 'square', 'triangle', 'diamond'] as const;
export const FILLS = ['solid', 'outline', 'striped'] as const;

/** One cell of a matrix puzzle: some number of identical shapes. */
export type ShapeCell = {
	shape: (typeof SHAPES)[number];
	count: 1 | 2 | 3;
	fill: (typeof FILLS)[number];
};

export type Choice = {
	id: string;
	label: string;
	/** Draw the label in this colour, which is the whole trick of a Stroop answer. */
	ink?: Colour;
	/**
	 * Draw a block of this colour rather than any text. `label` is then its
	 * accessible name. For "what does it say": the taker has to turn the word
	 * they read into a colour, with the ink pulling the other way.
	 */
	swatch?: Colour;
	/** Draw a shape cell rather than text. `label` is then its accessible name. */
	cell?: ShapeCell;
	/** Draw this shape rather than any text. `label` is then its accessible name. */
	polyomino?: Polyomino;
	/** Draw this emoji large rather than the label, which names it. */
	icon?: string;
};

/** A flat shape made of unit squares, as `[column, row]` pairs. */
export type Polyomino = readonly (readonly [number, number])[];

/** A board of cells, counted along each row from the top left. */
export type Grid = { columns: number; rows: number };

/** What is shown above the answers, beyond the prompt's own sentence. */
export type Display =
	| { type: 'none' }
	| { type: 'sequence'; items: string[] }
	| { type: 'statements'; lines: string[] }
	| { type: 'stroop'; words: { word: Colour; ink: Colour }[] }
	| { type: 'matrix'; cells: (ShapeCell | null)[] }
	| { type: 'polyomino'; cells: Polyomino };

/**
 * Something to hold in mind before the question proper is shown.
 *
 * The items are on screen for `seconds`, then hidden for good. This is where
 * the distracting levels do their work: a flash during the hold costs
 * a sub the answer in a way a flash beside a multiple-choice list cannot.
 */
export type Memorise = {
	prompt: string;
	/** Words, digits or icons to remember. */
	items: string[];
	seconds: number;
	/**
	 * Show the items one at a time, each for this long, rather than all at
	 * once; `seconds` is then the whole sequence.
	 */
	intervalMs?: number;
	/** A board with these cells shaded to remember, instead of items. */
	grid?: Grid & { shaded: number[] };
};

/**
 * The question is on screen for `seconds` only, beside the answers, and then
 * hidden; the answer can be given at any time, before or after. What is
 * hidden is the display (a series, the statements, a shape, a board's
 * points) and, with `prompt`, the prompt too, for a question that is all
 * prompt (a word problem). See `timers.ts`.
 */
export type Timed = { seconds: number; prompt?: boolean };

/**
 * A task done between memorising and recalling, purely to get in the way.
 * Its answer is checked and shown, but only the recall is scored.
 */
export type Interference = { prompt: string; answer: string };

type QuestionBase = {
	id: string;
	kind: QuestionKind;
	difficulty: Difficulty;
	prompt: string;
	display: Display;
	memorise?: Memorise;
	interference?: Interference;
	timed?: Timed;
	/**
	 * Answering ends after this many seconds. Counted down above the answers.
	 * A tick-all's ticks by then are its answer; anything else not answered
	 * in time is failed (`TIMED_OUT`). See `timers.ts`.
	 */
	limit?: { seconds: number };
};

export type ChoiceQuestion = QuestionBase & {
	format: 'choice';
	choices: Choice[];
	/** The id of the correct choice. */
	answer: string;
};

/**
 * How a typed answer is compared:
 * - `number`: parsed as a number, so `12`, ` 12 ` and `12.0` all match.
 * - `digits`: every non-digit dropped, so `5 3 1` and `5-3-1` match `531`.
 * - `words`: every expected word present, in any order, case-insensitive.
 * - `text`: trimmed and case-insensitive.
 */
export type AnswerMatch = 'number' | 'digits' | 'words' | 'text';

export type TextQuestion = QuestionBase & {
	format: 'text';
	answer: string;
	match: AnswerMatch;
	/** Which keyboard a phone should offer. */
	inputMode: 'numeric' | 'text';
};

/**
 * Tick every answer that applies. Partly right is partly credited: one point
 * per right pick, one off per wrong one, over the number right (see `credit`).
 */
export type MultiQuestion = QuestionBase & {
	format: 'multi';
	choices: Choice[];
	/** The ids of every right choice. */
	answers: string[];
	/** Choices laid out as the cells of a board (`label` naming each), not as cards. */
	grid?: Grid;
};

/**
 * Pick one cell of a board. Credited by how near the best cell it is, for a
 * question with a best rather than a right answer (see `credit`).
 */
export type PointQuestion = QuestionBase & {
	format: 'point';
	grid: Grid;
	/** The shaded cells the point is to be central to. */
	points: number[];
	/** A best cell, as an index: for the "Correct answer" aid and the tests. */
	answer: string;
};

export type Question = ChoiceQuestion | TextQuestion | MultiQuestion | PointQuestion;

/**
 * What a generator gets besides randomness.
 *
 * `vibe` is null whenever the questions are not themed — at levels 0 and 1, whatever
 * the taker picked, or with the questions' theme turned off — so a generator only has to ask
 * one thing.
 */
export type GeneratorContext = { vibe: Vibe | null };

export type Generator = (
	rng: Rng,
	difficulty: Difficulty,
	context: GeneratorContext,
	id: string
) => Question;
