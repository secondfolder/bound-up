<script lang="ts">
	import { IQ_MEAN, IQ_SD, normalPdf } from '$lib/playroom/iq-test/scoring';

	/**
	 * The normal curve with a score marked on it: the picture a real IQ report
	 * prints, and the one the results explain when the score is low.
	 */
	let { iq }: { iq: number } = $props();

	const WIDTH = 320;
	const HEIGHT = 140;
	const BASELINE = 116;
	const MAX_IQ = 160;
	const PEAK = normalPdf(0);

	/**
	 * The chart's left edge: 40, where a real scale stops, unless the score is
	 * below it — a sub's can reach 4 — when the axis runs on, flat, out to the
	 * score, so the dot is seen that far from everyone else.
	 */
	const minIq = $derived(Math.min(40, Math.floor((iq - 5) / 5) * 5));

	const x = (value: number) => ((value - minIq) / (MAX_IQ - minIq)) * WIDTH;
	const y = (value: number) => BASELINE - (normalPdf((value - IQ_MEAN) / IQ_SD) / PEAK) * 100;

	const curve = $derived(
		Array.from({ length: MAX_IQ - minIq + 1 }, (_, i) => {
			const value = minIq + i;
			return `${x(value).toFixed(1)},${y(value).toFixed(1)}`;
		}).join(' ')
	);

	/** The shaded share of people below the score. */
	const below = $derived(
		[
			`${x(minIq)},${BASELINE}`,
			...Array.from({ length: Math.max(0, iq - minIq) + 1 }, (_, i) => {
				const value = minIq + i;
				return `${x(value).toFixed(1)},${y(value).toFixed(1)}`;
			}),
			`${x(iq).toFixed(1)},${BASELINE}`
		].join(' ')
	);

	/** Every 15 points; further down the axis too when it reaches that far. */
	const ticks = $derived([10, 25, 40, 55, 70, 85, 100, 115, 130, 145].filter((t) => t > minIq));
</script>

<svg
	viewBox="0 0 {WIDTH} {HEIGHT}"
	role="img"
	aria-label="A bell curve of IQ scores, with your score of {iq} marked on it"
	data-testid="bell-curve"
>
	<polygon class="below" points={below} />
	<polyline class="curve" points={curve} />
	<line class="axis" x1="0" y1={BASELINE} x2={WIDTH} y2={BASELINE} />
	{#each ticks as tick (tick)}
		<line class="tick" x1={x(tick)} y1={BASELINE} x2={x(tick)} y2={BASELINE + 4} />
		<text class="label" x={x(tick)} y={BASELINE + 16}>{tick}</text>
	{/each}
	<!-- From the dot down: a line above it pointed at nothing. -->
	<line
		class="marker"
		x1={x(iq)}
		y1={y(iq)}
		x2={x(iq)}
		y2={BASELINE}
		data-testid="bell-curve-line"
	/>
	<circle class="dot" cx={x(iq)} cy={y(iq)} r="6" data-testid="bell-curve-marker" data-iq={iq} />
</svg>

<style>
	svg {
		display: block;
		inline-size: 100%;
		max-inline-size: 32rem;
		margin-inline: auto;
		overflow: visible;
	}

	.curve {
		fill: none;
		stroke: var(--wa-color-text-normal);
		stroke-width: 2;
	}

	.below {
		fill: color-mix(in oklab, var(--wa-color-brand-fill-loud) 30%, transparent);
	}

	.axis,
	.tick {
		stroke: var(--wa-color-text-quiet);
	}

	.label {
		fill: var(--wa-color-text-quiet);
		font-size: 10px;
		text-anchor: middle;
	}

	.marker {
		stroke: var(--wa-color-brand-fill-loud);
		stroke-width: 2;
		stroke-dasharray: 3 2;
	}

	.dot {
		fill: var(--wa-color-brand-fill-loud);
		stroke: var(--wa-color-surface-default);
		stroke-width: 2;
	}
</style>
