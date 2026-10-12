<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The answers of a question, as a grid of cards under a heading, set apart
	 * from the question above: a gap, the heading, and each answer a raised,
	 * lettered card (see `AnswerCard`). A matrix's answers are pieces like its
	 * grid's own, and without these read as more of the board.
	 */
	let {
		heading,
		layout = 'text',
		children
	}: {
		/** "Answers", or "Tick all that apply". */
		heading: string;
		/**
		 * - `text`: as many columns of words as fit.
		 * - `square`: three square cards to a row, a matrix's width (pieces, shapes).
		 * - `swatches`: narrower, for blocks of colour.
		 */
		layout?: 'text' | 'square' | 'swatches';
		children: Snippet;
	} = $props();
</script>

<p class="answers-heading" class:square={layout === 'square'} aria-hidden="true">{heading}</p>
<div class="answer-cards {layout}">
	{@render children()}
</div>

<style>
	.answers-heading {
		margin: 0.75rem 0 -0.25rem;
		font-size: 0.8125rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--wa-color-text-quiet);

		/* Over square answers, which are narrower than the card. */
		&.square {
			inline-size: min(100%, 24rem);
			margin-inline: auto;
		}
	}

	.answer-cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: 0.75rem;

		/* The matrix's own width, so a piece reads as the same size in both. */
		&.square {
			grid-template-columns: repeat(3, 1fr);
			inline-size: min(100%, 24rem);
			margin-inline: auto;
		}

		&.swatches {
			grid-template-columns: repeat(auto-fit, minmax(5rem, 1fr));
		}
	}
</style>
