import type { Score } from './scoring';
import { effectiveIqs, effectiveVibe, humiliates, type Settings, type Vibe } from './settings';

/**
 * What the results screen says about a score.
 *
 * Pure, so every combination of score, role and settings can be tested
 * without rendering. Explicit adult content by design; treat the strings as
 * data.
 */

/**
 * How much the results screen says. Lower scores get fewer, shorter, bigger
 * words — the presentation is part of the joke, and it applies in a clinical
 * run too, where it reads as an assessor simplifying for the reader.
 */
export type Simplicity = 'full' | 'simple' | 'very-simple';

export function simplicityFor(iq: number): Simplicity {
	if (iq < 70) {
		return 'very-simple';
	}
	if (iq < 85) {
		return 'simple';
	}
	return 'full';
}

/**
 * Below a real scale's floor, where only a sub can go: categories in the
 * same official voice, each lower one more degrading. Highest first; the
 * last catches everything down to the floor of 4.
 */
const BELOW_THE_SCALE: readonly (readonly [minIq: number, name: string])[] = [
	[35, 'Severely impaired'],
	[30, 'Profoundly impaired'],
	[25, 'Cognitively negligible'],
	[20, 'Functionally mindless'],
	[15, 'Decorative only'],
	[10, 'Vegetative'],
	[5, 'Sub-vegetative'],
	[Number.NEGATIVE_INFINITY, 'Inanimate object']
];

/** Where a real scale stops, and the made-up categories start. */
export const SCALE_FLOOR = 40;

/**
 * The Wechsler-style classification a real report would print. Below the
 * scale's floor, a humiliating run names how far below in the categories
 * above; a straight-faced one only says it is off the scale.
 */
export function classify(iq: number, humiliating = false): string {
	if (iq < SCALE_FLOOR) {
		return humiliating
			? (BELOW_THE_SCALE.find(([min]) => iq >= min)?.[1] ?? 'Inanimate object')
			: 'Below measurable range';
	}
	if (iq >= 130) {
		return 'Very superior';
	}
	if (iq >= 120) {
		return 'Superior';
	}
	if (iq >= 110) {
		return 'High average';
	}
	if (iq >= 90) {
		return 'Average';
	}
	if (iq >= 80) {
		return 'Low average';
	}
	if (iq >= 70) {
		return 'Borderline';
	}
	return 'Extremely low';
}

/** "As smart as…", highest threshold first. The last entry catches everything. */
type Comparisons = readonly (readonly [minIq: number, who: string])[];

const ABOVE_AVERAGE: Comparisons = [
	[145, 'a Nobel laureate'],
	[130, 'a university professor'],
	[115, 'a university graduate'],
	[100, 'the average adult']
];

const NEUTRAL_BELOW: Comparisons = [
	[90, 'a high-school student'],
	[80, 'a twelve-year-old'],
	[70, 'an eight-year-old'],
	[60, 'a five-year-old'],
	[50, 'a golden retriever'],
	[Number.NEGATIVE_INFINITY, 'a houseplant']
];

const VIBE_BELOW: Record<Vibe, Comparisons> = {
	gooner: [
		[90, 'someone three hours into a session'],
		[80, 'a gooner with forty tabs open'],
		[70, 'a man mid-edge, mouth open'],
		[60, 'a drooling gooner staring at a loop'],
		[50, 'a browser history'],
		[Number.NEGATIVE_INFINITY, 'a sticky keyboard']
	],
	bambi: [
		[90, 'a good girl halfway into trance'],
		[80, 'a sorority pledge after her third shot'],
		[70, 'a bimbo mid-giggle'],
		[60, 'Bambi with her trigger said twice'],
		[50, 'a blow-up doll'],
		[Number.NEGATIVE_INFINITY, 'a pink balloon']
	],
	misogyny: [
		[90, 'a housewife'],
		[80, 'a trophy wife'],
		[70, 'a girl who needs the menu read to her'],
		[60, 'a kitchen appliance'],
		[50, 'a pretty ornament'],
		[Number.NEGATIVE_INFINITY, 'a decorative cushion']
	],
	denial: [
		[90, 'a man three weeks locked'],
		[80, 'a boy who has been edged all day'],
		[70, 'someone mid-edge'],
		[60, 'a dripping, begging mess'],
		[50, 'a throbbing cock'],
		[Number.NEGATIVE_INFINITY, 'a leaking chastity cage']
	],
	feminisation: [
		[90, 'a sissy in training'],
		[80, 'a sissy maid'],
		[70, 'a giggling sissy in pink panties'],
		[60, 'a sissy who forgot she was ever a boy'],
		[50, 'a pair of frilly panties'],
		[Number.NEGATIVE_INFINITY, 'a tube of lipstick']
	],
	degradation: [
		[90, 'a well-trained pet'],
		[80, 'a dog'],
		[70, 'a fucktoy'],
		[60, 'a used condom'],
		[50, 'a cum rag'],
		[Number.NEGATIVE_INFINITY, 'a hole']
	]
};

/** Who a score is as smart as. Themed only where the run admits to being a kink test. */
export function comparisonFor(iq: number, vibe: Vibe | null): string {
	const table = [...ABOVE_AVERAGE, ...(vibe ? VIBE_BELOW[vibe] : NEUTRAL_BELOW)];
	return table.find(([min]) => iq >= min)?.[1] ?? 'a houseplant';
}

export type Delta = { difference: number; line: string };

export type Analysis = {
	headline: string;
	summary: string;
	classification: string;
	comparison: string;
	simplicity: Simplicity;
	/** The bell-curve explainer, or null when the score is not low enough to need one. */
	curveExplainer: string | null;
	/** A dig at the questions skipped, for a sub in an explicit run that skipped any. */
	skipLine: string | null;
	sober: Delta | null;
	target: Delta | null;
};

/** Below this, the bell curve gets explained. */
export const EXPLAIN_CURVE_BELOW = 85;

/** Within this many points of the target counts as hitting it. */
export const TARGET_TOLERANCE = 5;

export function analyse(score: Score, settings: Settings): Analysis {
	// Humiliating from level 1, in the vibe's words from level 2: at level 1
	// there is no vibe, and the plain lines below stand in for one.
	const explicit = humiliates(settings);
	const vibe = explicit ? effectiveVibe(settings) : null;
	const simplicity = simplicityFor(score.iq);
	const comparison = comparisonFor(score.iq, vibe);
	const { soberIq, targetIq } = effectiveIqs(settings);
	return {
		headline: explicit ? explicitHeadline(score.iq, settings, vibe) : `Full Scale IQ: ${score.iq}`,
		summary: summaryFor(score, settings, simplicity, comparison, explicit),
		classification: classify(score.iq, explicit),
		comparison,
		simplicity,
		curveExplainer:
			score.iq < EXPLAIN_CURVE_BELOW ? curveExplainer(score, simplicity, explicit) : null,
		skipLine:
			explicit && settings.role === 'sub' && score.skipped > 0
				? skipLineFor(vibe, score.skipped)
				: null,
		sober: soberIq === null ? null : soberDelta(score.iq, soberIq, settings, explicit),
		target: targetIq === null ? null : targetDelta(score.iq, targetIq, settings, explicit)
	};
}

const SUB_LOW_HEADLINES: Record<Vibe, string> = {
	gooner: 'Nothing left up there but the loop.',
	bambi: 'Such a good, empty girl!',
	misogyny: 'Exactly what we expected from a girl.',
	denial: 'Too horny to think. Shocking.',
	feminisation: "There's hardly any boy brain left, is there?",
	degradation: 'Brainless. Obviously.'
};

const SUB_HIGH_HEADLINES: Record<Vibe, string> = {
	gooner: 'Still thinking? You clearly have not been gooning hard enough.',
	bambi: 'Hmm. Still far too much going on up there. Drop deeper.',
	misogyny: 'Getting ideas above your station, are we?',
	denial: 'Too clear-headed. You need to be kept locked longer.',
	feminisation: 'Still thinking like a boy. More panties needed.',
	degradation: 'Trying to be a person again? Cute.'
};

/**
 * A dig at the questions a sub gave up on, per vibe, given how many. Only
 * ever shown to a sub in an explicit run: a dom is not mocked, and a clinical
 * report notes skips in its facts instead.
 */
const SKIP_LINES: Record<Vibe, (count: number, questions: string) => string> = {
	gooner: (count, questions) =>
		`You skipped ${count} ${questions}. Too busy stroking to think them through?`,
	bambi: (count, questions) =>
		`You skipped ${count} ${questions}. Too hard for that pretty little head? Good girl.`,
	misogyny: (count, questions) =>
		`You gave up on ${count} ${questions}. Leave the hard ones to the men, sweetheart.`,
	denial: (count, questions) =>
		`${count} ${questions} skipped. Too needy to concentrate, weren't you?`,
	feminisation: (count, questions) =>
		`${count} ${questions} skipped. A pretty sissy doesn't need to finish things.`,
	degradation: (count, questions) => `You couldn't even attempt ${count} ${questions}. Pathetic.`
};

/**
 * The plain versions, for a humiliating analysis with no vibe (level 1): the
 * same digs, in nobody's kink in particular.
 */
const PLAIN_SUB_LOW_HEADLINE = 'About as dim as we expected.';
const PLAIN_SUB_HIGH_HEADLINE = 'Hmm. Still far too much going on up there.';
const plainSkipLine = (count: number, questions: string) =>
	`You skipped ${count} ${questions}. Too hard for you? Of course they were.`;

function skipLineFor(vibe: Vibe | null, count: number): string {
	const questions = count === 1 ? 'question' : 'questions';
	return vibe === null ? plainSkipLine(count, questions) : SKIP_LINES[vibe](count, questions);
}

function explicitHeadline(iq: number, settings: Settings, vibe: Vibe | null): string {
	if (settings.role === 'dom') {
		return iq >= 115 ? 'Clearly the brains of this relationship.' : 'Still smarter than your pet.';
	}
	if (vibe === null) {
		return iq < 100 ? PLAIN_SUB_LOW_HEADLINE : PLAIN_SUB_HIGH_HEADLINE;
	}
	return iq < 100 ? SUB_LOW_HEADLINES[vibe] : SUB_HIGH_HEADLINES[vibe];
}

function summaryFor(
	score: Score,
	settings: Settings,
	simplicity: Simplicity,
	comparison: string,
	explicit: boolean
): string {
	if (simplicity === 'very-simple') {
		return explicit && settings.role === 'sub'
			? `Your number is ${score.iq}. That is a small number. Most people have a bigger number. That's okay! Thinking is hard.`
			: `Your score is ${score.iq}. This is well below average.`;
	}
	if (simplicity === 'simple') {
		return explicit
			? `You scored ${score.iq}. That's about as smart as ${comparison}.`
			: `Your score is ${score.iq}, which is below average. You did better than ${score.percentile}% of people.`;
	}
	const ranking = `higher than ${score.percentile}% of the reference population`;
	return explicit
		? `You scored ${score.iq}, ${ranking}. That puts you on a par with ${comparison}.`
		: `Your performance falls ${score.iq < SCALE_FLOOR ? 'below the measurable range' : `in the ${classify(score.iq).toLowerCase()} range`}, ${ranking}. You answered ${score.correct} of ${score.attempted} items correctly.`;
}

function curveExplainer(score: Score, simplicity: Simplicity, explicit: boolean): string {
	if (simplicity === 'very-simple') {
		return explicit
			? 'Big hump = most people. Little dot = you. Your dot is way over on the left. Left is the dumb side.'
			: 'Most people score near the middle of the curve. Your result is marked near the lower end.';
	}
	if (simplicity === 'simple') {
		return 'The hump is where most people are. The dot is you. Your dot is on the low side.';
	}
	return `IQ scores follow a bell curve: most people score near 100, in the tall middle, and fewer score the further from it you go. About two-thirds of people land between 85 and 115. Your ${score.iq} sits on the left-hand slope, below ${Math.round(100 - score.percentile)}% of people.`;
}

function soberDelta(iq: number, soberIq: number, settings: Settings, explicit: boolean): Delta {
	const difference = iq - soberIq;
	if (!explicit) {
		return {
			difference,
			line:
				difference === 0
					? `Consistent with your reported baseline of ${soberIq}.`
					: `${Math.abs(difference)} points ${difference < 0 ? 'below' : 'above'} your reported baseline of ${soberIq}.`
		};
	}
	if (settings.role === 'dom') {
		return {
			difference,
			line:
				difference >= 0
					? `${difference} points up on your usual ${soberIq}. Power suits you.`
					: `${-difference} points down on your usual ${soberIq}. Distracted by your pet?`
		};
	}
	return {
		difference,
		line:
			difference < 0
				? `Your sober IQ is ${soberIq}. That's ${-difference} points gone. Where did they go?`
				: `${difference} points above your sober ${soberIq}. Suspicious. You'll have to try harder to be dumb.`
	};
}

function targetDelta(iq: number, targetIq: number, settings: Settings, explicit: boolean): Delta {
	const difference = iq - targetIq;
	const hit = Math.abs(difference) <= TARGET_TOLERANCE;
	if (!explicit) {
		return {
			difference,
			line: hit
				? `Within ${TARGET_TOLERANCE} points of your target of ${targetIq}.`
				: `${Math.abs(difference)} points ${difference < 0 ? 'below' : 'above'} your target of ${targetIq}.`
		};
	}
	if (hit) {
		return { difference, line: `Right on your target of ${targetIq}. Well done!` };
	}
	if (settings.role === 'dom') {
		return {
			difference,
			line:
				difference > 0
					? `You beat your target of ${targetIq} by ${difference}.`
					: `${-difference} short of your target of ${targetIq}. Don't let your sub see this.`
		};
	}
	return {
		difference,
		line:
			difference < 0
				? `${-difference} points under your target of ${targetIq}. Even dumber than you hoped!`
				: `${difference} points over your target of ${targetIq}. Too clever by half. Again?`
	};
}
