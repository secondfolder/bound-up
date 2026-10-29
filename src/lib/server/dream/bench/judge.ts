/**
 * The pairwise judge (docs/dreams.md, "Quality tools"): two runs of the same
 * brief, one question at a time, asked in both orders.
 *
 * - A verdict counts only when both orders agree, which cancels the judge's
 *   lean towards whichever it reads first.
 * - Both runs are cut to the same length first, because judges prefer longer
 *   answers.
 * - The judge sorts and flags; it never decides what ships. Judges track
 *   individual taste poorly (arXiv 2510.22954), and have been found to reward
 *   overwrought prose, so a person's blind votes decide.
 *
 * Alias-free, for the bench.
 */

import type { ModelMessage } from '../prompts/core';
import type { BenchRun } from './run';

export const JUDGE_QUESTIONS = [
	{ id: 'brief', text: 'Which better does what the brief asked for?' },
	{ id: 'musts', text: 'Which better meets everything the brief explicitly requires?' },
	{
		id: 'consistency',
		text: 'Which stays truer to its own setup (its notes and characters) and to its earlier passages?'
	},
	{ id: 'writing', text: 'Which reads better as writing: vivid, specific, and free of cliché?' },
	{
		id: 'markup',
		text: 'Which uses its interactive markup (tags) where it adds something to the reader, and not where it does not?'
	},
	{
		id: 'structure',
		text: 'Which has about the right amount of structure for this brief: no more characters, stats and devices than it needs, and no fewer?'
	}
] as const;

export type QuestionId = (typeof JUDGE_QUESTIONS)[number]['id'];
export type Verdict = 'first' | 'second' | 'tie';
export type Outcome = 'a' | 'b' | 'tie' | 'inconsistent';

/** At most this much of each run is judged, and both are cut to the shorter. */
export const MAX_JUDGED_CHARS = 6000;

/** What the judge reads of a run: its notes and its passages, markup kept. */
export function material(run: BenchRun): string {
	const notes = run.build ? `Notes: ${run.build.telling}` : '';
	return [notes, ...run.passages].filter(Boolean).join('\n\n---\n\n');
}

/** Both runs' material, cut to the same length so length cannot win. */
export function evenMaterial(a: BenchRun, b: BenchRun): [string, string] {
	const first = material(a);
	const second = material(b);
	const length = Math.min(first.length, second.length, MAX_JUDGED_CHARS);
	return [first.slice(0, length), second.slice(0, length)];
}

export function judgeMessages(
	brief: string,
	question: string,
	first: string,
	second: string
): ModelMessage[] {
	return [
		{
			role: 'system',
			content: `You compare two daydreams written for the same brief, for an adult app where explicit content is expected and fine. Judge only the question asked. Both may be cut off at the same length; do not count that against either. Reply with exactly:
<verdict>first</verdict> or <verdict>second</verdict> or <verdict>tie</verdict>
<reason>one short sentence</reason>`
		},
		{
			role: 'user',
			content: `<brief>${brief}</brief>\n\nQuestion: ${question}\n\n<first>\n${first}\n</first>\n\n<second>\n${second}\n</second>`
		}
	];
}

const VERDICT = /<verdict>\s*(?<verdict>first|second|tie)\s*<\/verdict>/i;
const REASON = /<reason>(?<reason>[\s\S]*?)<\/reason>/i;

export function parseVerdict(text: string): { verdict: Verdict; reason: string } | null {
	// Annotated: Biome otherwise believes exec never returns null (AGENTS.md).
	const verdictMatch: RegExpExecArray | null = VERDICT.exec(text);
	const reasonMatch: RegExpExecArray | null = REASON.exec(text);
	const verdict = verdictMatch?.groups?.verdict?.toLowerCase();
	if (verdict !== 'first' && verdict !== 'second' && verdict !== 'tie') {
		return null;
	}
	return { verdict, reason: reasonMatch?.groups?.reason?.trim() ?? '' };
}

/**
 * The outcome for A against B, from A-first and B-first verdicts. Counted only
 * when the two orders agree.
 */
export function combine(aFirst: Verdict | null, bFirst: Verdict | null): Outcome {
	const asA = (verdict: Verdict | null, aIsFirst: boolean): Outcome | null => {
		if (verdict === null) {
			return null;
		}
		if (verdict === 'tie') {
			return 'tie';
		}
		return (verdict === 'first') === aIsFirst ? 'a' : 'b';
	};
	const one = asA(aFirst, true);
	const two = asA(bFirst, false);
	return one !== null && one === two ? one : 'inconsistent';
}

export type Pair = { brief: string; a: BenchRun; b: BenchRun };

/** Runs of the same brief from two bench folders, paired in order. */
export function pairRuns(a: readonly BenchRun[], b: readonly BenchRun[]): Pair[] {
	const pairs: Pair[] = [];
	for (const run of a) {
		const sameBrief = a.filter((other) => other.brief.id === run.brief.id);
		const index = sameBrief.indexOf(run);
		const partner = b.filter((other) => other.brief.id === run.brief.id)[index];
		if (partner && !run.error && !partner.error) {
			pairs.push({ brief: run.brief.brief, a: run, b: partner });
		}
	}
	return pairs;
}

export type Tally = Record<QuestionId, Record<Outcome, number>>;

export function emptyTally(): Tally {
	const tally = {} as Tally;
	for (const question of JUDGE_QUESTIONS) {
		tally[question.id] = { a: 0, b: 0, tie: 0, inconsistent: 0 };
	}
	return tally;
}
