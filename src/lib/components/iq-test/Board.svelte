<script lang="ts">
	import { cellName, type Grid } from '$lib/playroom/iq-test/questions';

	/**
	 * A board of squares for the visual memory and central point questions.
	 *
	 * - `show`: just the board, `marked` squares shaded — the pattern to
	 *   remember.
	 * - `toggle`: every square a button that shades and unshades itself
	 *   (`selected`), to reproduce the pattern.
	 * - `pick`: every square a button, `marked` ones showing the points, and
	 *   a click picks one.
	 *
	 * The buttons are native, not wa-buttons: each carries `aria-pressed`,
	 * which wa-button would not forward to the button inside it.
	 */
	let {
		grid,
		mode,
		marked = [],
		selected = [],
		onselect
	}: {
		grid: Grid;
		mode: 'show' | 'toggle' | 'pick';
		/** Shaded squares: the pattern, or the points. */
		marked?: readonly number[];
		/** Squares chosen. */
		selected?: readonly number[];
		onselect?: (cell: number) => void;
	} = $props();

	const cells = $derived(Array.from({ length: grid.columns * grid.rows }, (_, cell) => cell));
</script>

{#if mode === 'show'}
	<div
		class="board show"
		style:--columns={grid.columns}
		data-testid="board"
		role="img"
		aria-label="A board of {grid.columns} by {grid.rows} with {marked.length} squares shaded"
	>
		{#each cells as cell (cell)}
			<span class="square" class:marked={marked.includes(cell)}></span>
		{/each}
	</div>
{:else}
	<!-- A fieldset: a group of controls, named for what they are. -->
	<fieldset class="board" style:--columns={grid.columns} data-testid="board" aria-label="Board">
		{#each cells as cell (cell)}
			<button
				type="button"
				class="square"
				class:marked={marked.includes(cell)}
				aria-pressed={selected.includes(cell)}
				aria-label={marked.includes(cell) ? `${cellName(grid, cell)}, marked` : cellName(grid, cell)}
				onclick={() => onselect?.(cell)}
			></button>
		{/each}
	</fieldset>
{/if}

<style>
	.board {
		/* A fieldset's own border, padding and minimum width, undone. */
		margin: 0;
		margin-inline: auto;
		padding: 0;
		border: none;
		min-inline-size: 0;
		display: grid;
		grid-template-columns: repeat(var(--columns), 1fr);
		gap: 0.25rem;
		inline-size: min(100%, 20rem);
	}

	.square {
		aspect-ratio: 1;
		/* Released from Web Awesome's fixed control height for a <button>. */
		display: block;
		inline-size: 100%;
		block-size: auto;
		padding: 0;
		border: var(--wa-border-width-s) solid var(--wa-color-neutral-border-normal);
		border-radius: var(--wa-border-radius-s);
		background: var(--wa-color-surface-lowered);
	}

	button.square {
		cursor: pointer;

		@media (hover: hover) {
			&:hover {
				border-color: var(--wa-color-brand-border-loud);
			}
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}
	}

	/* The pattern, or the points: in the success colour, so a chosen square
	   (the brand's) is never confused with one. */
	.marked {
		background: var(--wa-color-success-fill-loud);
		border-color: var(--wa-color-success-fill-loud);
	}

	.square[aria-pressed='true'] {
		background: var(--wa-color-brand-fill-loud);
		border-color: var(--wa-color-brand-border-loud);
	}

	/* The pattern to remember in the colour it is reproduced in. */
	.board.show .marked {
		background: var(--wa-color-brand-fill-loud);
		border-color: var(--wa-color-brand-border-loud);
	}

	/* A point that is also the pick: both, as a ring round the point. */
	.marked[aria-pressed='true'] {
		background: var(--wa-color-success-fill-loud);
		box-shadow: 0 0 0 3px var(--wa-color-brand-fill-loud);
	}
</style>
