<script lang="ts">
	import { catalog, commonnessLabel, intensityLabel } from '$lib/kink-list/catalog';
	import { kinkListContext } from '$lib/kink-list/context';
	import Slider from '../Slider.svelte';

	/**
	 * Which kinks the list shows, as two limits read the same way: the most
	 * intense kinks to show, and the rarest. Kinks past either are hidden
	 * everywhere but search. By default Extreme and Rare are both out, so they
	 * are seen only by someone who asks.
	 *
	 * The list stores commonness, a minimum (`settings.minCommonness`), but a
	 * minimum of something common reads backwards beside a maximum of
	 * intensity. So this slider is rareness, its turn-round: on both, moving
	 * right shows more.
	 */
	const { store } = kinkListContext();

	const MAX_INTENSITY = Object.keys(catalog.intensity.levels).length - 1;
	const MAX_RARENESS = Object.keys(catalog.commonness.levels).length - 1;

	const intensity = $derived(store.filters.maxIntensity);
	const rareness = $derived(MAX_RARENESS - store.filters.minCommonness);
	const rarenessLabel = (level: number) => commonnessLabel(MAX_RARENESS - level);

	/** Where each knob is while it is dragged, so its reading follows it before it is saved. */
	let dragging = $state<{ intensity?: number; rareness?: number }>({});
	const endDrag = (key: 'intensity' | 'rareness') => (down: boolean) => {
		if (!down) {
			delete dragging[key];
		}
	};
</script>

<div class="filters">
	<!-- The setting on the title row, as on the app's other sliders with a
	     reading (OptionalSlider says why the title is drawn here). -->
	<div class="filter">
		<div class="heading" aria-hidden="true">
			<span class="title">Max intensity</span>
			<span class="reading">{intensityLabel(dragging.intensity ?? intensity)}</span>
		</div>
		<Slider
			label="Max intensity"
			labelHidden
			min={0}
			max={MAX_INTENSITY}
			value={intensity}
			format={intensityLabel}
			oninput={(level) => {
				dragging.intensity = level;
			}}
			ondrag={endDrag('intensity')}
			onchange={(maxIntensity) => store.setFilters({ maxIntensity })}
		/>
	</div>
	<div class="filter">
		<div class="heading" aria-hidden="true">
			<span class="title">Max rareness</span>
			<span class="reading">{rarenessLabel(dragging.rareness ?? rareness)}</span>
		</div>
		<Slider
			label="Max rareness"
			labelHidden
			min={0}
			max={MAX_RARENESS}
			value={rareness}
			format={rarenessLabel}
			oninput={(level) => {
				dragging.rareness = level;
			}}
			ondrag={endDrag('rareness')}
			onchange={(level) => store.setFilters({ minCommonness: MAX_RARENESS - level })}
		/>
	</div>
</div>

<style>
	/* Its width is never the content's: the reading beside each title is a
	   different width at each level ("Extreme", "Hardcore"), and sized by it,
	   every move resized the filters, and the search beside them with them.
	   So the two share a fixed basis evenly, at most 15em each. */
	.filters {
		flex: 0 1 26em;
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.5rem;
	}

	.filter {
		flex: 1 1 0;
		min-inline-size: 10em;
		max-inline-size: 15em;
	}

	.heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		margin-block-end: 0.25rem;
		font-size: 0.875rem;
	}

	.title {
		white-space: nowrap;
		font-weight: var(--wa-form-control-label-font-weight);
		color: var(--wa-form-control-label-color);
	}

	.reading {
		color: var(--wa-color-text-quiet);
		white-space: nowrap;
	}
</style>
