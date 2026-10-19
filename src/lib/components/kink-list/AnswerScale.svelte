<script lang="ts">
	import { LEVEL_LABELS, LEVELS, type Level } from '$lib/kink-list/answers';

	/**
	 * The seven-step scale one kink (or one context of it) is answered on, as a
	 * row of coloured dots read against the key (`LevelKey.svelte`), so a kink
	 * fits on one line.
	 *
	 * Native radios under the dots: the state is `checked`, which a `wa-button`
	 * would not expose (AGENTS.md, "wa-button forwards no ARIA state"), and the
	 * arrow keys move along the scale for free. Each radio is named by its
	 * level's word, and the dot has it as a tooltip, so colour is never the
	 * only cue: the position on a fixed no-to-yes scale and the key carry it
	 * too.
	 *
	 * An answer that is only inherited — a category's "Hard limit everything
	 * here" — is a dashed ring rather
	 * than a filled dot, so it never reads as chosen, and its tooltip says
	 * where it comes from. Choosing the chosen dot again clears it.
	 */
	let {
		label,
		value,
		inherited,
		inheritedFrom,
		onchange
	}: {
		/** The group's accessible name, e.g. "Spanking" or "Spanking, giving". */
		label: string;
		value: Level | undefined;
		/** What shows when there is no answer of its own. */
		inherited?: Level;
		/** Where the inherited answer comes from, for its tooltip: "from "Oral": …". */
		inheritedFrom?: string;
		onchange: (level: Level | undefined) => void;
	} = $props();

	const name = $props.id();

	function tooltip(level: Level): string {
		const shown = value === undefined && inherited === level;
		return shown && inheritedFrom ? `${LEVEL_LABELS[level]}, ${inheritedFrom}` : LEVEL_LABELS[level];
	}
</script>

<fieldset class="scale">
	<legend class="wa-visually-hidden">{label}</legend>
	{#each LEVELS as level (level)}
		<label
			class="option"
			style:--dot="var(--kink-level-{level})"
			class:inherited={value === undefined && inherited === level}
			title={tooltip(level)}
		>
			<input
				type="radio"
				{name}
				value={level}
				checked={value === level}
				onchange={() => onchange(level)}
				onclick={() => {
					// A radio sends no change when it is already checked, so this
					// is the one way to take an answer back from the dots.
					if (value === level) {
						onchange(undefined);
					}
				}}
			/>
			<span class="dot" aria-hidden="true"></span>
			<span class="wa-visually-hidden">{LEVEL_LABELS[level]}</span>
		</label>
	{/each}
</fieldset>

<style>
	.scale {
		display: flex;
		gap: 0.125rem;
		border: 0;
		margin: 0;
		padding: 0;
		min-inline-size: 0;
	}

	/* The label is the touch target, larger than the dot it draws. */
	.option {
		position: relative;
		display: grid;
		place-items: center;
		inline-size: 1.625rem;
		block-size: 1.625rem;
		cursor: pointer;

		input {
			position: absolute;
			inset: 0;
			margin: 0;
			opacity: 0;
			cursor: pointer;
		}
	}

	.dot {
		/* Never the click target: its hover scale makes it a layer of its own,
		   painted over the radio, which would then never be pressed. */
		pointer-events: none;
		inline-size: 1.125rem;
		block-size: 1.125rem;
		border: 0.15rem solid var(--dot);
		border-radius: 50%;
		background: color-mix(in oklab, var(--dot) 12%, transparent);
		transition: transform 80ms ease-out;
	}

	/* Inherited: an outline only, dashed, so it cannot be mistaken for a choice. */
	.inherited .dot {
		border-style: dashed;
		background: color-mix(in oklab, var(--dot) 30%, transparent);
	}

	/* Chosen: filled, with a check, so it differs from the rest by more than colour. */
	input:checked + .dot {
		display: grid;
		place-items: center;
		background: var(--dot);

		&::after {
			content: '';
			inline-size: 0.3rem;
			block-size: 0.55rem;
			margin-block-start: -0.1rem;
			border: solid var(--kink-level-ink);
			border-width: 0 0.13rem 0.13rem 0;
			transform: rotate(45deg);
		}
	}

	input:focus-visible + .dot {
		outline: var(--wa-focus-ring);
		outline-offset: var(--wa-focus-ring-offset);
	}

	.option:hover .dot {
		transform: scale(1.12);
	}

	@media (prefers-reduced-motion: reduce) {
		.dot {
			transition: none;
		}
	}
</style>
