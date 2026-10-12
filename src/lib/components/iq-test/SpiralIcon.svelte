<script lang="ts">
	/**
	 * A hypnotic spiral, for the hypno's tab. Drawn here because Font Awesome,
	 * which every other icon on the page comes from, has no spiral. Decorative:
	 * the tab's region is what names it.
	 */
	const TURNS = 3.25;
	const STEPS = 120;
	const path = Array.from({ length: STEPS + 1 }, (_, i) => {
		const angle = (i / STEPS) * TURNS * 2 * Math.PI;
		const radius = 0.6 + (i / STEPS) * 10.4;
		const x = 12 + radius * Math.cos(angle);
		const y = 12 + radius * Math.sin(angle);
		return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
	}).join(' ');
</script>

<svg class="spiral" viewBox="0 0 24 24" aria-hidden="true">
	<path d={path} />
</svg>

<style>
	.spiral {
		display: block;
		inline-size: 1.25em;
		block-size: 1.25em;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
	}
</style>
