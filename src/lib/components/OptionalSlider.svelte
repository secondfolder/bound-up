<script lang="ts" generics="Level extends number">
	import Slider from './Slider.svelte';

	/**
	 * A stepped slider that may be left unset: a daydream character's control
	 * or libido, an idea's heat or kink (1–5, words from
	 * `daydream/dial-words.ts`, which the prompt reads too), or a kink list's
	 * detailed answer (0–4). Unset means "not said", rather than "middling".
	 *
	 * The slider is the app's (`Slider.svelte`), which draws an unset value as
	 * the bare knob, sets it when pressed, and has the Clear that takes it back
	 * to unset. What is this one's own is the level in words beside Clear,
	 * following the knob as it is dragged. Saved only when let go, since a
	 * save in a story is a round trip that rewrites the setup.
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

<Slider
	{label}
	labelHidden={titleHidden}
	{min}
	{max}
	{value}
	{low}
	{high}
	status={shown === null ? 'Not set' : scale[shown].label}
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
	onclear={() => onchange(null)}
/>
