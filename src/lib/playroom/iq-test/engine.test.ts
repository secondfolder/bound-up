import { describe, expect, it } from 'vitest';
import { isCorrect } from '$lib/testing/iq-test';
import { analyse, classify, comparisonFor, simplicityFor } from './analysis';
import { brandFor, flashTauntsFor, introFor, tauntsFor } from './copy';
import { localId } from './device';
import {
	EMPTY_FEED,
	feedUrl,
	isVibe,
	mergeFeeds,
	parseFeed,
	parseRedgifs,
	SOURCES,
	shuffleFeed
} from './media';
import {
	GENERATORS,
	type MultiQuestion,
	pickResponse,
	QUESTION_KINDS,
	type Question,
	rightAnswer,
	TIMED_OUT,
	wrongAnswer
} from './questions';
import { createRng } from './random';
import {
	answer,
	attemptedCount,
	back,
	canFinish,
	createRun,
	difficultyFor,
	dismissEnough,
	firstSkipped,
	isExhausted,
	KIND_WEIGHT_MAX,
	KIND_WEIGHT_MIN,
	kindWeight,
	MIN_FOR_SCORE,
	RUN_LENGTH,
	type Run,
	returnToSkipped,
	skip,
	skippedCount,
	withSettings
} from './run';
import { IQ_FLOORS, iqFromAccuracy, NORMS, percentileOf, type Score, scoreRun } from './scoring';
import {
	DEFAULT_SETTINGS,
	effectiveVibe,
	INTENSITIES,
	type Settings,
	settingsSchema,
	VIBES
} from './settings';
import { schemeClass, themeFor, themeStyle } from './themes';

const sub: Settings = { ...DEFAULT_SETTINGS, role: 'sub' };
const dom: Settings = { ...DEFAULT_SETTINGS, role: 'dom' };
const bambiSub: Settings = { ...sub, intensity: 2, vibe: 'bambi' };

/** Answer the first `count` questions, right or wrong as asked. */
function answerRun(run: Run, count: number, correctly: boolean): Run {
	let next = run;
	for (let i = 0; i < count; i += 1) {
		const question = next.questions[next.index];
		if (!question) {
			break;
		}
		next = answer(next, correctly ? rightAnswer(question) : 'definitely wrong');
	}
	return next;
}

describe('localId', () => {
	it('makes distinct ids without crypto.randomUUID, which plain HTTP does not have', () => {
		const original = crypto.randomUUID;
		// biome-ignore lint/suspicious/noExplicitAny: removing a method the type says is always there is the point.
		(crypto as any).randomUUID = undefined;
		try {
			const ids = new Set(Array.from({ length: 50 }, () => localId()));
			expect(ids.size).toBe(50);
			expect([...ids][0]).toMatch(/^[0-9a-f]{32}$/);
		} finally {
			crypto.randomUUID = original;
		}
	});
});

describe('createRng', () => {
	it('is deterministic for a seed and differs between seeds', () => {
		const a = createRng(1);
		const b = createRng(1);
		const c = createRng(2);
		const sequence = (rng: ReturnType<typeof createRng>) =>
			Array.from({ length: 5 }, () => rng.next());
		const first = sequence(a);
		expect(sequence(b)).toEqual(first);
		expect(sequence(c)).not.toEqual(first);
	});

	it('keeps int() inside its bounds', () => {
		const rng = createRng(9);
		for (let i = 0; i < 1000; i += 1) {
			const value = rng.int(3, 7);
			expect(value).toBeGreaterThanOrEqual(3);
			expect(value).toBeLessThanOrEqual(7);
		}
	});

	it('samples distinct items and refuses to sample more than there are', () => {
		const rng = createRng(4);
		const picked = rng.sample([1, 2, 3, 4, 5], 5);
		expect(new Set(picked).size).toBe(5);
		expect(() => rng.sample([1, 2], 3)).toThrow();
	});
});

describe('settings', () => {
	it('needs a vibe unless the test is clinical', () => {
		expect(settingsSchema.safeParse({ ...sub, intensity: 0, vibe: null }).success).toBe(true);
		expect(settingsSchema.safeParse({ ...sub, intensity: 2, vibe: null }).success).toBe(false);
		expect(settingsSchema.safeParse({ ...sub, intensity: 2, vibe: 'denial' }).success).toBe(true);
	});

	it('drops the vibe from a clinical run even when one is remembered', () => {
		expect(effectiveVibe({ intensity: 0, vibe: 'bambi' })).toBeNull();
		expect(effectiveVibe({ intensity: 4, vibe: 'bambi' })).toBe('bambi');
	});
});

/** Answer every question on screen until the run ends, choosing right or wrong per question. */
function playThrough(run: Run, rightFor: (question: Question) => boolean): Run {
	let next = run;
	while (!isExhausted(next)) {
		const question = next.questions[next.index] as Question;
		next = answer(next, rightFor(question) ? rightAnswer(question) : wrongAnswer(question));
	}
	return next;
}

describe('run', () => {
	it('deals one question at a time, up to RUN_LENGTH', () => {
		const run = createRun(sub, 123);
		expect(run.questions).toHaveLength(1);
		const played = playThrough(run, () => true);
		expect(played.questions).toHaveLength(RUN_LENGTH);
		expect(played.statuses.every((status) => status === 'answered')).toBe(true);
	});

	it('deals the same run for the same seed and answers', () => {
		const rightFor = (question: Question) => question.kind.length % 2 === 0;
		const first = playThrough(createRun(sub, 77), rightFor);
		expect(playThrough(createRun(sub, 77), rightFor).questions).toEqual(first.questions);
	});

	it('asks every kind once before any is asked twice', () => {
		for (const seed of [1, 2, 3, 4, 5]) {
			const run = playThrough(createRun(sub, seed), () => true);
			const firstRound = run.questions.slice(0, QUESTION_KINDS.length).map((q) => q.kind);
			expect(new Set(firstRound).size).toBe(QUESTION_KINDS.length);
		}
	});

	it('never deals the same kind twice in a row', () => {
		for (const seed of [1, 2, 3, 4, 5]) {
			const run = playThrough(createRun(sub, seed), (question) => question.kind !== 'matrix');
			const kinds = run.questions.map((question) => question.kind);
			for (let i = 1; i < kinds.length; i += 1) {
				expect(kinds[i]).not.toBe(kinds[i - 1]);
			}
		}
	});

	it('deals a sub more of what they get wrong, and a dom more of what they get right', () => {
		/** Matrix questions after the first round, over many runs, failing only those. */
		const matricesAfterRoundOne = (settings: Settings) => {
			let count = 0;
			for (let seed = 0; seed < 60; seed += 1) {
				const run = playThrough(
					createRun(settings, seed),
					(question) => question.kind !== 'matrix'
				);
				count += run.questions
					.slice(QUESTION_KINDS.length)
					.filter((question) => question.kind === 'matrix').length;
			}
			return count;
		};
		const forSub = matricesAfterRoundOne(sub);
		const forDom = matricesAfterRoundOne(dom);
		// An even share would be 18 slots / 12 kinds ≈ 1.5 a run, 90 over 60 runs.
		expect(forSub).toBeGreaterThan(150);
		expect(forDom).toBeLessThan(40);
	});

	it('only ever makes a kind rarer, never rules it out', () => {
		expect(kindWeight('sub', 50, 0)).toBe(KIND_WEIGHT_MIN);
		expect(kindWeight('dom', 0, 50)).toBe(KIND_WEIGHT_MIN);
		expect(kindWeight('sub', 0, 50)).toBe(KIND_WEIGHT_MAX);
		expect(kindWeight('sub', 0, 0)).toBe(1);
	});

	it('makes questions harder for a sub than for a dom, and harder as it goes', () => {
		expect(difficultyFor(0, 'sub')).toBe(2);
		expect(difficultyFor(0, 'dom')).toBe(1);
		expect(difficultyFor(RUN_LENGTH - 1, 'sub')).toBe(5);
		expect(difficultyFor(RUN_LENGTH - 1, 'dom')).toBe(4);
		for (let i = 0; i < RUN_LENGTH; i += 1) {
			expect(difficultyFor(i, 'sub')).toBeGreaterThanOrEqual(difficultyFor(i, 'dom'));
		}
	});

	it('only themes the questions at the levels that theme them', () => {
		const clinicalDebrief = playThrough(
			createRun({ ...sub, intensity: 1, vibe: 'bambi' }, 5),
			() => true
		);
		const memory = clinicalDebrief.questions.find((question) => question.kind === 'syllogism');
		expect(memory?.display.type === 'statements' && memory.display.lines.join(' ')).not.toMatch(
			/bimbo|blonde|airhead/
		);
	});

	it('moves on with answer() and skip(), and back() keeps what was answered', () => {
		let run = createRun(sub, 1);
		run = answer(run, 'x');
		run = skip(run);
		expect(run.index).toBe(2);
		expect(run.statuses.slice(0, 2)).toEqual(['answered', 'skipped']);
		run = back(run);
		expect(run.index).toBe(1);
		expect(run.responses[0]).toBe('x');
		expect(back(back(back(run))).index).toBe(0);
	});

	it('goes back to skipped questions, then on to the next unanswered one', () => {
		let run = createRun(dom, 3);
		run = skip(run); // 0
		run = answer(run, 'x'); // 1
		run = skip(run); // 2
		run = answer(run, 'y'); // 3
		expect(run.index).toBe(4);
		expect(skippedCount(run)).toBe(2);
		expect(firstSkipped(run)).toBe(0);
		run = returnToSkipped(run);
		expect(run.index).toBe(0);
		// Answering a returned-to question goes to the next skipped one, past 1.
		run = answer(run, 'z');
		expect(run.index).toBe(2);
		// Skipping it again goes on to the first question not yet answered.
		run = skip(run);
		expect(run.index).toBe(4);
		expect(run.questions).toHaveLength(5);
		expect(firstSkipped(run)).toBe(2);
	});

	it('does not offer the question on screen as a skipped one to return to', () => {
		let run = skip(createRun(dom, 3));
		run = back(run);
		expect(run.index).toBe(0);
		expect(firstSkipped(run)).toBeNull();
		expect(returnToSkipped(run)).toBe(run);
	});

	it('deals a skipped memory question again when it is returned to, the same way each time', () => {
		const seed = Array.from({ length: 200 }, (_, i) => i).find(
			(candidate) => createRun(sub, candidate).questions[0]?.memorise
		);
		expect(seed).toBeDefined();
		const skipped = skip(createRun(sub, seed as number));
		const [original] = skipped.questions;
		const returned = returnToSkipped(skipped);
		const [again] = returned.questions;
		expect(again?.kind).toBe(original?.kind);
		expect(again?.id).not.toBe(original?.id);
		expect(again?.memorise?.items).not.toEqual(original?.memorise?.items);
		expect(returnToSkipped(skipped).questions[0]).toEqual(again);
		expect(returned.variants[0]).toBe(1);
	});

	it('treats an empty answer as a skip', () => {
		const run = answer(createRun(sub, 1), '   ');
		expect(run.statuses[0]).toBe('skipped');
		expect(run.responses[0]).toBeNull();
	});

	it('offers a score once MIN_FOR_SCORE questions have been attempted', () => {
		let run = createRun(sub, 1);
		for (let i = 0; i < MIN_FOR_SCORE - 1; i += 1) {
			run = skip(run);
		}
		expect(canFinish(run)).toBe(false);
		run = skip(run);
		expect(canFinish(run)).toBe(true);
		expect(attemptedCount(run)).toBe(MIN_FOR_SCORE);
	});

	it('is exhausted after the last question', () => {
		let run = createRun(sub, 1);
		for (let i = 0; i < RUN_LENGTH; i += 1) {
			run = skip(run);
		}
		expect(isExhausted(run)).toBe(true);
		expect(run.index).toBe(RUN_LENGTH);
		expect(run.questions).toHaveLength(RUN_LENGTH);
	});

	it('remembers a dismissed banner on the run', () => {
		expect(dismissEnough(createRun(sub, 1)).enoughDismissed).toBe(true);
	});
});

describe('scoring', () => {
	it('gives a sub a lower IQ than a dom for the same accuracy', () => {
		for (const accuracy of [0, 0.25, 0.5, 0.75, 1]) {
			expect(iqFromAccuracy(accuracy, 'sub')).toBeLessThan(iqFromAccuracy(accuracy, 'dom'));
		}
	});

	it('scores an accuracy at the norm as 100', () => {
		expect(iqFromAccuracy(NORMS.sub.mean, 'sub')).toBe(100);
		expect(iqFromAccuracy(NORMS.dom.mean, 'dom')).toBe(100);
	});

	it('clamps to the floor and the ceiling', () => {
		expect(iqFromAccuracy(0, 'sub')).toBeGreaterThanOrEqual(IQ_FLOORS.sub);
		expect(iqFromAccuracy(-1, 'dom')).toBe(IQ_FLOORS.dom);
		expect(iqFromAccuracy(1, 'dom')).toBeLessThanOrEqual(160);
	});

	it('puts 100 at the 50th percentile and 115 near the 84th', () => {
		expect(percentileOf(100)).toBe(50);
		expect(percentileOf(115)).toBeCloseTo(84.1, 0);
		expect(percentileOf(70)).toBeCloseTo(2.3, 0);
	});

	it('counts skips as wrong and ignores unseen questions', () => {
		let run = answerRun(createRun(sub, 8), 6, true);
		run = skip(skip(run));
		const score = scoreRun(run);
		expect(score.attempted).toBe(8);
		expect(score.correct).toBe(6);
	});

	it('scores every right answer as right', () => {
		const run = playThrough(createRun(dom, 8), () => true);
		expect(
			run.questions.every((question, i) => isCorrect(question, run.responses[i] ?? null))
		).toBe(true);
		expect(scoreRun(run).correct).toBe(RUN_LENGTH);
	});

	it('counts a tick-all question partly right in part, rounding only the count shown', () => {
		const question = GENERATORS.synonyms(createRng(4), 3, { vibe: null }, 'q') as MultiQuestion;
		const half = question.answers.slice(0, question.answers.length / 2);
		const base = createRun(sub, 1);
		const run: Run = {
			...base,
			questions: [question, question],
			responses: [pickResponse(question.answers), pickResponse(half)],
			statuses: ['answered', 'answered'],
			variants: [0, 0],
			index: 2
		};
		const earned = 1 + half.length / question.answers.length;
		const score = scoreRun(run);
		expect(score.iq).toBe(iqFromAccuracy(earned / 2, 'sub'));
		expect(score.correct).toBe(Math.round(earned));
	});

	it('is 36 long, with one of every kind first', () => {
		expect(RUN_LENGTH).toBe(36);
		const run = playThrough(createRun(sub, 9), () => true);
		expect(new Set(run.questions.slice(0, QUESTION_KINDS.length).map((q) => q.kind)).size).toBe(
			QUESTION_KINDS.length
		);
		expect(QUESTION_KINDS).toHaveLength(18);
	});

	it('lets a sub sink to 4 with nothing right, and a dom no lower than 40', () => {
		expect(IQ_FLOORS).toEqual({ sub: 4, dom: 40 });
		expect(iqFromAccuracy(0, 'sub')).toBe(4);
		// A dom's norm never takes them near it: nothing right is still 61.
		expect(iqFromAccuracy(0, 'dom')).toBeGreaterThan(40);
		// The sub's top end is as it was: only the spread below the mean is narrower.
		expect(iqFromAccuracy(1, 'sub')).toBe(
			Math.round(100 + (15 * (1 - NORMS.sub.mean)) / NORMS.sub.sd)
		);
		// And it still falls steadily: every step less right is a lower score.
		for (let accuracy = 0.05; accuracy <= 1; accuracy += 0.05) {
			expect(iqFromAccuracy(accuracy, 'sub')).toBeGreaterThanOrEqual(
				iqFromAccuracy(accuracy - 0.05, 'sub')
			);
		}
	});

	it('times displays and answering for a sub only, and memorising for both', () => {
		const clocks = (settings: Settings) => {
			const run = playThrough(createRun(settings, 21), () => true);
			return {
				timed: run.questions.some((question) => question.timed || question.limit),
				memorise: run.questions.some((question) => question.memorise)
			};
		};
		expect(clocks(sub)).toEqual({ timed: true, memorise: true });
		expect(clocks(dom)).toEqual({ timed: false, memorise: true });
	});

	it('keeps a question lost to the clock answered and wrong, even if it is skipped later', () => {
		let run = answer(createRun(sub, 3), TIMED_OUT);
		expect(run.statuses[0]).toBe('answered');
		run = skip(back(run));
		expect(run.statuses[0]).toBe('answered');
		expect(run.responses[0]).toBe(TIMED_OUT);
		expect(skippedCount(run)).toBe(0);
		expect(scoreRun(run).correct).toBe(0);
	});

	it('words questions like a real test unless "Question content matches theme" is ticked', () => {
		const wordProblems = (settings: Settings) =>
			Array.from({ length: 30 }, (_, seed) => playThrough(createRun(settings, seed), () => true))
				.flatMap((run) => run.questions)
				.filter((question) => question.kind === 'word-problem')
				.map((question) => question.prompt);
		const themed = { ...bambiSub, intensity: 3 } as const;
		expect(wordProblems(themed).some((prompt) => prompt.startsWith('Bambi'))).toBe(true);
		const plain = wordProblems({ ...themed, themedQuestions: false });
		expect(plain.length).toBeGreaterThan(0);
		expect(plain.every((prompt) => !prompt.includes('Bambi'))).toBe(true);
	});

	it('rewords the questions not yet answered when their wording is changed, the one on screen included', () => {
		const themed: Settings = { ...bambiSub, intensity: 3 };
		let run = answer(createRun(themed, 4), 'x');
		const [answered, onScreen] = run.questions;
		run = withSettings(run, { ...themed, themedQuestions: false });
		expect(run.questions[0]).toBe(answered);
		expect(run.questions[1]?.kind).toBe(onScreen?.kind);
		expect(run.questions[1]?.id).not.toBe(onScreen?.id);
		expect(run.variants[1]).toBe(1);
		expect(run.settings.themedQuestions).toBe(false);

		// A change that leaves the wording alone leaves the questions alone.
		const same = withSettings(run, { ...run.settings, porn: false });
		expect(same.questions).toBe(run.questions);
	});

	it('never looks at the target IQ', () => {
		const run = answerRun(createRun(sub, 3), MIN_FOR_SCORE, true);
		const withTarget = { ...run, settings: { ...run.settings, targetIq: 60 } };
		expect(scoreRun(withTarget).iq).toBe(scoreRun(run).iq);
	});
});

const score = (iq: number): Score => ({
	iq,
	percentile: percentileOf(iq),
	correct: 5,
	attempted: 12,
	skipped: 0
});

describe('analysis', () => {
	it('simplifies as the score drops', () => {
		expect(simplicityFor(100)).toBe('full');
		expect(simplicityFor(85)).toBe('full');
		expect(simplicityFor(84)).toBe('simple');
		expect(simplicityFor(70)).toBe('simple');
		expect(simplicityFor(69)).toBe('very-simple');
	});

	it('classifies like a real report', () => {
		expect(classify(135)).toBe('Very superior');
		expect(classify(100)).toBe('Average');
		expect(classify(65)).toBe('Extremely low');
		expect(classify(40, true)).toBe('Extremely low');
	});

	it('names ever lower categories below the real scale, when humiliating, and only says so otherwise', () => {
		const names = [39, 34, 29, 24, 19, 14, 9, 4].map((iq) => classify(iq, true));
		expect(names).toEqual([
			'Severely impaired',
			'Profoundly impaired',
			'Cognitively negligible',
			'Functionally mindless',
			'Decorative only',
			'Vegetative',
			'Sub-vegetative',
			'Inanimate object'
		]);
		expect(classify(4)).toBe('Below measurable range');
		expect(analyse(score(4), { ...sub, intensity: 1 }).classification).toBe('Inanimate object');
		expect(analyse(score(4), sub).classification).toBe('Below measurable range');
	});

	it('explains the bell curve only for a low score', () => {
		expect(analyse(score(100), sub).curveExplainer).toBeNull();
		expect(analyse(score(84), sub).curveExplainer).not.toBeNull();
	});

	it('stays official in a clinical run', () => {
		const analysis = analyse(score(62), sub);
		expect(analysis.headline).toBe('Full Scale IQ: 62');
		expect(analysis.comparison).toBe('a five-year-old');
	});

	it('mocks a sub and flatters a dom in an explicit run', () => {
		expect(analyse(score(62), bambiSub).headline).toBe('Such a good, empty girl!');
		expect(analyse(score(62), bambiSub).comparison).toBe('Bambi with her trigger said twice');
		const domRun = { ...bambiSub, role: 'dom' as const };
		expect(analyse(score(130), domRun).headline).toBe('Clearly the brains of this relationship.');
	});

	it('never admits the test is rigged, at any intensity or in any role', () => {
		for (const intensity of INTENSITIES) {
			for (const role of ['sub', 'dom'] as const) {
				const settings: Settings = { ...bambiSub, intensity, role, soberIq: 110, targetIq: 70 };
				for (const iq of [45, 75, 100, 135]) {
					expect(JSON.stringify(analyse(score(iq), settings))).not.toMatch(
						/rigged|harder for you|easy on you|marking|between you and us/i
					);
				}
			}
		}
	});

	it("mocks at level 1 in plain words, in the institute's look, with no vibe", () => {
		const debrief: Settings = { ...sub, intensity: 1, vibe: null };
		const analysis = analyse(score(62), debrief);
		expect(analysis.headline).toBe('About as dim as we expected.');
		expect(analysis.comparison).toBe('a five-year-old');
		expect(analyse(score(62), { ...debrief, humiliating: false }).headline).toBe(
			'Full Scale IQ: 62'
		);
		expect(brandFor(debrief).title).toBe('Cognitive Assessment');
		expect(themeFor(debrief)).toEqual(themeFor(sub));
	});

	it('mocks in the vibe from level 2, unless the humiliation is turned off', () => {
		const themed: Settings = { ...sub, intensity: 2, vibe: 'denial' };
		expect(analyse(score(62), themed).headline).toBe('Too horny to think. Shocking.');
		expect(analyse(score(62), { ...themed, humiliating: false }).headline).toBe(
			'Full Scale IQ: 62'
		);
	});

	it('wears the vibe only while its look is on, and themes questions only while theirs is', () => {
		const themed: Settings = { ...sub, intensity: 2, vibe: 'denial' };
		expect(brandFor(themed).title).toBe('Locked Brain Assessment');
		expect(themeFor(themed)).not.toEqual(themeFor(sub));
		const plainLook = { ...themed, themedLook: false };
		expect(brandFor(plainLook).title).toBe('Cognitive Assessment');
		expect(themeFor(plainLook)).toEqual(themeFor(sub));
		expect(introFor(plainLook).heading).toBe('Before you begin');
		// The questions still tease.
		expect(tauntsFor(plainLook).length).toBeGreaterThan(0);
		expect(tauntsFor({ ...themed, themedQuestions: false })).toEqual([]);
		expect(introFor({ ...themed, themedQuestions: false }).heading).not.toBe('Before you begin');
	});

	it('compares against the sober and target IQs', () => {
		const analysis = analyse(score(80), { ...bambiSub, soberIq: 110, targetIq: 70 });
		expect(analysis.sober?.difference).toBe(-30);
		expect(analysis.sober?.line).toMatch(/30 points gone/);
		expect(analysis.target?.difference).toBe(10);
		const onTarget = analyse(score(72), { ...bambiSub, targetIq: 70 });
		expect(onTarget.target?.line).toMatch(/Right on your target/);
		expect(analyse(score(80), bambiSub).sober).toBeNull();
	});

	it('picks a comparison for every score', () => {
		for (let iq = 40; iq <= 160; iq += 1) {
			expect(comparisonFor(iq, null).length).toBeGreaterThan(0);
			expect(comparisonFor(iq, 'degradation').length).toBeGreaterThan(0);
		}
		expect(comparisonFor(150, 'bambi')).toBe('a Nobel laureate');
	});
});

describe('copy', () => {
	it('keeps a clinical intro free of the vibe', () => {
		const intro = introFor({ ...sub, intensity: 0, vibe: 'bambi' });
		expect(intro.body.join(' ')).not.toMatch(/bimbo|cutie|pretty/i);
	});

	it('taunts only a sub at a teasing intensity', () => {
		expect(tauntsFor(bambiSub).length).toBeGreaterThan(0);
		expect(tauntsFor({ ...bambiSub, role: 'dom' })).toEqual([]);
		expect(tauntsFor({ ...bambiSub, intensity: 1 })).toEqual([]);
		expect(tauntsFor(sub)).toEqual([]);
	});

	it('flashes the taunts instead of showing them, with the subliminals on', () => {
		const overload: Settings = { ...bambiSub, intensity: 4 };
		expect(tauntsFor(overload)).toEqual([]);
		expect(flashTauntsFor(overload).length).toBeGreaterThan(0);
		// Their own toggle's, not the questions'.
		expect(flashTauntsFor({ ...overload, themedQuestions: false }).length).toBeGreaterThan(0);
		const quiet = { ...overload, subliminals: false };
		expect(flashTauntsFor(quiet)).toEqual([]);
		expect(tauntsFor(quiet).length).toBeGreaterThan(0);
	});
});

describe('themes', () => {
	it('re-derives Web Awesome tokens on the wrapper with the theme’s palette', () => {
		const theme = themeFor(bambiSub);
		expect(schemeClass(theme)).toBe('wa-light');
		expect(themeStyle(theme)).toContain('--wa-color-brand-50: var(--wa-color-pink-50)');
		// Not `wa-dark`, which theme.css would repaint in the app's colours.
		expect(schemeClass(themeFor({ ...sub, intensity: 4, vibe: 'degradation' }))).toBe(
			'wa-theme-default'
		);
	});
});

describe('media', () => {
	const xml = `<feed><entry><content type="html">&lt;a href=&quot;https://i.redd.it/abc123.jpeg&quot;&gt;[link]&lt;/a&gt;
		&lt;img src=&quot;https://preview.redd.it/zzz.jpg?width=640&quot;&gt;
		&lt;a href=&quot;https://www.redgifs.com/watch/HappyPinkBunny&quot;&gt;[link]&lt;/a&gt;
		&lt;a href=&quot;https://i.redd.it/abc123.jpeg&quot;&gt;[dup]&lt;/a&gt;</content></entry></feed>`;

	it('pulls full-size images and Redgifs links out of a feed, once each', () => {
		expect(parseFeed(xml)).toEqual({
			images: ['https://i.redd.it/abc123.jpeg'],
			// A link carries no file, so this one plays in Redgifs' own player.
			clips: [{ id: 'happypinkbunny', video: null, sound: false }],
			// A post with no title or link says nothing about where these came from.
			origins: {}
		});
	});

	it('takes each picture’s and clip’s title and page from the post it is in', () => {
		const posts = `<feed><entry><title>Good girls &amp;amp; their &quot;homework&quot;</title>
			<link href="https://www.reddit.com/r/bimbofetish/comments/abc/good_girls/" />
			<content type="html">&lt;a href=&quot;https://i.redd.it/one.jpg&quot;&gt;[link]&lt;/a&gt;
			&lt;a href=&quot;https://www.redgifs.com/watch/PinkOne&quot;&gt;[link]&lt;/a&gt;</content></entry>
			<entry><title>Elsewhere</title><link href="https://evil.example/r/x" />
			<content type="html">&lt;a href=&quot;https://i.redd.it/two.jpg&quot;&gt;[link]&lt;/a&gt;</content></entry></feed>`;
		const feed = parseFeed(posts);
		expect(feed.images).toEqual(['https://i.redd.it/one.jpg', 'https://i.redd.it/two.jpg']);
		expect(feed.origins).toEqual({
			'https://i.redd.it/one.jpg': {
				title: 'Good girls & their "homework"',
				page: 'https://www.reddit.com/r/bimbofetish/comments/abc/good_girls/'
			},
			// A clip's page is its Redgifs page, which plays it.
			'clip:pinkone': {
				title: 'Good girls & their "homework"',
				page: 'https://www.redgifs.com/watch/pinkone'
			}
		});
		// A link anywhere but reddit or Redgifs is never put in an href.
		expect(feed.origins?.['https://i.redd.it/two.jpg']).toBeUndefined();
	});

	it('merges feeds without duplicates', () => {
		const feed = parseFeed(xml);
		expect(mergeFeeds([feed, feed, EMPTY_FEED])).toEqual(feed);
	});

	it('keeps only safe ids, and posters and videos on Redgifs’ own media host', () => {
		expect(
			parseRedgifs({
				gifs: [
					{
						id: 'happypinkbunny',
						hasAudio: true,
						urls: {
							poster: 'https://media.redgifs.com/HappyPinkBunny-poster.jpg',
							sd: 'https://media.redgifs.com/HappyPinkBunny-mobile.mp4'
						}
					},
					{ id: 'quietone', hasAudio: false, urls: { sd: 'https://evil.example/x.mp4' } },
					{ id: '../../evil', urls: { poster: 'https://evil.example/x.jpg' } },
					null,
					{ urls: null }
				]
			})
		).toEqual({
			images: ['https://media.redgifs.com/HappyPinkBunny-poster.jpg'],
			clips: [
				{
					id: 'happypinkbunny',
					video: 'https://media.redgifs.com/HappyPinkBunny-mobile.mp4',
					sound: true
				},
				// A file anywhere else is dropped, and the clip plays in the player.
				{ id: 'quietone', video: null, sound: false }
			],
			// Each on its Redgifs page: by its description, else who posted it.
			origins: {
				'https://media.redgifs.com/HappyPinkBunny-poster.jpg': {
					title: 'Redgifs',
					page: 'https://www.redgifs.com/watch/happypinkbunny'
				},
				'clip:happypinkbunny': {
					title: 'Redgifs',
					page: 'https://www.redgifs.com/watch/happypinkbunny'
				},
				'clip:quietone': { title: 'Redgifs', page: 'https://www.redgifs.com/watch/quietone' }
			}
		});
		expect(
			parseRedgifs({
				gifs: [
					{ id: 'a', description: 'Dripping <b>wet</b>', urls: {} },
					{ id: 'b', userName: 'pinkdoll', urls: {} }
				]
			}).origins
		).toEqual({
			'clip:a': { title: 'Dripping wet', page: 'https://www.redgifs.com/watch/a' },
			'clip:b': { title: 'By pinkdoll', page: 'https://www.redgifs.com/watch/b' }
		});
		expect(parseRedgifs({ error: 'nope' })).toEqual(EMPTY_FEED);
		expect(parseRedgifs(null)).toEqual(EMPTY_FEED);
	});

	it('keeps the playable copy when a clip comes from both a search and a link', () => {
		const merged = mergeFeeds([
			{ images: [], clips: [{ id: 'x', video: null, sound: false }] },
			{
				images: [],
				clips: [{ id: 'x', video: 'https://media.redgifs.com/X-mobile.mp4', sound: true }]
			}
		]);
		expect(merged.clips).toEqual([
			{ id: 'x', video: 'https://media.redgifs.com/X-mobile.mp4', sound: true }
		]);
	});

	it('interleaves sources, so the first pictures are a mix of all of them', () => {
		const merged = mergeFeeds([
			{ images: ['a1', 'a2'], clips: [] },
			{ images: ['b1', 'b2'], clips: [{ id: 'x', video: null, sound: false }] }
		]);
		expect(merged.images).toEqual(['a1', 'b1', 'a2', 'b2']);
	});

	it('shuffles a feed into a new order, keeping every picture and clip', () => {
		const feed = {
			images: Array.from({ length: 30 }, (_, i) => `https://i.redd.it/${i}.jpg`),
			clips: Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, video: null, sound: false }))
		};
		const shuffledFeed = shuffleFeed(feed, createRng(5).next);
		expect(shuffledFeed.images).not.toEqual(feed.images);
		expect(shuffledFeed.images).toHaveLength(feed.images.length);
		expect(new Set(shuffledFeed.images)).toEqual(new Set(feed.images));
		expect(new Set(shuffledFeed.clips)).toEqual(new Set(feed.clips));
		// The original is left alone: the page swaps feeds, it does not edit one.
		expect(feed.images[0]).toBe('https://i.redd.it/0.jpg');
	});

	it('gives every vibe a Redgifs source, so none depends on reddit alone', () => {
		for (const vibe of VIBES) {
			expect(SOURCES[vibe].some((source) => source.kind === 'redgifs')).toBe(true);
		}
	});

	it('only knows the vibes it has subreddits for', () => {
		expect(isVibe('bambi')).toBe(true);
		expect(isVibe('toString')).toBe(false);
		expect(isVibe(null)).toBe(false);
		expect(feedUrl('BimboFetish')).toBe('https://www.reddit.com/r/BimboFetish/top/.rss?t=week');
	});
});
