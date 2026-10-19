<script lang="ts">
	import { catalog, commonnessLabel, intensityLabel } from '$lib/kink-list/catalog';
	import { kinkListContext } from '$lib/kink-list/context';

	/**
	 * Which kinks the list shows: how intense, and how common. Kinks outside
	 * either are hidden everywhere but search. By default Extreme and Rare are
	 * both out, so they are seen only by someone who asks.
	 *
	 * On both sliders, moving right shows more: the commonness slider runs
	 * from Very common to Rare, so its position is the minimum turned round.
	 */
	const { store } = kinkListContext();

	const MAX_COMMONNESS = Object.keys(catalog.commonness.levels).length - 1;
	const MAX_INTENSITY = Object.keys(catalog.intensity.levels).length - 1;

	type WaSlider = HTMLElement & { value: number; valueFormatter?: (value: number) => string };

	/**
	 * Wired by hand: a wa-slider's events happen in its shadow root (AGENTS.md).
	 * Saved on `change`, when it is let go, not at every step on the way.
	 */
	function slider(format: (value: number) => string, save: (value: number) => void) {
		return (node: WaSlider) => {
			// What a screen reader announces instead of a bare number.
			node.valueFormatter = format;
			const onChange = () => save(Math.round(node.value));
			node.addEventListener('change', onChange);
			return () => node.removeEventListener('change', onChange);
		};
	}

	const intensity = $derived(store.filters.maxIntensity);
	const commonness = $derived(store.filters.minCommonness);
</script>

<div class="filters">
	<div class="filter">
		<span class="readout" aria-hidden="true">Up to {intensityLabel(intensity)}</span>
		<wa-slider
			label="How intense"
			min={0}
			max={MAX_INTENSITY}
			step={1}
			value={intensity}
			{@attach slider(intensityLabel, (maxIntensity) => store.setFilters({ maxIntensity }))}
		></wa-slider>
	</div>
	<div class="filter">
		<span class="readout" aria-hidden="true">Down to {commonnessLabel(commonness)}</span>
		<wa-slider
			label="How common"
			min={0}
			max={MAX_COMMONNESS}
			step={1}
			value={MAX_COMMONNESS - commonness}
			{@attach slider(
				(position) => commonnessLabel(MAX_COMMONNESS - position),
				(position) => store.setFilters({ minCommonness: MAX_COMMONNESS - position })
			)}
		></wa-slider>
	</div>
</div>

<style>
	.filters {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.75rem 1.5rem;

		@media (min-width: 600px) {
			grid-template-columns: 1fr 1fr;
		}
	}

	.filter {
		position: relative;
	}

	/* Beside the slider's own label, on its line. */
	.readout {
		position: absolute;
		inset-inline-end: 0;
		inset-block-start: 0;
		font-size: 0.8125rem;
		color: var(--wa-color-text-quiet);
	}
</style>
