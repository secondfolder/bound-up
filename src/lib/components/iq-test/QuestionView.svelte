<script lang="ts">
	import { rightAnswer, wrongAnswer } from '$lib/playroom/iq-test/questions';
	import {
		attemptedCount,
		type ClockLeft,
		canFinish,
		clockLeftFor,
		firstSkipped,
		isExhausted,
		MIN_FOR_SCORE,
		RUN_LENGTH,
		type Run,
		skippedCount
	} from '$lib/playroom/iq-test/run';
	import QuestionCard, { type Phase } from './QuestionCard.svelte';

	/**
	 * The test in progress: progress, the current question, and the controls
	 * around it. The run itself is the page's; this only reports what the taker
	 * did with it.
	 */
	let {
		run,
		enoughBanner,
		skippedNote,
		taunt = null,
		answerButton = false,
		timersCleared = false,
		onanswer,
		onskip,
		onback,
		onexit,
		onreturn,
		ondismiss,
		onfinish,
		onphase,
		onclock,
		ontimerscleared
	}: {
		run: Run;
		/** Shown once a score is available. */
		enoughBanner: string;
		/** Added to the banner when questions were skipped, given how many. */
		skippedNote: (skipped: number) => string;
		/** A line to tease with above the question, at the levels that tease. */
		taunt?: string | null;
		/**
		 * Show "Correct answer", a testing aid shown while debug mode is on
		 * (docs/debug-mode.md): it answers the question on screen correctly, so
		 * a run can be tapped through quickly.
		 */
		answerButton?: boolean;
		/**
		 * "Clear timer", beside "Correct answer" and shown with it: no clock
		 * runs on any question while it is on. Ignored without `answerButton`,
		 * so it cannot outlive debug mode.
		 */
		timersCleared?: boolean;
		onanswer: (response: string) => void;
		onskip: () => void;
		onback: () => void;
		/** Back from the first question: out of the test, to the intro. */
		onexit: () => void;
		/** Back to the first skipped question. */
		onreturn: () => void;
		/** Put the "enough for a score" banner away. */
		ondismiss: () => void;
		onfinish: () => void;
		onphase?: (phase: Phase) => void;
		/** What is left on the question on screen's clocks, each second one runs. */
		onclock?: (clock: ClockLeft) => void;
		ontimerscleared?: (cleared: boolean) => void;
	} = $props();

	const question = $derived(run.questions[run.index]);
	const attempted = $derived(attemptedCount(run));
	const finishable = $derived(canFinish(run));
	const exhausted = $derived(isExhausted(run));
	const skipped = $derived(skippedCount(run));
	/** Whether there is a skipped question to go back to, other than this one. */
	const canReturn = $derived(firstSkipped(run) !== null);
	const total = RUN_LENGTH;
	const untimed = $derived(answerButton && timersCleared);
</script>

<div class="question-view">
	<header>
		<span class="count">
			{#if question && !exhausted}
				Question {run.index + 1} of {total}
			{:else}
				All {total} questions seen
			{/if}
		</span>
		<div
			class="progress"
			role="progressbar"
			aria-label="Questions attempted"
			aria-valuemin={0}
			aria-valuemax={total}
			aria-valuenow={attempted}
		>
			<span style:inline-size="{(attempted / total) * 100}%"></span>
		</div>
		{#if !finishable}
			<span class="until">{MIN_FOR_SCORE - attempted} more for a score</span>
		{:else if run.enoughDismissed && !exhausted}
			<!-- What is left of the banner once it has been put away. -->
			<wa-button size="s" appearance="outlined" onclick={onfinish}>Finish early</wa-button>
		{/if}
	</header>

	<!--
		Directly under the progress line, above everything that can come and go
		between questions — the "enough for a score" banner, the taunt, and the
		question itself, whose height varies — so it stays under a finger
		tapping through a run.
	-->
	{#if answerButton && question && !exhausted}
		<div class="answer-buttons">
			<wa-button
				size="s"
				appearance="outlined"
				variant="neutral"
				onclick={() => onanswer(rightAnswer(question))}
			>
				<wa-icon slot="start" name="check" variant="solid"></wa-icon>
				Correct answer
			</wa-button>
			<!-- An answer, not a skip: a skip is counted differently, and is its own button. -->
			<wa-button
				size="s"
				appearance="outlined"
				variant="neutral"
				onclick={() => onanswer(wrongAnswer(question))}
			>
				<wa-icon slot="start" name="xmark" variant="solid"></wa-icon>
				Incorrect answer
			</wa-button>
			<!--
				The same as Skip below, but up here, where it does not move. Named
				apart from that one: two buttons with one name are ambiguous to
				anyone navigating by name.
			-->
			<wa-button size="s" appearance="outlined" variant="neutral" onclick={onskip}>
				<wa-icon slot="start" name="forward" variant="solid"></wa-icon>
				Skip question
			</wa-button>
			<wa-switch
				size="s"
				checked={timersCleared}
				onchange={(event: Event) =>
					ontimerscleared?.((event.currentTarget as HTMLInputElement).checked)}
				>Clear timer</wa-switch
			>
		</div>
	{/if}

	<!--
		Not on the last page: that has a finish button of its own, so the banner
		would only say the same thing twice.
	-->
	{#if finishable && !exhausted && !run.enoughDismissed}
		<wa-callout variant="brand" class="enough" data-testid="enough-banner">
			<!-- In the corner, as a close button is: first, so it is reached before the actions. -->
			<wa-button size="s" appearance="plain" pill class="dismiss" onclick={ondismiss}>
				<wa-icon name="xmark" variant="solid" label="Dismiss"></wa-icon>
			</wa-button>
			<div class="enough-text">
				<span>{enoughBanner}</span>
				{#if skipped > 0}
					<span class="skipped-note">{skippedNote(skipped)}</span>
				{/if}
			</div>
			<div class="enough-actions">
				{#if skipped > 0 && canReturn}
					<wa-button size="s" appearance="outlined" onclick={onreturn}>Go back to them</wa-button>
				{/if}
				<wa-button size="s" variant="brand" onclick={onfinish}>Finish and see my score</wa-button>
			</div>
		</wa-callout>
	{/if}

	{#if taunt}
		<p class="taunt">{taunt}</p>
	{/if}

	{#if question && !exhausted}
		{#key question.id}
			<QuestionCard
				{question}
				previous={run.responses[run.index] ?? null}
				resume={clockLeftFor(run, question.id)}
				{untimed}
				{onanswer}
				{onphase}
				onclock={(left) => onclock?.({ id: question.id, ...left })}
			/>
		{/key}
		<nav class="controls" aria-label="Question">
			<!-- Never disabled: on the first question it goes back out to the intro. -->
			<wa-button class="back" appearance="plain" onclick={run.index === 0 ? onexit : onback}>
				<wa-icon slot="start" name="arrow-left" variant="solid"></wa-icon>
				Back
			</wa-button>
			{#if canReturn}
				<wa-button appearance="plain" onclick={onreturn}>
					<wa-icon slot="start" name="rotate-left" variant="solid"></wa-icon>
					Return to skipped
				</wa-button>
			{/if}
			<wa-button appearance="outlined" onclick={onskip}>
				Skip
				<wa-icon slot="end" name="forward" variant="solid"></wa-icon>
			</wa-button>
		</nav>
	{:else}
		<section class="end">
			<p>That's every question.</p>
			{#if skipped > 0}
				<p class="skipped-note">{skippedNote(skipped)}</p>
			{/if}
			<div class="controls">
				<wa-button class="back" appearance="plain" onclick={onback}>
					<wa-icon slot="start" name="arrow-left" variant="solid"></wa-icon>
					Back
				</wa-button>
				{#if canReturn}
					<wa-button appearance="outlined" onclick={onreturn}>
						<wa-icon slot="start" name="rotate-left" variant="solid"></wa-icon>
						Return to skipped
					</wa-button>
				{/if}
				<wa-button variant="brand" onclick={onfinish}>See my score</wa-button>
			</div>
		</section>
	{/if}
</div>

<style>
	.question-view {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	header {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.875rem;
		color: var(--wa-color-text-quiet);
	}

	.answer-buttons {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.progress {
		block-size: 0.4rem;
		border-radius: 999px;
		background: var(--wa-color-neutral-fill-quiet);
		overflow: hidden;

		span {
			display: block;
			block-size: 100%;
			background: var(--wa-color-brand-fill-loud);
			transition: inline-size 200ms ease;
		}
	}

	.enough {
		position: relative;
	}

	/* Clear of the dismiss button in the corner. */
	.enough::part(message) {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding-inline-end: 1.75rem;
	}

	.dismiss {
		position: absolute;
		inset-block-start: 0.25rem;
		inset-inline-end: 0.25rem;
	}

	.enough-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.enough-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.skipped-note {
		font-weight: 600;
	}

	.taunt {
		margin: 0;
		text-align: center;
		font-family: var(--wa-font-family-heading);
		font-size: 1.25rem;
		color: var(--wa-color-brand-on-quiet);
	}

	/* Back on its own at the start; everything that moves on together at the
	   end, Return to skipped beside the button it is an alternative to. */
	.controls {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-block-start: 1rem;

		.back {
			margin-inline-end: auto;
		}
	}

	.end p {
		font-size: 1.15rem;
	}
</style>
