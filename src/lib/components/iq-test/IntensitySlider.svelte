<script lang="ts">
	import { INTENSITY_LABELS } from '$lib/playroom/iq-test/copy';
	import { type Intensity, MAX_INTENSITY } from '$lib/playroom/iq-test/settings';
	import Slider from '../Slider.svelte';

	/**
	 * The intensity slider: one slider rather than five options, because the
	 * levels are steps on a single scale, from straight-faced to overwhelming,
	 * and a slider says so. In the settings (`SettingsFields`), and on its own
	 * in the collapsed settings tab when there is room (`compact`).
	 *
	 * The dragging, the spring onto a notch and the notches are the app's
	 * slider's (`Slider.svelte`). What is this one's own: the level changes as
	 * the knob passes each notch, not only when it is let go, so what a level
	 * offers changes under the finger; and the compact form, with its mark.
	 */
	let {
		value,
		onchange,
		ondrag,
		compact = false
	}: {
		value: Intensity;
		onchange: (level: Intensity) => void;
		/** A drag began or ended: from the pointer going down on it to it coming up anywhere. */
		ondrag?: (dragging: boolean) => void;
		/**
		 * Small, for the collapsed settings tab: its label unseen but still
		 * named to a screen reader, and no "None" and "Max" at its ends.
		 */
		compact?: boolean;
	} = $props();

	function setLevel(next: number) {
		if (next !== value) {
			onchange(next as Intensity);
		}
	}
</script>

{#snippet control()}
	<Slider
		label="Stimulation intensity"
		labelHidden={compact}
		name="intensity"
		min={0}
		max={MAX_INTENSITY}
		{value}
		format={(level) => INTENSITY_LABELS[level as Intensity]}
		low={compact ? undefined : 'None'}
		high={compact ? undefined : 'Max'}
		oninput={setLevel}
		onchange={setLevel}
		{ondrag}
	/>
{/snippet}

{#if compact}
	<!--
		With a mark for what it is, as the volume sliders have theirs. Only a
		mark: the slider is named already, and unlike theirs it does nothing
		when pressed.
	-->
	<span class="intensity compact-control">
		<wa-icon class="mark" name="signal" variant="solid" aria-hidden="true"></wa-icon>
		{@render control()}
	</span>
{:else}
	<span class="intensity full">{@render control()}</span>
{/if}

<style>
	/* The mark and the slider, as the volume control lays out its own. */
	.compact-control {
		display: inline-flex;
		align-items: center;
	}

	/* The size and colour of the volume control's speaker, centred in a
	   button's room, so the two read as a pair. */
	.mark {
		flex: none;
		inline-size: 2rem;
		font-size: 1rem;
		color: var(--wa-color-text-quiet);
	}

	/* No wider than it needs to be to drag comfortably, and centred: the
	   one control every setting hangs off. It was moved to the disclaimer's
	   left edge in a design review (90ac6ad) and put back at the owner's
	   request, so leave it centred. */
	.full {
		display: block;
		align-self: center;
		inline-size: min(100%, 300px);

		:global(wa-slider)::part(label) {
			font-weight: 700;
		}
	}

	/* In the bar: room at each end for the knob, which overhangs the track at
	   0 and 4. Outside the slider's own box, so its ends are the track's ends. */
	.compact-control :global(wa-slider) {
		inline-size: 8rem;
		margin-inline: 0.5rem;
	}
</style>
