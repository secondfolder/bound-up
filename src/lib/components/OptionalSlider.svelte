<script lang="ts" generics="Level extends number">
	import InlineButton from './InlineButton.svelte';
	import Slider from './Slider.svelte';

	/**
	 * A stepped slider that may be left unset: a daydream character's control
	 * or libido, an idea's heat or kink (1–5, words from
	 * `daydream/dial-words.ts`, which the prompt reads too), or a kink list's
	 * detailed answer (0–4). Unset means "not said", rather than "middling".
	 *
	 * The slider is the app's (`Slider.svelte`), which draws an unset value as
	 * the bare knob and sets it when pressed. What is this one's own is the
	 * title row: the level in words beside the title, following the knob as it
	 * is dragged, and Clear, which takes it back to unset. Saved only when let
	 * go, since a save in a story is a round trip that rewrites the setup.
	 */
	let {
		label,
		low,
		high,
		scale,
		value,
		onchange,
		min = 1,
		max = 5,
		titleHidden = false
	}: {
		label: string;
		low: string;
		high: string;
		scale: Readonly<Record<Level, { label: string }>>;
		value: Level | null;
		onchange: (level: Level | null) => void;
		min?: number;
		max?: number;
		/**
		 * For a slider titled by its surroundings, as a kink's Experience is by
		 * the row it sits in: the level and Clear stay, the title goes.
		 */
		titleHidden?: boolean;
	} = $props();

	/** Where the knob is while it is being dragged, so the level follows it. */
	let dragging: Level | null = $state(null);
	const shown = $derived(dragging ?? value);
</script>

<!-- The title row is drawn here rather than by the slider, so the level and
     Clear can sit on it: the slider's own label is a <label>, which a button
     must not go in. The slider keeps its label for its accessible name, hidden
     from sight; this title is hidden from assistive tech instead. Clear's name
     ends in hidden text, so each is told apart ("Clear heat"). -->
<div class="dial">
	<div class="heading">
		{#if !titleHidden}
			<span class="title" aria-hidden="true">{label}</span>
		{/if}
		<!-- Clear inherits its size and colour from the level beside it. -->
		<span class="level">
			{shown === null ? 'Not set' : scale[shown].label}
			{#if shown !== null}
				<InlineButton onclick={() => onchange(null)}>
					Clear <span class="wa-visually-hidden">{label.toLowerCase()}</span>
				</InlineButton>
			{/if}
		</span>
	</div>
	<Slider
		{label}
		labelHidden
		{min}
		{max}
		{value}
		{low}
		{high}
		format={(level) => scale[level as Level]?.label ?? String(level)}
		oninput={(level) => {
			dragging = level as Level;
		}}
		onchange={(level) => {
			dragging = null;
			onchange(level as Level);
		}}
		ondrag={(down) => {
			if (!down) {
				dragging = null;
			}
		}}
	/>
</div>

<style>
	.dial {
		.heading {
			display: flex;
			align-items: baseline;
			gap: 0.5rem;
			margin-block-end: 0.25rem;
		}

		.title {
			flex: 1 1 auto;
			font-weight: var(--wa-form-control-label-font-weight);
			color: var(--wa-form-control-label-color);
		}

		.level {
			margin-inline-start: auto;
			font-size: 0.8125rem;
			color: var(--wa-color-text-quiet);
		}
	}
</style>
