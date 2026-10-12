<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Analysis } from '$lib/playroom/iq-test/analysis';
	import type { Score } from '$lib/playroom/iq-test/scoring';
	import BellCurve from './BellCurve.svelte';

	/**
	 * The score and what it means.
	 *
	 * How much is said depends on the score: below 85 the page drops the
	 * report-style details, and below 70 it is a big number and a few short
	 * sentences in big type. That is part of the joke, and it applies to a
	 * clinical run as much as a themed one.
	 */
	let {
		score,
		analysis,
		history,
		onretake,
		retakeLabel = 'Take it again'
	}: {
		score: Score;
		analysis: Analysis;
		/**
		 * The history list and whatever goes with it, which the page owns. Left
		 * out on someone else's result, opened from its link.
		 */
		history?: Snippet;
		onretake: () => void;
		/** What the retake button says: "Take the test yourself" on someone else's result. */
		retakeLabel?: string;
	} = $props();

	const full = $derived(analysis.simplicity === 'full');
</script>

<article class="results {analysis.simplicity}" data-simplicity={analysis.simplicity}>
	<h2 class="headline">{analysis.headline}</h2>

	<p class="score" data-testid="iq-score">
		<span class="label">IQ</span>
		<span class="number">{score.iq}</span>
		<!-- The category a real report prints, as prominent as the number it names. -->
		<span class="classification" data-testid="iq-classification">{analysis.classification}</span>
	</p>

	{#if full}
		<dl class="facts">
			<div>
				<dt>Percentile</dt>
				<dd>{score.percentile}</dd>
			</div>
			<div>
				<dt>Correct</dt>
				<dd>{score.correct} of {score.attempted}</dd>
			</div>
			{#if score.skipped > 0}
				<div>
					<dt>Skipped</dt>
					<dd>{score.skipped}</dd>
				</div>
			{/if}
		</dl>
	{/if}

	<p class="summary">{analysis.summary}</p>

	{#if analysis.skipLine}
		<p class="skip-line" data-testid="skip-line">{analysis.skipLine}</p>
	{/if}

	<BellCurve iq={score.iq} />

	{#if analysis.curveExplainer}
		<p class="explainer" data-testid="curve-explainer">{analysis.curveExplainer}</p>
	{/if}

	{#if full}
		<p class="comparison">As smart as <strong>{analysis.comparison}</strong>.</p>
	{/if}

	{#if analysis.sober || analysis.target}
		<ul class="deltas">
			{#if analysis.sober}
				<li>{analysis.sober.line}</li>
			{/if}
			{#if analysis.target}
				<li>{analysis.target.line}</li>
			{/if}
		</ul>
	{/if}

	<div class="actions">
		<wa-button variant="brand" onclick={onretake}>{retakeLabel}</wa-button>
	</div>

	{#if history}
		<section class="history">
			<h3>Your results</h3>
			{@render history()}
		</section>
	{/if}
</article>

<style>
	.results {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		text-align: center;
	}

	.headline {
		font-family: var(--wa-font-family-heading);
		font-size: clamp(1.5rem, 6vw, 2.25rem);
		margin: 0;
	}

	.score {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin: 0;

		.label {
			font-size: 0.875rem;
			letter-spacing: 0.2em;
			color: var(--wa-color-text-quiet);
		}

		.number {
			font-size: 4.5rem;
			font-weight: 800;
			line-height: 1;
			font-variant-numeric: tabular-nums;
			color: var(--wa-color-brand-on-quiet);
		}

		.classification {
			margin-block-start: 0.25rem;
			font-family: var(--wa-font-family-heading);
			font-size: 2rem;
			font-weight: 800;
			line-height: 1.1;
			color: var(--wa-color-brand-on-quiet);
		}
	}

	.facts {
		display: flex;
		justify-content: center;
		flex-wrap: wrap;
		gap: 0.5rem 2rem;
		margin: 0;

		div {
			display: flex;
			flex-direction: column;
		}

		dt {
			font-size: 0.75rem;
			text-transform: uppercase;
			letter-spacing: 0.1em;
			color: var(--wa-color-text-quiet);
		}

		dd {
			margin: 0;
			font-weight: 700;
		}
	}

	.skip-line {
		margin: 0;
		font-weight: 700;
		font-size: 1.1rem;
	}

	.summary,
	.explainer,
	.comparison {
		margin: 0;
		max-inline-size: 36rem;
		margin-inline: auto;
	}

	.explainer {
		color: var(--wa-color-text-quiet);
	}

	.deltas {
		list-style: none;
		padding: 0;
		margin: 0;
		font-weight: 600;
	}

	.history {
		text-align: start;
		margin-block-start: 1.5rem;

		h3 {
			margin: 0 0 0.5rem;
		}
	}

	/* Fewer, bigger words as the score drops. */
	.simple {
		.summary {
			font-size: 1.25rem;
		}

		.number {
			font-size: 6rem;
		}

		.classification {
			font-size: 2.5rem;
		}
	}

	.very-simple {
		.headline {
			font-size: clamp(2rem, 9vw, 3rem);
		}

		.number {
			font-size: 8rem;
		}

		.classification {
			font-size: 3rem;
		}

		.summary,
		.explainer {
			font-size: 1.5rem;
			line-height: 1.4;
		}
	}
</style>
