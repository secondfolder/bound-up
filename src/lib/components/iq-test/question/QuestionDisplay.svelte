<script lang="ts">
	import type { Question } from '$lib/playroom/iq-test/questions';
	import PolyominoShape from '../PolyominoShape.svelte';
	import ShapeCell from '../ShapeCell.svelte';
	import { INK } from './ink';

	/**
	 * What a question shows above its answers, beyond its prompt: a series,
	 * statements, colour words, a matrix, a shape.
	 *
	 * `gone` once a timed question's time to look is up (counted by the
	 * card): it keeps its place, unseen, so the answers below do not jump up
	 * under the pointer, and a note says where it went.
	 */
	let { question, span, gone }: { question: Question; span: number; gone: boolean } = $props();
</script>

<div class="display" class:gone>
	{#if question.display.type === 'sequence'}
		<p class="sequence">{question.display.items.join(',  ')}</p>
	{:else if question.display.type === 'statements'}
		<ol class="statements">
			{#each question.display.lines as line, index (index)}
				<li>{line}</li>
			{/each}
		</ol>
	{:else if question.display.type === 'stroop'}
		<p class="stroop" data-testid="stroop-words">
			{#each question.display.words as { word, ink }, index (index)}
				<span style:color={INK[ink]}>{word.toUpperCase()}</span>
			{/each}
		</p>
	{:else if question.display.type === 'polyomino'}
		<div class="polyomino-shown" data-testid="polyomino-shown">
			<PolyominoShape cells={question.display.cells} {span} />
		</div>
	{:else if question.display.type === 'matrix'}
		<div class="matrix">
			{#each question.display.cells as cell, index (index)}
				<div class="cell" class:missing={cell === null}>
					{#if cell}
						<ShapeCell {cell} />
					{:else}
						<span aria-hidden="true">?</span>
						<span class="wa-visually-hidden">Missing piece</span>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
	{#if gone}
		<p class="gone-note" role="status">Time's up — answer from memory.</p>
	{/if}
</div>

<style>
	.sequence {
		font-size: 1.75rem;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.05em;
		margin: 0;
		text-align: center;
	}

	.statements {
		margin: 0;
		padding-inline-start: 1.5rem;
		font-size: 1.1rem;
	}

	.stroop {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem 1.25rem;
		margin: 0;
		font-size: 2rem;
		font-weight: 800;
		letter-spacing: 0.04em;
	}

	.display {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 1rem;

		&:empty {
			display: none;
		}

		&.gone > :not(.gone-note) {
			visibility: hidden;
		}

		.gone-note {
			position: absolute;
			inset: 0;
			display: grid;
			place-items: center;
			margin: 0;
			color: var(--wa-color-text-quiet);

			/* Alone when what went was the prompt (a word problem) or a board's
			   points: nothing to sit over, so it takes a line of its own. */
			&:only-child {
				position: static;
			}
		}
	}

	/* The shape to turn in the head: about the size of an answer card. */
	.polyomino-shown {
		inline-size: min(40%, 9rem);
		margin-inline: auto;
		color: var(--wa-color-text-normal);
	}

	/* The grid and its answers share one width, so a piece reads as the same
	   size in both. The grid is one board, its cells joined by hairlines (the
	   gap, over the board's border colour), so it does not read as nine
	   separate tiles like the answers under it. */
	.matrix {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--wa-border-width-s);
		inline-size: min(100%, 24rem);
		margin-inline: auto;
		border: var(--wa-border-width-s) solid var(--wa-color-neutral-border-normal);
		border-radius: var(--wa-border-radius-m);
		overflow: hidden;
		background: var(--wa-color-neutral-border-normal);

		.cell {
			aspect-ratio: 1;
			padding: 0.4rem;
			display: grid;
			place-items: center;
			font-size: 2rem;
			background: var(--wa-color-surface-lowered);
			color: var(--wa-color-text-normal);

			&.missing {
				background: var(--wa-color-brand-fill-quiet);
				color: var(--wa-color-brand-on-quiet);
				font-weight: 700;
			}
		}
	}
</style>
