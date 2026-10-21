<script lang="ts">
	import { page } from '$app/state';
	import { catalog, detailLabel, MAX_DETAIL, MIN_DETAIL } from '$lib/kink-list/catalog';
	import { kinkListContext } from '$lib/kink-list/context';
	import Slider from '../Slider.svelte';

	/**
	 * Which kinks the list shows, as one slider: the level of detail. Low, it
	 * is the commonest kinks and nothing finer; high, every rare kink and
	 * every specific. Each kink's level comes from how common it is and, for a
	 * specific, how much its answer adds to its kink's (`detailOf`). Kinks
	 * past it are hidden everywhere, search included, which counts them.
	 *
	 * While dragged, the list follows the knob notch by notch
	 * (`store.previewDetail`); the level is saved only when it is let go.
	 *
	 * In debug mode a switch makes it show only the kinks at the level, not
	 * every one up to it, to check what each level adds (`atDetail`). It
	 * lasts for the visit and is not saved.
	 *
	 * The level in words sits on the title row with the slider's own label
	 * hidden, as on the app's other sliders with a reading (OptionalSlider
	 * says why).
	 */
	const { store } = kinkListContext();

	/** Saved, not previewed: the knob is where the slider puts it while dragged. */
	const detail = $derived(store.list.settings.detail);
</script>

<div class="filter">
	<div class="heading" aria-hidden="true">
		<span class="title">Level of detail</span>
		<span class="reading">{detailLabel(store.filters.detail)}</span>
	</div>
	<Slider
		label="Level of detail"
		labelHidden
		min={MIN_DETAIL}
		max={MAX_DETAIL}
		value={detail}
		format={detailLabel}
		low={catalog.detail.levels[String(MIN_DETAIL)]}
		high={catalog.detail.levels[String(MAX_DETAIL)]}
		oninput={(level) => {
			store.previewDetail = level;
		}}
		ondrag={(down) => {
			if (!down) {
				// After the change a release sends, which saves first, so the
				// list never falls back to the old level for a frame; and still
				// cleared when a release sends none.
				setTimeout(() => {
					store.previewDetail = null;
				});
			}
		}}
		onchange={(level) => {
			store.setFilters({ detail: level });
			store.previewDetail = null;
		}}
	/>
	{#if page.data.debug}
		<wa-switch
			class="exact"
			size="s"
			checked={store.exactDetail}
			onchange={(event: Event) => {
				store.exactDetail = (event.target as HTMLInputElement).checked;
			}}>Only this level</wa-switch
		>
	{/if}
</div>

<style>
	/* How it flexes is up to where it sits (KinkListHome's row beside the
	   search; TriageGrid's column, where a flex basis set here became a
	   240px-tall gap under it). */
	.filter {
		min-inline-size: 11em;
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

	.exact {
		margin-block-start: 0.375rem;
		font-size: 0.8125rem;
	}

	.reading {
		color: var(--wa-color-text-quiet);
		white-space: nowrap;
	}
</style>
