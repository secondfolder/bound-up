<script lang="ts">
	import { describeCell, type ShapeCell } from '$lib/playroom/iq-test/questions';

	/**
	 * One matrix cell: one to three identical shapes, solid, outlined or
	 * striped, drawn in `currentColor` so it follows the theme.
	 */
	let { cell }: { cell: ShapeCell } = $props();

	// Each cell's stripe pattern needs an id of its own: a page full of cells
	// sharing one id would all draw whichever pattern the document found first.
	const uid = $props.id();
	const patternId = `stripes-${uid}`;

	/** Centres for 1, 2 or 3 shapes in a 60×60 box. */
	const POSITIONS: Record<1 | 2 | 3, [number, number][]> = {
		1: [[30, 30]],
		2: [
			[18, 30],
			[42, 30]
		],
		3: [
			[30, 17],
			[17, 42],
			[43, 42]
		]
	};

	const size = $derived(cell.count === 1 ? 15 : 10);
	const FILL_PAINT: Record<ShapeCell['fill'], string> = {
		solid: 'currentColor',
		striped: `url(#${patternId})`,
		outline: 'none'
	};
	const fill = $derived(FILL_PAINT[cell.fill]);

	function points(cx: number, cy: number, r: number, shape: ShapeCell['shape']): string {
		if (shape === 'triangle') {
			return `${cx},${cy - r} ${cx + r},${cy + r * 0.8} ${cx - r},${cy + r * 0.8}`;
		}
		return `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
	}
</script>

<svg viewBox="0 0 60 60" role="img" aria-label={describeCell(cell)}>
	<defs>
		<pattern id={patternId} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
			<line x1="0" y1="0" x2="0" y2="4" stroke="currentColor" stroke-width="2" />
		</pattern>
	</defs>
	{#each POSITIONS[cell.count] as [cx, cy], index (index)}
		{#if cell.shape === 'circle'}
			<circle {cx} {cy} r={size} {fill} stroke="currentColor" stroke-width="2" />
		{:else if cell.shape === 'square'}
			<rect
				x={cx - size * 0.85}
				y={cy - size * 0.85}
				width={size * 1.7}
				height={size * 1.7}
				{fill}
				stroke="currentColor"
				stroke-width="2"
			/>
		{:else}
			<polygon points={points(cx, cy, size, cell.shape)} {fill} stroke="currentColor" stroke-width="2" />
		{/if}
	{/each}
</svg>

<style>
	svg {
		display: block;
		inline-size: 100%;
		block-size: auto;
	}
</style>
