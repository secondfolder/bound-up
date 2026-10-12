<script lang="ts" module>
	/** Which part of a question is on screen. The page's distractions key off it. */
	export type Phase = 'memorise' | 'interference' | 'answer';
</script>

<script lang="ts">
	import { onDestroy } from 'svelte';
	import { type Question, TIMED_OUT } from '$lib/playroom/iq-test/questions';
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
	 */
	let {
		question,
		previous,
		onanswer,
		onphase
	}: {
		question: Question;
		/** What was answered here before, when this is a question returned to. */
		previous: string | null;
		onanswer: (response: string) => void;
		onphase?: (phase: Phase) => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	let phase = $state<Phase>(question.memorise ? 'memorise' : 'answer');

	$effect(() => {
		onphase?.(phase);
	});

	/** The interference sum is only there to get in the way: any answer moves on. */
	function toAnswer() {
		phase = 'answer';
	}

	/** Run out of time before, and so lost: nothing to answer, and no clock. */
	const lost = $derived(previous === TIMED_OUT);
	const given = $derived(lost ? null : previous);

	// svelte-ignore state_referenced_locally
	let shownFor = $state(question.timed?.seconds ?? 0);
	const gone = $derived(question.timed !== undefined && shownFor <= 0);
	// svelte-ignore state_referenced_locally
	let answerLeft = $state(question.limit?.seconds ?? 0);
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

	$effect(() => {
		if (phase !== 'answer' || lost) {
			return;
		}
		if (question.timed) {
			const clock = setInterval(() => {
				shownFor -= 1;
				if (shownFor <= 0) {
					clearInterval(clock);
				}
			}, 1000);
			clocks.push(clock);
		}
		if (question.limit) {
			const clock = setInterval(() => {
				answerLeft -= 1;
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
		<MemorisePhase memorise={question.memorise} ondone={finishMemorising} />
	{:else if phase === 'interference' && question.interference}
		<p class="prompt">{question.interference.prompt}</p>
		<TextAnswer inputMode="numeric" submitLabel="Next" onsubmit={toAnswer} />
	{:else if lost}
		<p class="prompt">{question.prompt}</p>
		<p class="lost" role="status">You ran out of time on this one, so it counts as wrong.</p>
	{:else}
		{#if question.timed}
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
