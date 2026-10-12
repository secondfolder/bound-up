<script lang="ts">
	import {
		type SoundChannel,
		setSoundVolume,
		soundMuted,
		soundVolume,
		toggleMuted
	} from '$lib/playroom/iq-test/sound.svelte';

	/**
	 * The page's one volume, for the clips it plays itself: a mute toggle and a
	 * slider. Every load starts muted, with the slider at zero to match;
	 * unmuting goes back to the last level set on this device.
	 *
	 * A clip that has fallen back to Redgifs' own player is beyond its reach:
	 * that player's own sound button is the only control there.
	 */
	let {
		channel = 'clips',
		label = 'Sound'
	}: {
		/** Which sound this controls: the clips or the hypno, each with its own volume. */
		channel?: SoundChannel;
		/** The slider's name, and the toggle's: "Mute <label>". */
		label?: string;
	} = $props();

	const muted = $derived(soundMuted(channel));
	/** What the slider shows: what is heard, so muted reads as zero. */
	const percent = $derived(Math.round(soundVolume(channel) * 100));
	const icon = $derived.by(() => {
		if (muted || percent === 0) {
			return 'volume-xmark';
		}
		return percent < 50 ? 'volume-low' : 'volume-high';
	});

	type WaSlider = HTMLElement & { value: number; valueFormatter?: (value: number) => string };

	/**
	 * By hand, not `oninput=`: the slider's events come from its shadow root,
	 * which Svelte's delegated handlers do not reliably see (see AGENTS.md).
	 * The drag is a user gesture, which is what lets turning it up start the
	 * sound at all.
	 */
	function volumeSlider(node: WaSlider) {
		node.valueFormatter = (value) => (value === 0 ? 'Muted' : `${value}%`);
		const update = () => setSoundVolume(channel, Number(node.value) / 100);
		node.addEventListener('input', update);
		node.addEventListener('change', update);
		return () => {
			node.removeEventListener('input', update);
			node.removeEventListener('change', update);
		};
	}
</script>

<div class="sound-control">
	<!--
		A native button, not a wa-button: it is a toggle, and its state is
		`aria-pressed`, which wa-button does not forward to the button inside it.
		Named "Mute <label>", so pressed reads as "muted".
	-->
	<button
		type="button"
		class="mute"
		aria-label="Mute {label.toLowerCase()}"
		aria-pressed={muted}
		onclick={() => toggleMuted(channel)}
	>
		<!-- Named by the button, which is native, so its aria-label applies. -->
		<wa-icon name={icon} variant="solid"></wa-icon>
	</button>
	<wa-slider
		{@attach volumeSlider}
		{label}
		min={0}
		max={100}
		step={1}
		value={percent}
		size="s"
	></wa-slider>
</div>

<style>
	.sound-control {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		inline-size: min(100%, 16rem);
		margin-inline: auto;

		.mute {
			flex: none;
			display: grid;
			place-items: center;
			inline-size: 2rem;
			block-size: 2rem;
			padding: 0;
			border: none;
			border-radius: 50%;
			background: none;
			color: var(--wa-color-text-quiet);
			font-size: 1rem;
			cursor: pointer;

			/* Pointer-only: on a touchscreen :hover sticks after the tap. */
			@media (hover: hover) {
				&:hover {
					color: var(--wa-color-text-normal);
				}
			}

			&:focus-visible {
				outline: var(--wa-focus-ring);
				outline-offset: var(--wa-focus-ring-offset);
			}

			&[aria-pressed='true'] {
				color: var(--wa-color-brand-on-quiet);
			}
		}

		wa-slider {
			flex: 1;

			/* Web Awesome leaves room above the track for the label, unseen
			   here, which put the track below the middle of the row. */
			&::part(slider) {
				margin-block-start: 0;
			}

			/* Named for screen readers; the icon says it to everyone else. */
			&::part(label) {
				position: absolute;
				inline-size: 1px;
				block-size: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}
		}
	}
</style>
