<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * One answer: a raised card with its letter in the corner, plainly an
	 * answer to pick whatever the question above it looks like.
	 *
	 * A native button, not a wa-button: it carries `aria-pressed` — the answer
	 * given last time, or a tick-all's tick — and wa-button forwards no ARIA
	 * state to the button inside it.
	 */
	let {
		index,
		pressed,
		label,
		shape = 'text',
		ticks = false,
		color,
		onclick,
		children
	}: {
		/** Its place: 0 is A. */
		index: number;
		pressed: boolean;
		/** Its accessible name, when what it shows is not text (a shape, a colour, an emoji). */
		label?: string;
		/**
		 * - `text`: words, centred.
		 * - `square`: as wide as its column and square (a piece, a shape, an emoji).
		 * - `swatch`: a block of colour under the letter.
		 */
		shape?: 'text' | 'square' | 'swatch';
		/** A tick-all's card: shows a tick in the corner while pressed. */
		ticks?: boolean;
		/** The text's colour: a Stroop answer's ink. The letter keeps its own. */
		color?: string;
		onclick: () => void;
		children: Snippet;
	} = $props();
</script>

<button
	type="button"
	class="answer-card {shape}"
	aria-pressed={pressed}
	aria-label={label}
	style:color={color}
	{onclick}
>
	<span class="letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span>
	{#if ticks}
		<span class="tick" aria-hidden="true"><wa-icon name="check" variant="solid"></wa-icon></span>
	{/if}
	{@render children()}
</button>

<style>
	.answer-card {
		/* How far in the letter and the tick sit. A fixed inset sat on the
		   curve itself under bambi's rounding (two and a half times the
		   usual), so it grows with the corner: a quarter-circle of radius r
		   cuts about 0.3r into each edge, and the corner glyph goes that far in
		   plus a little. At ordinary rounding the old fixed inset still wins. */
		--corner-inset: calc(var(--wa-border-radius-l) * 0.3 + 0.15rem);
		--letter-inset-block: max(0.375rem, var(--corner-inset));

		position: relative;
		font: inherit;
		font-size: 1.05rem;
		/* Clear of the letter above, and as much again below to stay centred. */
		padding: calc(var(--letter-inset-block) + 1rem) 1rem;
		border: var(--wa-border-width-s) solid var(--wa-color-neutral-border-normal);
		border-radius: var(--wa-border-radius-l);
		background: var(--wa-color-surface-raised);
		box-shadow: var(--wa-shadow-s);
		color: var(--wa-color-text-normal);
		cursor: pointer;

		/* Only where there is a real pointer to hover with. On a touchscreen
		   :hover sticks to whatever was last tapped, and since answering swaps
		   in the next question's buttons in the same place, the new button
		   under the finger came up looking already chosen. */
		@media (hover: hover) {
			&:hover {
				border-color: var(--wa-color-brand-border-loud);
			}
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}

		&[aria-pressed='true'] {
			border-color: var(--wa-color-brand-border-loud);
			background: var(--wa-color-brand-fill-quiet);
		}

		/* As wide as its column, and square. Web Awesome's native styles give
		   every <button> a fixed control height, which pinned these at 45px: with
		   the aspect ratio, that made each answer a 45px square, a third the size
		   of the grid's pieces and off to the left of its column. So the height is
		   released, and the width set outright — a grid item with an aspect ratio
		   is otherwise aligned like an image, to the start of its track. A block
		   rather than a flex box, so an SVG takes the button's whole width. */
		&.square {
			display: block;
			inline-size: 100%;
			block-size: auto;
			aspect-ratio: 1;
			padding: 0.4rem;
		}

		/* A block, for the same reason: Web Awesome's native styles make a
		   <button> an inline flex box of a fixed control height, in which an
		   empty span has no width at all — the colour was never seen. */
		&.swatch {
			display: block;
			block-size: auto;
			padding: calc(var(--letter-inset-block) + 1rem) 0.5rem 0.5rem;
		}
	}

	/* A, B, C… in the corner: what makes each one an answer to pick — and,
	   for a matrix, not a piece of the board. Its own colour, not a Stroop
	   answer's ink. */
	.letter {
		position: absolute;
		inset-block-start: var(--letter-inset-block);
		inset-inline-start: max(0.5rem, var(--corner-inset));
		font-size: 0.75rem;
		font-weight: 700;
		line-height: 1;
		color: var(--wa-color-text-quiet);
	}

	/* A tick-all's tick, in the other corner, only once ticked. */
	.tick {
		position: absolute;
		inset-block-start: max(0.3rem, var(--corner-inset));
		inset-inline-end: max(0.4rem, var(--corner-inset));
		font-size: 0.8rem;
		color: var(--wa-color-brand-on-quiet);
		opacity: 0;

		[aria-pressed='true'] > & {
			opacity: 1;
		}
	}
</style>
