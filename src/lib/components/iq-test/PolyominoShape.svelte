<script lang="ts" module>
	import type { Polyomino } from '$lib/playroom/iq-test/questions';

	/** The box every one of these shapes fits in, in squares: the largest's longest side. */
	export function spanOf(shapes: readonly Polyomino[]): number {
		return Math.max(1, ...shapes.flat().map(([x, y]) => Math.max(x, y) + 1));
	}
</script>

<script lang="ts">
	/**
	 * A shape of joined squares, drawn in `currentColor`, centred in a square
	 * box `span` squares across. Every shape in a question is drawn at the same
	 * `span`, so a turned one is the same size as the one it was turned from.
	 */
	let { cells, span }: { cells: Polyomino; span: number } = $props();

	const width = $derived(Math.max(...cells.map(([x]) => x)) + 1);
	const height = $derived(Math.max(...cells.map(([, y]) => y)) + 1);
</script>

<!-- Half a square of margin all round, clear of an answer card's letter. -->
<svg viewBox="-0.5 -0.5 {span + 1} {span + 1}" aria-hidden="true">
	<g transform="translate({(span - width) / 2} {(span - height) / 2})">
		{#each cells as [x, y] (`${x},${y}`)}
			<rect {x} {y} width="1" height="1" />
		{/each}
	</g>
</svg>

<style>
	svg {
		display: block;
		inline-size: 100%;
		block-size: auto;
		aspect-ratio: 1;
	}

	rect {
		fill: currentColor;
		fill-opacity: 0.85;
		/* A hairline between squares, so the shape reads as squares joined. */
		stroke: var(--wa-color-surface-default);
		stroke-width: 0.06;
	}
</style>
