<script lang="ts">
	import { LEVEL_LABELS, LEVELS, type Level } from '$lib/kink-list/answers';
	import InlineButton from '../InlineButton.svelte';

	/**
	 * The seven-step scale one kink (or one side of it) is answered on.
	 *
	 * Native radios styled as a row of pills: the state is `checked`, which a
	 * `wa-button` would not expose (AGENTS.md, "wa-button forwards no ARIA
	 * state"). An answer that is only inherited — a specific showing its kink's
	 * answer, or a category's "Hard limit everything here" — is outlined rather
	 * than filled, and named in the caption, so it never reads as chosen.
	 */
	let {
		label,
		value,
		inherited,
		onchange
	}: {
		/** The group's accessible name, e.g. "Spanking" or "Spanking, giving". */
		label: string;
		value: Level | undefined;
		/** What shows when there is no answer of its own, and where it comes from. */
		inherited?: { level: Level; from: string };
		onchange: (level: Level | undefined) => void;
	} = $props();

	const name = $props.id();
</script>

<fieldset class="scale">
	<legend class="wa-visually-hidden">{label}</legend>
	<div class="options">
		{#each LEVELS as level (level)}
			<label
				class="option level-{level}"
				class:inherited={value === undefined && inherited?.level === level}
			>
				<input
					type="radio"
					{name}
					value={level}
					checked={value === level}
					onchange={() => onchange(level)}
				/>
				<span>{LEVEL_LABELS[level]}</span>
			</label>
		{/each}
	</div>
	{#if value !== undefined}
		<span class="caption">
			<InlineButton onclick={() => onchange(undefined)}>
				Clear <span class="wa-visually-hidden">{label}</span>
			</InlineButton>
		</span>
	{:else if inherited}
		<span class="caption">{LEVEL_LABELS[inherited.level]}, {inherited.from}</span>
	{/if}
</fieldset>

<style>
	.scale {
		border: 0;
		margin: 0;
		padding: 0;
		min-inline-size: 0;
	}

	.options {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.option {
		position: relative;

		input {
			position: absolute;
			opacity: 0;
			inset: 0;
			margin: 0;
			cursor: pointer;
		}

		span {
			display: inline-block;
			padding: 0.3rem 0.65rem;
			border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
			border-radius: var(--wa-border-radius-pill);
			font-size: 0.875rem;
			line-height: 1.3;
			color: var(--wa-color-text-normal);
			background: var(--wa-color-surface-default);
			white-space: nowrap;
		}

		/* Inherited: the level's colour as an outline only, so it cannot be
		   mistaken for a choice made here. The caption names where it is from. */
		&.inherited span {
			border-style: dashed;
			border-color: var(--kink-level, var(--wa-color-brand-border-loud));
		}

		input:focus-visible + span {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}

		input:checked + span {
			font-weight: var(--wa-font-weight-bold);
			color: var(--kink-level-on, var(--wa-color-brand-on-loud));
			background: var(--kink-level, var(--wa-color-brand-fill-loud));
			border-color: var(--kink-level, var(--wa-color-brand-fill-loud));
		}
	}

	/* The ends of the scale get the danger and success palettes; the middle
	   stays the brand colour. Never colour alone: every option has its word. */
	.level-limit,
	.level-not-for-me {
		--kink-level: var(--wa-color-danger-fill-loud);
		--kink-level-on: var(--wa-color-danger-on-loud);
	}
	.level-like,
	.level-love {
		--kink-level: var(--wa-color-success-fill-loud);
		--kink-level-on: var(--wa-color-success-on-loud);
	}

	.caption {
		display: block;
		margin-block-start: 0.25rem;
		font-size: 0.8125rem;
		color: var(--wa-color-text-quiet);
	}
</style>
