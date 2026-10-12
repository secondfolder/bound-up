import { credit } from './questions';
import type { Run } from './run';
import type { Role } from './settings';

/**
 * Turning answers into an IQ, which is where the second half of the rigging
 * lives (the first is the difficulty curve in `run.ts`).
 *
 * The score is a z-score of the taker's accuracy against an "expected"
 * accuracy, scaled to mean 100 and SD 15 like a real IQ. What is rigged is
 * the expectation: a sub is measured against a norm that assumes they should
 * have got most of their (already harder) questions right, a dom against one
 * that is impressed by half of their (already easier) ones.
 *
 * Nothing here looks at the target IQ. It is only ever compared against in
 * the results, so hitting it means something.
 */

/** IQ scale: the usual mean and standard deviation. */
export const IQ_MEAN = 100;
export const IQ_SD = 15;

/**
 * The lowest score the test will give each role. A sub can sink to 4, far
 * below any real scale (which stops around 40), into the categories made up
 * for down there (see `classify`); a dom never goes below 40.
 */
export const IQ_FLOORS: Record<Role, number> = { sub: 4, dom: 40 };
/** The lowest score anyone can get, for validating a stored one. */
export const IQ_FLOOR = Math.min(...Object.values(IQ_FLOORS));
export const IQ_CEILING = 160;

/**
 * Expected accuracy and its spread, per role. `sdBelow` is the spread under
 * the mean, where it differs: a sub's is narrower, so getting nothing right
 * reaches their floor of 4 ((0 − 0.74) / 0.1156 ≈ −6.4 SD) while the top of
 * their range is as it was.
 */
export const NORMS: Record<Role, { mean: number; sd: number; sdBelow?: number }> = {
	sub: { mean: 0.74, sd: 0.15, sdBelow: 0.1156 },
	dom: { mean: 0.42, sd: 0.16 }
};

export type Score = {
	iq: number;
	/** Share of people scoring below this, 0–100. */
	percentile: number;
	/**
	 * Credit earned, rounded to a whole number: a tick-all question partly
	 * right counts in part (see `credit`). The IQ uses the unrounded sum.
	 */
	correct: number;
	/** Answered or skipped. Unseen questions do not count either way. */
	attempted: number;
	/** Of those attempted, how many were skipped. Each is scored as wrong. */
	skipped: number;
};

export function scoreRun(run: Run): Score {
	let earned = 0;
	let attempted = 0;
	let skipped = 0;
	run.questions.forEach((question, index) => {
		const status = run.statuses[index];
		if (status === 'unseen') {
			return;
		}
		attempted += 1;
		if (status === 'skipped') {
			skipped += 1;
		}
		if (status === 'answered') {
			earned += credit(question, run.responses[index] ?? null);
		}
	});
	const iq = iqFromAccuracy(attempted === 0 ? 0 : earned / attempted, run.settings.role);
	return { iq, percentile: percentileOf(iq), correct: Math.round(earned), attempted, skipped };
}

export function iqFromAccuracy(accuracy: number, role: Role): number {
	const norm = NORMS[role];
	const spread = accuracy < norm.mean ? (norm.sdBelow ?? norm.sd) : norm.sd;
	const z = (accuracy - norm.mean) / spread;
	return Math.round(Math.min(IQ_CEILING, Math.max(IQ_FLOORS[role], IQ_MEAN + IQ_SD * z)));
}

/** Percentile of an IQ on the normal curve, rounded to one decimal place. */
export function percentileOf(iq: number): number {
	const z = (iq - IQ_MEAN) / IQ_SD;
	return Math.round(normalCdf(z) * 1000) / 10;
}

/** The standard normal density, for drawing the curve. */
export function normalPdf(z: number): number {
	return Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI);
}

/**
 * The standard normal CDF, by the Abramowitz–Stegun approximation (7.1.26).
 * Accurate to about 1e-7, far finer than a percentile shown to one decimal.
 */
export function normalCdf(z: number): number {
	const x = Math.abs(z) / Math.SQRT2;
	const t = 1 / (1 + 0.327_591_1 * x);
	const poly =
		t *
		(0.254_829_592 +
			t * (-0.284_496_736 + t * (1.421_413_741 + t * (-1.453_152_027 + t * 1.061_405_429))));
	const erf = 1 - poly * Math.exp(-x * x);
	return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}
