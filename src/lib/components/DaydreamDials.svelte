<script lang="ts">
	import type { DialValue, PassageLength, SceneDials, StoryDials } from '$lib/daydream';
	import { PASSAGE_LENGTHS, SCENE_SLIDERS, STORY_SLIDERS } from '$lib/daydream/dial-words';
	import OptionalSlider from './OptionalSlider.svelte';

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
		onchange,
		scene,
		onscenechange
	}: {
		value: StoryDials;
		onchange: (dials: StoryDials) => void;
		/**
		 * The scene's heat and kink, shown above the rest when given: in the
		 * story's popover, so they can be turned up or down mid-story. The
		 * setup form leaves them out, as its scene dialog sets them.
		 */
		scene?: SceneDials;
		onscenechange?: (dials: SceneDials) => void;
	} = $props();

	type WaSlider = HTMLElement & { value: number; valueFormatter?: (value: number) => string };

	/**
	 * Where each slider is while it is being dragged, so its reading follows
	 * the thumb. Saved only on `change`, when it is let go: `input` fires at
	 * every step, and each save is a round trip that rewrites the setup.
	 */
	let dragging: Partial<Record<'intensity' | 'pace', DialValue>> = $state({});

	function slider(key: 'intensity' | 'pace') {
		const scale = STORY_SLIDERS.find((entry) => entry.key === key)?.scale;
		return (node: WaSlider) => {
			// What a screen reader announces instead of a bare number.
			node.valueFormatter = (level) => scale?.[level as DialValue]?.label ?? String(level);
			const move = () => {
				dragging[key] = Math.round(node.value) as DialValue;
			};
			const update = () => {
				const level = Math.round(node.value) as DialValue;
				delete dragging[key];
				if (level !== value[key]) {
					onchange({ ...value, [key]: level });
				}
			};
			node.addEventListener('input', move);
			node.addEventListener('change', update);
			return () => {
				node.removeEventListener('input', move);
				node.removeEventListener('change', update);
			};
		};
	}

	function setLength(length: PassageLength) {
		if (length !== value.length) {
			onchange({ ...value, length });
		}
	}
</script>

<div class="dials">
	{#if scene && onscenechange}
		{#each SCENE_SLIDERS as entry (entry.key)}
			<OptionalSlider
				label={entry.label}
				low={entry.low}
				high={entry.high}
				scale={entry.scale}
				value={scene[entry.key]}
				onchange={(level) => onscenechange({ ...scene, [entry.key]: level })}
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

		/* Out of sight but still the slider's name: the heading shows it. */
		wa-slider::part(label) {
			position: absolute;
			inline-size: 1px;
			block-size: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
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
