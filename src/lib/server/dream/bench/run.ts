/**
 * One bench run: a brief through reading, picking, building and a few
 * passages, with every prompt sent and reply received kept, so what a
 * prompt change sends can be read (docs/dreams.md, "Quality tools").
 *
 * The completion function is passed in, so a test can run the whole pipeline
 * against canned replies, and code's randomness comes from one seed, so two
 * prompt versions can be compared on identical draws.
 *
 * Alias-free, for the bench.
 */

import { type Build, parseBuild } from '../../../dream/build';
import { drawNudges, type Nudge } from '../../../dream/nudges';
import { pickDirection } from '../../../dream/pick';
import { seededRandom, seedFrom } from '../../../dream/random';
import { type BriefReading, parseBriefReading } from '../../../dream/reading';
import {
	memoryFor,
	type PathTurn,
	repeatedAt,
	sceneToSummarise,
	type UserTurn,
	userTurnOf
} from '../../../dream/story';
import type { DreamSummary, DreamTurn } from '../../../sealed-kinds/dreams';
import { drawPool } from '../names/draw';
import type { Completion } from '../openrouter';
import { buildMessages } from '../prompts/build';
import type { ModelMessage } from '../prompts/core';
import { summaryMessages } from '../prompts/fill';
import { passageMessages } from '../prompts/passage';
import { readingMessages } from '../prompts/reading';
import type { BenchBrief } from './briefs';
import { type CheckResult, runChecks } from './checks';
import { type Fingerprint, fingerprintMessages, parseFingerprint } from './fingerprint';
import { type Persona, playerMessages, readPlayerTurn } from './player';

export type Complete = (messages: readonly ModelMessage[], step: string) => Promise<Completion>;

export type BenchStep = {
	step: string;
	messages: readonly ModelMessage[];
	completion: Completion;
};

export type BenchRun = {
	brief: BenchBrief;
	/** The prompt version under test: a git commit, or a name given with --label. */
	label: string;
	model: string;
	seed: string;
	nudges: Nudge[];
	reading: BriefReading;
	picked: string | null;
	build: Build | null;
	passages: string[];
	/** The user's turn before each passage after the opening: the player's, or Continue. */
	turns: UserTurn[];
	/** Scene summaries written along the way. */
	summaries: string[];
	steps: BenchStep[];
	checks: CheckResult[];
	fingerprint: Fingerprint | null;
	cost: number;
	error?: string;
};

export type RunOptions = {
	label: string;
	model: string;
	seed: string;
	/** Passages after the opening. */
	passages: number;
	complete: Complete;
	/** A cheap model for the variety fingerprint; none skips it. */
	fingerprint?: Complete;
	/**
	 * Without code's variety: no nudges, the model's most likely direction,
	 * no name pool. A baseline for measuring what the variety adds
	 * (docs/dreams.md, "Variety").
	 */
	plain?: boolean;
	/** A simulated player taking each turn; without one, every turn is Continue. */
	player?: { persona: Persona };
};

const BENCH_LIMITS: readonly string[] = [];

/** A bench run never throws: a failure is recorded on the run, with whatever it got that far. */
export async function runBrief(brief: BenchBrief, options: RunOptions): Promise<BenchRun> {
	const random = seededRandom(seedFrom(`${options.seed}:${brief.id}`));
	const nudges = options.plain ? [] : drawNudges(random);
	const steps: BenchStep[] = [];
	const call = async (step: string, messages: readonly ModelMessage[]): Promise<string> => {
		const completion = await options.complete(messages, step);
		steps.push({ step, messages, completion });
		return completion.text;
	};
	const run: BenchRun = {
		brief,
		label: options.label,
		fingerprint: null,
		model: options.model,
		seed: options.seed,
		nudges,
		reading: parseBriefReading(''),
		picked: null,
		build: null,
		passages: [],
		turns: [],
		summaries: [],
		steps,
		checks: [],
		cost: 0
	};
	try {
		await runSteps(run, brief, options, call, random);
	} catch (error) {
		run.error = error instanceof Error ? error.message : String(error);
	}
	if (options.fingerprint && run.build && run.passages[0]) {
		run.fingerprint = await fingerprintOf(run, options.fingerprint, steps);
	}
	run.cost = steps.reduce((sum, step) => sum + (step.completion.usage.cost ?? 0), 0);
	// Time to the first words where the call was streamed, as the plan's targets are.
	const latency = (name: string): number[] =>
		steps
			.filter((step) => step.step.startsWith(name))
			.map((step) => step.completion.firstTokenMs ?? step.completion.latencyMs);
	run.checks = runChecks({
		brief,
		reading: run.reading,
		build: run.build,
		passages: run.passages,
		timings: {
			reading: latency('reading')[0] ?? 0,
			build: latency('build')[0] ?? 0,
			passages: latency('passage')
		}
	});
	return run;
}

async function runSteps(
	run: BenchRun,
	brief: BenchBrief,
	options: RunOptions,
	call: (step: string, messages: readonly ModelMessage[]) => Promise<string>,
	random: () => number
): Promise<void> {
	const readingText = await call(
		'reading',
		readingMessages({
			brief: brief.brief,
			limits: BENCH_LIMITS,
			preferences: [],
			recentDirections: [],
			nudges: run.nudges,
			canFetch: false
		})
	);
	run.reading = parseBriefReading(readingText);
	// A user pick is a person's choice; the bench stands in with the same weighted pick.
	// Plain takes the model's own favourite, as asking it for one answer would.
	const direction = options.plain
		? ([...run.reading.directions].sort((a, b) => b.p - a.p)[0] ?? null)
		: pickDirection(run.reading.directions, run.reading.spread.n, random);
	run.picked = direction?.text ?? null;
	const buildText = await call(
		'build',
		buildMessages({
			brief: brief.brief,
			musts: run.reading.musts,
			research: run.reading.research.text,
			direction: run.picked,
			nudges: run.nudges,
			limits: BENCH_LIMITS,
			preferences: [],
			recentNames: [],
			// Drawn from the run's seed, so prompt versions compare on the same pool.
			...(options.plain ? {} : { namePool: drawPool(random) })
		})
	);
	const build = parseBuild(buildText);
	run.build = build;
	if (!build.passage) {
		return;
	}
	run.passages.push(build.passage);
	const path: PathTurn[] = [{ id: 'p0', turn: passageTurn(build.passage) }];
	const summaries: { turnId: string; summary: DreamSummary }[] = [];
	for (let index = 0; index < options.passages; index += 1) {
		const turn = options.player
			? readPlayerTurn(
					await call(
						`player ${index + 2}`,
						playerMessages(options.player.persona, brief.brief, storySoFar(path))
					)
				)
			: CONTINUE;
		run.turns.push(turn);
		path.push({ id: `u${index + 1}`, turn: inputTurn(turn) });
		const memory = memoryFor(path, summaries, turn);
		const text = await call(
			`passage ${index + 2}`,
			passageMessages({
				setup: {
					heat: build.heat,
					telling: build.telling,
					capabilities: build.capabilities,
					elements: build.elements,
					presentation: build.presentation,
					musts: run.reading.musts,
					research: run.reading.research.text
				},
				limits: BENCH_LIMITS,
				preferences: [],
				history: memory.history,
				summaries: memory.summaries,
				repeated: repeatedAt(path)
			})
		);
		run.passages.push(text);
		path.push({ id: `p${index + 1}`, turn: passageTurn(text) });
		// Scenes are condensed as the page condenses them, so a long session
		// tests the memory the page would give it.
		const scene = sceneToSummarise(path, summaries);
		if (scene) {
			const summary = await call(
				`summary ${summaries.length + 1}`,
				summaryMessages({ telling: build.telling, limits: BENCH_LIMITS, passages: scene.passages })
			);
			summaries.push({
				turnId: scene.throughTurnId,
				summary: { text: summary.trim(), fromTurnId: scene.fromTurnId }
			});
			run.summaries.push(summary.trim());
		}
	}
}

const CONTINUE: UserTurn = { kind: 'continue' };

function passageTurn(source: string): DreamTurn {
	return { kind: 'passage', source, request: 'next', ended: 'complete', model: '', provider: '' };
}

function inputTurn(turn: UserTurn): DreamTurn {
	return {
		kind: 'input',
		text: turn.kind === 'words' ? turn.text : '',
		cycles: [],
		answers: [],
		rolls: [],
		fields: []
	};
}

/** Each passage with the turn after it, as the player sees the story. */
function storySoFar(path: readonly PathTurn[]): { passage: string; turn: UserTurn | null }[] {
	return path.flatMap((entry, index) => {
		if (entry.turn?.kind !== 'passage') {
			return [];
		}
		const next = path[index + 1]?.turn;
		return [{ passage: entry.turn.source, turn: next?.kind === 'input' ? userTurnOf(next) : null }];
	});
}

async function fingerprintOf(
	run: BenchRun,
	complete: Complete,
	steps: BenchStep[]
): Promise<Fingerprint | null> {
	const buildStep = steps.find((step) => step.step === 'build');
	const messages = fingerprintMessages(buildStep?.completion.text ?? '', run.passages[0] ?? '');
	try {
		const completion = await complete(messages, 'fingerprint');
		steps.push({ step: 'fingerprint', messages, completion });
		return parseFingerprint(completion.text);
	} catch {
		// A fingerprint is a bonus; the run stands without it.
		return null;
	}
}
