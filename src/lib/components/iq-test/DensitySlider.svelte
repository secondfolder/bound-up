<script lang="ts">
	import { GOON_DENSITY_MAX } from '$lib/playroom/iq-test/media-fit';
	import Slider from '../Slider.svelte';

	/**
	 * How densely "Give up and goon" packs the porn (`goonSpacing`): the
	 * settings tab's one setting while gooning, in place of the test's. In the
	 * panel, and on its own in the collapsed tab when there is room
	 * (`compact`), as the intensity slider is the rest of the time.
	 */
	let {
		value,
		onchange,
		ondrag,
		compact = false
	}: {
		value: number;
		onchange: (density: number) => void;
		/** A drag began or ended: from the pointer going down on it to it coming up anywhere. */
		ondrag?: (dragging: boolean) => void;
		/** Small, for the collapsed tab: its label unseen but named, and no words at its ends. */
		compact?: boolean;
	} = $props();

	function set(next: number) {
		if (next !== value) {
			onchange(next);
		}
	}
</script>

{#snippet control()}
	<!-- Following the knob as it passes each notch, so the porn repacks under the finger. -->
	<Slider
		label="Porn density"
		labelHidden={compact}
		name="density"
		min={0}
		max={GOON_DENSITY_MAX}
		{value}
		low={compact ? undefined : 'Roomy'}
		high={compact ? undefined : 'Packed'}
		oninput={set}
		onchange={set}
		{ondrag}
	/>
{/snippet}

{#if compact}
	<!-- A mark for what it is, as the intensity slider has in the same place. -->
	<span class="density compact-control">
		<wa-icon class="mark" name="table-cells" variant="solid" aria-hidden="true"></wa-icon>
		{@render control()}
	</span>
{:else}
	<span class="density full">{@render control()}</span>
{/if}

<style>
	/* Laid out as `IntensitySlider`'s compact form, which this takes the place of. */
	.compact-control {
		display: inline-flex;
		align-items: center;
	}

	.mark {
		flex: none;
		inline-size: 2rem;
		font-size: 1rem;
		color: var(--wa-color-text-quiet);
	}

	.full {
		display: block;
		inline-size: min(100%, 300px);
		margin-inline: auto;

		:global(wa-slider)::part(label) {
			font-weight: 700;
		}
	}

	/* Room at each end for the knob, which overhangs the track at its ends. */
	.compact-control :global(wa-slider) {
		inline-size: 8rem;
		margin-inline: 0.5rem;
	}
</style>
