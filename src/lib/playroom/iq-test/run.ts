import {
	credit,
	type Difficulty,
	GENERATORS,
	QUESTION_KINDS,
	type Question,
	type QuestionKind,
	TIMED_OUT,
	withClock
} from './questions';
import { createRng, mixSeed, type Rng } from './random';
import { effectiveVibe, type Role, type Settings, themesQuestions } from './settings';

/**
 * One sitting of the test: its questions, dealt from a seed, and what the
 * taker has done with each.
 *
 * Plain data and pure functions, so the page can keep a run in
 * `sessionStorage` and pick it back up after a reload, and so the tests can
 * build one without a DOM.
 *
 * Questions are dealt one at a time, as each slot is first reached, because
 * what comes next depends on how the taker has done so far (see `nextKind`).
 * So a run is reproducible from its seed *and its answers*, not its seed
 * alone: every slot draws from a random source of its own, `mixSeed(seed,
 * slot, …)`, so replaying the same answers deals the same questions.
 */

/**
 * Questions dealt per run. Nobody has to answer them all. One round of every
 * kind (18) and as many again weighted by how the taker is doing.
 */
export const RUN_LENGTH = 36;

/** Questions to attempt before a score is offered. */
export const MIN_FOR_SCORE = 12;

export type QuestionStatus = 'unseen' | 'answered' | 'skipped';

export type Run = {
	seed: number;
	settings: Settings;
	/** The questions dealt so far. Grows as the run goes on, up to `RUN_LENGTH`. */
	questions: Question[];
	responses: (string | null)[];
	statuses: QuestionStatus[];
	/**
	 * How many times each slot has been dealt again: a skipped question with
	 * something to memorise is re-dealt when it is returned to (see `goTo`).
	 */
	variants: number[];
	/** The question on screen; `RUN_LENGTH` once every question has been seen. */
	index: number;
	/** The "enough for a score" banner was dismissed, leaving a small finish button. */
	enoughDismissed?: boolean;
	/** What is left on the question on screen's clock (see `ClockLeft`). */
	clock?: ClockLeft;
};

/** Which part of a question is on screen: memorising, the sum after it, or answering. */
export type QuestionPhase = 'memorise' | 'interference' | 'answer';

const PHASES: readonly QuestionPhase[] = ['memorise', 'interference', 'answer'];

/**
 * Where a question's clocks stand, kept with the run each second so a reload
 * carries on from there: otherwise a reload was a free reset, a second look
 * at words or a display that had already gone and a fresh deadline. Tagged
 * with the question's id, and dropped by every move (`goTo`), so going back
 * to a question or on to another starts it afresh, as it always has.
 */
export type ClockLeft = {
	/** The question these are for. */
	id: string;
	/** The part of it on screen, so a reload after memorising does not memorise again. */
	phase?: QuestionPhase;
	/** Seconds left to memorise in. */
	memorise?: number;
	/** How far a one-at-a-time sequence to memorise has got: the item on screen. */
	at?: number;
	/** Seconds left on a shown-for-a-while display. */
	timed?: number;
	/** Seconds left to answer in. */
	limit?: number;
};

/** The run with the question on screen's clocks as they now stand. */
export function withClockLeft(run: Run, clock: ClockLeft): Run {
	return { ...run, clock };
}

/**
 * Where to resume the question on screen from, or null to start it afresh.
 * Anything that is not a phase, or a whole, non-negative number, is dropped:
 * the run comes back from storage, which an older build may have written.
 */
export function clockLeftFor(run: Run, id: string): Omit<ClockLeft, 'id'> | null {
	const { clock } = run;
	if (!clock || clock.id !== id) {
		return null;
	}
	const whole = (value: unknown) =>
		typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
	const phase = PHASES.find((candidate) => candidate === clock.phase);
	const memorise = whole(clock.memorise);
	const at = whole(clock.at);
	const timed = whole(clock.timed);
	const limit = whole(clock.limit);
	return {
		...(phase === undefined ? {} : { phase }),
		...(memorise === undefined ? {} : { memorise }),
		...(at === undefined ? {} : { at }),
		...(timed === undefined ? {} : { timed }),
		...(limit === undefined ? {} : { limit })
	};
}

/**
 * How hard question `index` is for this role.
 *
 * It climbs from 1 to 5 over the run, and the role shifts the whole curve: a
 * sub starts a step up and reaches the hardest questions sooner, a dom starts
 * a step down. This is half the rigging; the other half is the norm the
 * score is marked against (see `scoring.ts`).
 */
export function difficultyFor(index: number, role: Role): Difficulty {
	const base = 1 + Math.floor((index * 5) / RUN_LENGTH);
	const shifted = base + (role === 'sub' ? 1 : -1);
	return Math.min(5, Math.max(1, shifted)) as Difficulty;
}

/** The bounds on a kind's weight, so no kind is ever ruled out, only made rarer. */
export const KIND_WEIGHT_MIN = 0.25;
export const KIND_WEIGHT_MAX = 4;

/** A salt for the kind draw, so it never shares a stream with the question's own. */
const KIND_SALT = 0x6b_69_6e_64;

/**
 * How likely a kind is to be dealt next, from the taker's record on it so far.
 *
 * Rigging down (a sub), the kinds they get wrong come up more and the ones
 * they get right less; rigging up (a dom), the other way about. A skip counts
 * as wrong, as it does in the score. Clamped, so a run never turns into a
 * drill of one kind.
 */
export function kindWeight(role: Role, right: number, wrong: number): number {
	const ratio = (1 + 2 * wrong) / (1 + 2 * right);
	const weight = role === 'sub' ? ratio : 1 / ratio;
	return Math.min(KIND_WEIGHT_MAX, Math.max(KIND_WEIGHT_MIN, weight));
}

/**
 * The first round: every kind once, in a random order, before any is asked
 * twice. Drawn from the seed alone, so it never depends on answers.
 */
function firstRound(seed: number): QuestionKind[] {
	return createRng(seed).shuffle(QUESTION_KINDS);
}

/**
 * The kind slot `index` deals. The first round is fixed by the seed; after
 * it, a weighted draw (see `kindWeight`) from the record so far, never the
 * kind that was just asked.
 */
export function nextKind(run: Run, index: number): QuestionKind {
	const round = firstRound(run.seed);
	if (index < round.length) {
		return round[index] as QuestionKind;
	}
	const record = new Map<QuestionKind, { right: number; wrong: number }>();
	run.questions.forEach((question, i) => {
		const status = run.statuses[i];
		if (i >= index || status === 'unseen') {
			return;
		}
		const entry = record.get(question.kind) ?? { right: 0, wrong: 0 };
		// Passed at half credit or more: a tick-all question mostly right is
		// one the taker can do.
		if (status === 'answered' && credit(question, run.responses[i] ?? null) >= 0.5) {
			entry.right += 1;
		} else {
			entry.wrong += 1;
		}
		record.set(question.kind, entry);
	});
	const previous = run.questions[index - 1]?.kind;
	const candidates = QUESTION_KINDS.filter((kind) => kind !== previous).map((kind) => {
		const { right, wrong } = record.get(kind) ?? { right: 0, wrong: 0 };
		return { kind, weight: kindWeight(run.settings.role, right, wrong) };
	});
	return weightedPick(createRng(mixSeed(run.seed, index, KIND_SALT)), candidates);
}

function weightedPick(rng: Rng, candidates: { kind: QuestionKind; weight: number }[]) {
	const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
	let roll = rng.next() * total;
	for (const candidate of candidates) {
		roll -= candidate.weight;
		if (roll < 0) {
			return candidate.kind;
		}
	}
	return (candidates.at(-1) as { kind: QuestionKind }).kind;
}

/** The vibe a run's questions are worded in, or null for a real test's wording. */
function questionVibe(settings: Settings) {
	return themesQuestions(settings) ? effectiveVibe(settings) : null;
}

/**
 * The run under changed settings, from the dock's settings panel. Questions
 * not yet dealt are dealt under them as they come. If the change alters how
 * questions are worded — the vibe, or "Question content matches theme" —
 * every question dealt but not answered is dealt again in the new wording:
 * the one on screen included, which otherwise kept the old words until it
 * was answered. Same kind and difficulty, new items. Answered ones stay as
 * they were.
 */
export function withSettings(run: Run, settings: Settings): Run {
	const next = { ...run, settings };
	if (questionVibe(run.settings) === questionVibe(settings)) {
		return next;
	}
	const questions = [...run.questions];
	const variants = [...run.variants];
	run.questions.forEach((question, index) => {
		if (run.statuses[index] !== 'answered') {
			const variant = (run.variants[index] ?? 0) + 1;
			questions[index] = deal(next, index, question.kind, variant);
			variants[index] = variant;
		}
	});
	return { ...next, questions, variants };
}

function deal(run: Run, index: number, kind: QuestionKind, variant: number): Question {
	const vibe = questionVibe(run.settings);
	// A re-dealt slot gets an id of its own, so anything keyed on the question
	// starts afresh rather than keeping the old one's state.
	const id = variant === 0 ? `q${index + 1}` : `q${index + 1}-${variant}`;
	const question = GENERATORS[kind](
		createRng(mixSeed(run.seed, index, variant)),
		difficultyFor(index, run.settings.role),
		{ vibe },
		id
	);
	// Every question against a clock for a sub, none for a dom: a third part
	// of the rigging (see `timers.ts`).
	return run.settings.role === 'sub' ? withClock(question) : question;
}

export function createRun(settings: Settings, seed: number): Run {
	const empty: Run = {
		seed,
		settings,
		questions: [],
		responses: [],
		statuses: [],
		variants: [],
		index: 0
	};
	return goTo(empty, 0);
}

/**
 * Put question `index` on screen. Every move goes through here.
 *
 * - The first slot not yet dealt is dealt now.
 * - A skipped question with something to memorise, or a display shown only
 *   for a time, is dealt again: its digits or words were on screen once
 *   already, so going back to it would otherwise be a second look. Same kind
 *   and difficulty, new items, still decided by the seed.
 * - The clock left on the question being left is dropped (see `ClockLeft`).
 */
export function goTo(current: Run, index: number): Run {
	// Whatever is left on the clock was for the question being left.
	const { clock: _left, ...run } = current;
	const target = Math.max(0, Math.min(RUN_LENGTH, index));
	if (target === run.questions.length && target < RUN_LENGTH) {
		return {
			...run,
			questions: [...run.questions, deal(run, target, nextKind(run, target), 0)],
			responses: [...run.responses, null],
			statuses: [...run.statuses, 'unseen'],
			variants: [...run.variants, 0],
			index: target
		};
	}
	const existing = run.questions[target];
	if ((existing?.memorise || existing?.timed) && run.statuses[target] === 'skipped') {
		const variant = (run.variants[target] ?? 0) + 1;
		const questions = [...run.questions];
		const variants = [...run.variants];
		questions[target] = deal(run, target, existing.kind, variant);
		variants[target] = variant;
		return { ...run, questions, variants, index: target };
	}
	return { ...run, index: target };
}

/** Record an answer and move on. An empty answer counts as a skip. */
export function answer(run: Run, response: string): Run {
	const trimmed = response.trim();
	return advance(run, trimmed === '' ? 'skipped' : 'answered', trimmed === '' ? null : trimmed);
}

/** Leave the current question unanswered and move on. It scores as wrong. */
export function skip(run: Run): Run {
	// One already failed by running out of time stays failed: skipping it
	// would make it a question to come back to, for a second go.
	if (run.responses[run.index] === TIMED_OUT) {
		return advance(run, 'answered', TIMED_OUT);
	}
	return advance(run, 'skipped', null);
}

/** Back one question, keeping whatever was answered there. */
export function back(run: Run): Run {
	return goTo(run, run.index - 1);
}

/**
 * Move on to the next question still unanswered after this one: a skipped
 * one, or the first not yet seen. So answering a question returned to with
 * "Return to skipped" goes on to the next skipped one, and plain answering
 * goes on to the next question, by the same rule.
 */
function advance(run: Run, status: QuestionStatus, response: string | null): Run {
	const statuses = [...run.statuses];
	const responses = [...run.responses];
	statuses[run.index] = status;
	responses[run.index] = response;
	const updated = { ...run, statuses, responses };
	for (let i = run.index + 1; i < run.questions.length; i += 1) {
		if (statuses[i] !== 'answered') {
			return goTo(updated, i);
		}
	}
	return goTo(updated, run.questions.length);
}

export function skippedCount(run: Run): number {
	return run.statuses.filter((status) => status === 'skipped').length;
}

/** The first skipped question other than the one on screen, if any. */
export function firstSkipped(run: Run): number | null {
	const index = run.statuses.findIndex((status, i) => status === 'skipped' && i !== run.index);
	return index === -1 ? null : index;
}

/** Back to the first skipped question; from there, answering moves to the next. */
export function returnToSkipped(run: Run): Run {
	const index = firstSkipped(run);
	return index === null ? run : goTo(run, index);
}

/** Put the "enough for a score" banner away for the rest of the run. */
export function dismissEnough(run: Run): Run {
	return { ...run, enoughDismissed: true };
}

export function attemptedCount(run: Run): number {
	return run.statuses.filter((status) => status !== 'unseen').length;
}

/** Whether enough has been attempted to give a score. */
export function canFinish(run: Run): boolean {
	return attemptedCount(run) >= MIN_FOR_SCORE;
}

/** Whether every question has been seen, so there is nothing left but to finish. */
export function isExhausted(run: Run): boolean {
	return run.index >= RUN_LENGTH;
}
