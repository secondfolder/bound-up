<script lang="ts" module>
	import type { QuestionPhase } from '$lib/playroom/iq-test/run';

	/** Which part of a question is on screen. The page's distractions key off it. */
	export type Phase = QuestionPhase;
</script>

<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { type Question, TIMED_OUT } from '$lib/playroom/iq-test/questions';
	import type { ClockLeft } from '$lib/playroom/iq-test/run';
	import Countdown from './Countdown.svelte';
	import { spanOf } from './PolyominoShape.svelte';
	import ChoiceAnswers from './question/ChoiceAnswers.svelte';
	import MemorisePhase from './question/MemorisePhase.svelte';
	import MultiAnswers from './question/MultiAnswers.svelte';
	import PointAnswer from './question/PointAnswer.svelte';
	import QuestionDisplay from './question/QuestionDisplay.svelte';
	import TextAnswer from './question/TextAnswer.svelte';

	/**
	 * One question, from memorising through to answering: the phases, the
	 * prompt, and which pieces to show. What each phase and each way of
	 * answering looks like is its own component under `question/` — one per
	 * answer format (pick one, tick all, a board's square, typed), not per
	 * kind, since eighteen kinds share those four.
	 *
	 * The clocks are here too, since they reach across the pieces: a question
	 * shown for a while (`timed`) hides its display — and a word problem its
	 * prompt, a central point its points — once the time is up, and one with a
	 * deadline (`limit`) is failed when it passes with nothing given. A
	 * failed one, returned to, says so and offers nothing to answer.
	 *
	 * Keyed on the question by its parent, so every question starts fresh at
	 * its first phase — including one returned to with Back, whose words have
	 * to be shown again before they can be recalled.
	 *
	 * A reload is not a fresh start, though: the card reports which phase it
	 * is in and what is left on its clocks as they change (`onclock`), the
	 * page keeps that with the run, and a card mounted again for the same
	 * question carries on from it (`resume`) — mid-memorise with the time
	 * that was left, or past it without the items coming back.
	 * `untimed`, the "Clear timer" testing aid, runs no clock at all: nothing
	 * is hidden and nothing runs out. Turned off again, the clocks carry on
	 * from where they were stopped.
	 */
	let {
		question,
		previous,
		resume = null,
		untimed = false,
		onanswer,
		onphase,
		onclock
	}: {
		question: Question;
		/** What was answered here before, when this is a question returned to. */
		previous: string | null;
		/** The seconds left on this question's clocks before a reload. */
		resume?: Omit<ClockLeft, 'id'> | null;
		untimed?: boolean;
		onanswer: (response: string) => void;
		onphase?: (phase: Phase) => void;
		/** Each second a clock runs: what is left on this question's clocks. */
		onclock?: (left: Omit<ClockLeft, 'id'>) => void;
	} = $props();

	/** The phase to start in: the one a reload left, if this question has it. */
	function firstPhase(): Phase {
		const left = resume?.phase;
		if (left === 'answer' || (left === 'interference' && question.interference)) {
			return left;
		}
		return question.memorise ? 'memorise' : 'answer';
	}

	// svelte-ignore state_referenced_locally
	let phase = $state<Phase>(firstPhase());
	/** Where memorising stood before a reload, which `MemorisePhase` carries on from. */
	// svelte-ignore state_referenced_locally
	const memoriseFrom = { remaining: resume?.memorise, at: resume?.at };
	/** Where it stands now, for `onclock`; `MemorisePhase` runs the clock itself. */
	let memorised = memoriseFrom;

	$effect(() => {
		// Read first: `onphase?.(phase)` alone skips reading it without an
		// `onphase`, and the effect would never run again to save the change.
		const current = phase;
		onphase?.(current);
		// Saved as soon as it changes, not on the next tick: a reload just
		// after memorising must not bring the items back.
		untrack(reportClock);
	});

	/** The interference sum is only there to get in the way: any answer moves on. */
	function toAnswer() {
		phase = 'answer';
	}

	/** Run out of time before, and so lost: nothing to answer, and no clock. */
	const lost = $derived(previous === TIMED_OUT);
	const given = $derived(lost ? null : previous);

	/** A clock's starting seconds: what was left before a reload, never more than it had. */
	function startAt(seconds: number | undefined, left: number | undefined): number {
		return Math.min(seconds ?? 0, left ?? seconds ?? 0);
	}

	// Read once: `resume` is what was left when this card was mounted, and the
	// clocks run on from there on their own.
	// svelte-ignore state_referenced_locally
	let shownFor = $state(startAt(question.timed?.seconds, resume?.timed));
	const gone = $derived(question.timed !== undefined && shownFor <= 0 && !untimed);
	// svelte-ignore state_referenced_locally
	let answerLeft = $state(startAt(question.limit?.seconds, resume?.limit));
	let multi = $state<{ ticked: () => string }>();
	const clocks: ReturnType<typeof setInterval>[] = [];

	function stopClocks() {
		for (const clock of clocks) {
			clearInterval(clock);
		}
	}

	/** Out of time: a tick-all's ticks are its answer; anything else is failed. */
	function timeUp() {
		const ticked = multi?.ticked() ?? '';
		onanswer(ticked === '' ? TIMED_OUT : ticked);
	}

	function reportClock() {
		const { remaining, at } = memorised;
		onclock?.({
			phase,
			...(phase === 'memorise' && remaining !== undefined ? { memorise: remaining } : {}),
			...(phase === 'memorise' && at !== undefined ? { at } : {}),
			...(question.timed ? { timed: Math.max(0, shownFor) } : {}),
			...(question.limit ? { limit: Math.max(0, answerLeft) } : {})
		});
	}

	function memoriseTick(progress: { remaining: number; at: number }) {
		memorised = progress;
		reportClock();
	}

	$effect(() => {
		if (phase !== 'answer' || lost || untimed) {
			return;
		}
		// Already run down before a reload: hidden it stays, with no clock to run.
		if (question.timed && untrack(() => shownFor > 0)) {
			const clock = setInterval(() => {
				shownFor -= 1;
				reportClock();
				if (shownFor <= 0) {
					clearInterval(clock);
				}
			}, 1000);
			clocks.push(clock);
		}
		if (question.limit) {
			const clock = setInterval(() => {
				answerLeft -= 1;
				reportClock();
				if (answerLeft <= 0) {
					clearInterval(clock);
					timeUp();
				}
			}, 1000);
			clocks.push(clock);
		}
		return stopClocks;
	});

	onDestroy(stopClocks);

	function finishMemorising() {
		phase = question.interference ? 'interference' : 'answer';
	}

	/** Every shape in a rotation question drawn at one size, so a turn matches what it turned. */
	const span = $derived(
		spanOf([
			...(question.display.type === 'polyomino' ? [question.display.cells] : []),
			...(question.format === 'multi'
				? question.choices.flatMap((choice) => (choice.polyomino ? [choice.polyomino] : []))
				: [])
		])
	);
</script>

<section class="question" data-kind={question.kind} data-phase={phase}>
	{#if phase === 'memorise' && question.memorise}
		<MemorisePhase
			memorise={question.memorise}
			{untimed}
			resume={memoriseFrom}
			ondone={finishMemorising}
			ontick={memoriseTick}
		/>
	{:else if phase === 'interference' && question.interference}
		<p class="prompt">{question.interference.prompt}</p>
		<TextAnswer inputMode="numeric" submitLabel="Next" onsubmit={toAnswer} />
	{:else if lost}
		<p class="prompt">{question.prompt}</p>
		<p class="lost" role="status">You ran out of time on this one, so it counts as wrong.</p>
	{:else}
		{#if untimed}
			<!-- No clock to show: the "Clear timer" testing aid is on. -->
		{:else if question.timed}
			<Countdown seconds={question.timed.seconds} remaining={Math.max(0, shownFor)} />
		{:else if question.limit}
			<Countdown seconds={question.limit.seconds} remaining={Math.max(0, answerLeft)} />
		{/if}
		<!-- A prompt that is the whole question (a word problem) goes with the rest of it. -->
		<p class="prompt" class:gone={gone && question.timed?.prompt}>{question.prompt}</p>
		<QuestionDisplay {question} {span} {gone} />

		{#if question.format === 'choice'}
			<ChoiceAnswers {question} previous={given} {onanswer} />
		{:else if question.format === 'multi'}
			<MultiAnswers bind:this={multi} {question} previous={given} {onanswer} {span} />
		{:else if question.format === 'point'}
			<PointAnswer {question} previous={given} {onanswer} hidePoints={gone} />
		{:else}
			<TextAnswer inputMode={question.inputMode} previous={given} onsubmit={onanswer} />
		{/if}
	{/if}
</section>

<style>
	.question {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.prompt {
		font-size: 1.15rem;
		font-weight: 600;
		margin: 0;

		/* Kept in place, unseen, so nothing below it moves. */
		&.gone {
			visibility: hidden;
		}
	}

	.lost {
		margin: 0;
		color: var(--wa-color-text-quiet);
	}
</style>
