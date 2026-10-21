<script lang="ts">
	import { LEVEL_LABELS, LEVELS, type Level } from '$lib/kink-list/answers';
	import './level-glyphs.css';

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
	 * too, and a chosen or inherited dot wears its level's mark
	 * (`level-glyphs.css`), which says which answer it is where a check only said
	 * that there was one.
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

	/** The level just chosen here, for its pop; cleared once that has played. */
	let popped: Level | null = $state(null);

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
			data-kink-level={level}
			class:inherited={value === undefined && inherited === level}
			class:popped={popped === level}
			onanimationend={(event) => {
				// The dot's own animation, not its mark's, which ends first.
				if (!event.pseudoElement) {
					popped = null;
				}
			}}
			title={tooltip(level)}
		>
			<input
				type="radio"
				{name}
				value={level}
				checked={value === level}
				onchange={() => {
					popped = level;
					onchange(level);
				}}
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

	/* The label is the touch target, larger than the dot it draws. Never
	   narrower: squeezed by a nested row on a phone, the targets shrank from
	   28px apart to 25, and the row's label gives way instead (KinkRow). */
	.option {
		flex: none;
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
		display: grid;
		place-items: center;
		inline-size: 1.125rem;
		block-size: 1.125rem;
		border: 0.15rem solid var(--dot);
		border-radius: 50%;
		background: color-mix(in oklab, var(--dot) 12%, transparent);
		transition: transform 80ms ease-out;

		/* The level's mark, in the middle of the dot. Shown only on a chosen
		   or inherited dot: on all seven of every row it was noise, and the
		   key says which is which. */
		&::after {
			content: '';
			inline-size: 0.625rem;
			block-size: 0.625rem;
			background: var(--kink-level-ink);
			mask: var(--kink-glyph) center / contain no-repeat;
			opacity: 0;
		}
	}

	/* Inherited: an outline only, dashed, so it cannot be mistaken for a
	   choice, with its mark in its own colour. */
	.inherited .dot {
		border-style: dashed;
		background: color-mix(in oklab, var(--dot) 30%, transparent);

		&::after {
			background: var(--dot);
			opacity: 1;
		}
	}

	/* Chosen: filled, with its mark, so it differs from the rest by more than
	   colour, and says which answer it is. */
	input:checked + .dot {
		background: var(--dot);

		&::after {
			opacity: 1;
		}
	}

	/* A small pop as a dot is chosen, so the tap visibly lands: only on the
	   one just chosen (`popped`), never on answers already there as the list
	   opens, which `:checked` alone would replay on every row. */
	@media (prefers-reduced-motion: no-preference) {
		.popped input:checked + .dot {
			animation: chosen 220ms cubic-bezier(0.34, 1.56, 0.64, 1);

			&::after {
				animation: mark-in 180ms ease-out;
			}
		}
	}

	@keyframes chosen {
		from {
			transform: scale(0.7);
		}
	}

	@keyframes mark-in {
		from {
			transform: scale(0.4);
			opacity: 0;
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
