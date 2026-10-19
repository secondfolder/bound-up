<script lang="ts" generics="Level extends number">
	import InlineButton from './InlineButton.svelte';

	/**
	 * A stepped slider that may be left unset: a daydream character's control
	 * or libido, a scene's heat or kink (1–5, words from
	 * `daydream/dial-words.ts`, which the prompt reads too), or a kink list's
	 * detailed answer (0–4). Unset means "not said", rather than "middling",
	 * so it shows a bare knob, no filled track, until it is moved, and Clear
	 * takes it back there.
	 *
	 * Controlled: `value` is the level, and a change is asked for through
	 * `onchange`. The slider is wired by hand rather than with `onchange=`: its
	 * events come from inside a shadow root, which Svelte's delegated handlers
	 * do not reliably see (AGENTS.md).
	 */
	let {
		label,
		low,
		high,
		scale,
		value,
		onchange,
		min = 1,
		max = 5
	}: {
		label: string;
		low: string;
		high: string;
		scale: Readonly<Record<Level, { label: string }>>;
		value: Level | null;
		onchange: (level: Level | null) => void;
		min?: number;
		max?: number;
	} = $props();

	/** Where an unset knob sits: the middle step. */
	const middle = $derived(Math.round((min + max) / 2));

	type WaSlider = HTMLElement & { value: number; valueFormatter?: (value: number) => string };

	/**
	 * Where the slider is while it is being dragged, so the level follows the
	 * thumb. Saved only on `change`, when it is let go: `input` fires at every
	 * step, and a save in a story is a round trip that rewrites the setup.
	 */
	let dragging: Level | null = $state(null);
	const shown = $derived(dragging ?? value);

	function wire(node: WaSlider) {
		// What a screen reader announces instead of a bare number.
		node.valueFormatter = (level) => scale[level as Level]?.label ?? String(level);
		const move = () => {
			dragging = Math.round(node.value) as Level;
		};
		const update = () => {
			dragging = null;
			onchange(Math.round(node.value) as Level);
		};
		// An unset dial's knob sits at a level already, so pressing it shows
		// that level and letting go sets it. The slider sends no `change` for
		// that — its value has not moved — so the release does it, a task
		// later, which is after any `change` that release did send (that one
		// clears `dragging`, and then there is nothing left to set). Released
		// anywhere: the pointer is held down, and may have wandered off it.
		const press = () => {
			dragging = Math.round(node.value) as Level;
			const release = () => {
				globalThis.removeEventListener('pointerup', release);
				globalThis.removeEventListener('pointercancel', release);
				setTimeout(() => {
					if (dragging !== null && value === null) {
						update();
					} else {
						dragging = null;
					}
				});
			};
			globalThis.addEventListener('pointerup', release);
			globalThis.addEventListener('pointercancel', release);
		};
		node.addEventListener('pointerdown', press);
		node.addEventListener('input', move);
		node.addEventListener('change', update);
		return () => {
			node.removeEventListener('pointerdown', press);
			node.removeEventListener('input', move);
			node.removeEventListener('change', update);
		};
	}
</script>

<!-- The title row is drawn here rather than by the slider, so the level and
     Clear can sit on it: the slider's own label is a <label>, which a button
     must not go in. The slider keeps its label for its accessible name, hidden
     from sight; this title is hidden from assistive tech instead. Clear's name
     ends in hidden text, so each is told apart ("Clear heat"). -->
<div class="dial" class:unset={shown === null}>
	<div class="heading">
		<span class="title" aria-hidden="true">{label}</span>
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
	<wa-slider {@attach wire} {label} {min} {max} step={1} value={value ?? middle}>
		<span slot="reference">{low}</span>
		<span slot="reference">{high}</span>
	</wa-slider>
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
			font-size: 0.8125rem;
			color: var(--wa-color-text-quiet);
		}

		/* Out of sight but still the slider's name: see the heading above. */
		wa-slider::part(label) {
			position: absolute;
			inline-size: 1px;
			block-size: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}

		/* An unset dial is the bare knob in the middle, with no filled track
		   to say it is at a level. Greyed out, as it was, it looked disabled.
		   The fill comes back once it is grabbed: `dragging` for a press that
		   has not moved yet, and `unset` goes as soon as it does. */
		&.unset wa-slider:not(:state(dragging))::part(indicator) {
			visibility: hidden;
		}
	}
</style>
