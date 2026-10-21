<script lang="ts">
	import type { DialValue, IdeaDials, PassageLength, StoryDials } from '$lib/daydream';
	import { IDEA_SLIDERS, PASSAGE_LENGTHS, STORY_SLIDERS } from '$lib/daydream/dial-words';
	import OptionalSlider from './OptionalSlider.svelte';
	import Slider from './Slider.svelte';

	/**
	 * The story's sticky dials: intensity, pace and which way passages lean in length.
	 * Sent with every passage until they are changed, unlike a direction
	 * button, which nudges only the next one. In the setup form and in the
	 * story's own Dials popover.
	 *
	 * Controlled: `value` is the dials, and a change is asked for through
	 * `onchange`. The sliders are the app's (`Slider.svelte`).
	 */
	let {
		value,
		onchange,
		idea,
		onideachange
	}: {
		value: StoryDials;
		onchange: (dials: StoryDials) => void;
		/**
		 * The idea's heat and kink, shown above the rest when given: in the
		 * story's popover, so they can be turned up or down mid-story. The
		 * setup form leaves them out, as its idea dialog sets them.
		 */
		idea?: IdeaDials;
		onideachange?: (dials: IdeaDials) => void;
	} = $props();

	/**
	 * Where each slider is while it is being dragged, so its reading follows
	 * the thumb. Saved only on `change`, when it is let go: each save is a
	 * round trip that rewrites the setup.
	 */
	let dragging: Partial<Record<'intensity' | 'pace', DialValue>> = $state({});

	function setDial(key: 'intensity' | 'pace', level: DialValue) {
		delete dragging[key];
		if (level !== value[key]) {
			onchange({ ...value, [key]: level });
		}
	}

	function setLength(length: PassageLength) {
		if (length !== value.length) {
			onchange({ ...value, length });
		}
	}
</script>

<div class="dials">
	{#if idea && onideachange}
		{#each IDEA_SLIDERS as entry (entry.key)}
			<OptionalSlider
				label={entry.label}
				low={entry.low}
				high={entry.high}
				scale={entry.scale}
				value={idea[entry.key]}
				onchange={(level) => onideachange({ ...idea, [entry.key]: level })}
			/>
		{/each}
	{/if}

	{#each STORY_SLIDERS as entry (entry.key)}
		<!-- The level on the title row, as on the optional dials above
		     (OptionalSlider says why the title is drawn here). -->
		<div class="dial">
			<div class="heading">
				<span class="title" aria-hidden="true">{entry.label}</span>
				<span class="reading">{entry.scale[dragging[entry.key] ?? value[entry.key]].label}</span>
			</div>
			<Slider
				label={entry.label}
				labelHidden
				min={1}
				max={5}
				value={value[entry.key]}
				low={entry.low}
				high={entry.high}
				format={(level) => entry.scale[level as DialValue]?.label ?? String(level)}
				oninput={(level) => {
					dragging[entry.key] = level as DialValue;
				}}
				onchange={(level) => setDial(entry.key, level as DialValue)}
				ondrag={(down) => {
					if (!down) {
						delete dragging[entry.key];
					}
				}}
			/>
		</div>
	{/each}

	<fieldset class="length">
		<legend>Preferred passage length</legend>
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

		.heading {
			display: flex;
			align-items: baseline;
			gap: 0.5rem;
		}

		.title {
			flex: 1 1 auto;
			font-weight: var(--wa-form-control-label-font-weight);
			color: var(--wa-form-control-label-color);
		}

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
