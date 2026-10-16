<script lang="ts">
	import type { DialValue, PassageLength, StoryDials } from '$lib/daydream';
	import { PASSAGE_LENGTHS, STORY_SLIDERS } from '$lib/daydream/dial-words';

	/**
	 * The story's sticky dials: intensity, pace and how long each passage is.
	 * Sent with every passage until they are changed, unlike a direction
	 * button, which nudges only the next one. In the setup form and in the
	 * story's own Dials popover.
	 *
	 * Controlled: `value` is the dials, and a change is asked for through
	 * `onchange`. The sliders are wired by hand rather than with `oninput=`:
	 * their events come from inside a shadow root, which Svelte's delegated
	 * handlers do not reliably see (AGENTS.md).
	 */
	let {
		value,
		onchange
	}: {
		value: StoryDials;
		onchange: (dials: StoryDials) => void;
	} = $props();

	type WaSlider = HTMLElement & { value: number; valueFormatter?: (value: number) => string };

	function slider(key: 'intensity' | 'pace') {
		const scale = STORY_SLIDERS.find((entry) => entry.key === key)?.scale;
		return (node: WaSlider) => {
			// What a screen reader announces instead of a bare number.
			node.valueFormatter = (level) => scale?.[level as DialValue]?.label ?? String(level);
			const update = () => {
				const level = Math.round(node.value) as DialValue;
				if (level !== value[key]) {
					onchange({ ...value, [key]: level });
				}
			};
			node.addEventListener('change', update);
			return () => node.removeEventListener('change', update);
		};
	}

	function setLength(length: PassageLength) {
		if (length !== value.length) {
			onchange({ ...value, length });
		}
	}
</script>

<div class="dials">
	{#each STORY_SLIDERS as entry (entry.key)}
		<div class="dial">
			<wa-slider
				{@attach slider(entry.key)}
				label={entry.label}
				min={1}
				max={5}
				step={1}
				value={value[entry.key]}
			>
				<span slot="reference">{entry.low}</span>
				<span slot="reference">{entry.high}</span>
			</wa-slider>
			<span class="reading">{entry.scale[value[entry.key]].label}</span>
		</div>
	{/each}

	<fieldset class="length">
		<legend>Passage length</legend>
		<div class="choices">
			{#each PASSAGE_LENGTHS as choice (choice.value)}
				<!-- A choice in a group: a native radio, because the state it carries
				     is `checked`, which a wa-button would not expose. -->
				<label class="choice">
					<input
						type="radio"
						name="passage-length"
						value={choice.value}
						checked={value.length === choice.value}
						onchange={() => setLength(choice.value)}
					/>
					<span>{choice.label}</span>
				</label>
			{/each}
		</div>
	</fieldset>
</div>

<style>
	.dials {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.dial {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;

		.reading {
			font-size: 0.8125rem;
			color: var(--wa-color-text-quiet);
		}
	}

	.length {
		border: 0;
		margin: 0;
		padding: 0;

		legend {
			padding: 0;
			margin-block-end: 0.35rem;
		}

		.choices {
			display: flex;
			flex-wrap: wrap;
			gap: 0.5rem 1.25rem;
		}

		.choice {
			display: flex;
			align-items: center;
			gap: 0.4rem;
		}
	}
</style>
