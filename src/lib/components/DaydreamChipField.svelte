<script lang="ts">
	import { hasChip, mergeChips, toggleChip } from '$lib/daydream/chips';
	import type { SuggestFailure } from '$lib/daydream/suggest';
	import SuggestionProblem from './SuggestionProblem.svelte';

	/**
	 * A free-text field with suggestions under it. The text is the truth: a
	 * chip only adds its phrase to the text or takes it out again, leaving
	 * whatever else was written exactly as it was (`toggleChip`), and the
	 * text can always be rewritten by hand. "More ideas" asks the model for
	 * chips beyond the built-in ones, when suggestions are on.
	 */
	let {
		label,
		hint,
		value,
		limit,
		chips,
		rows = 2,
		onchange,
		onMoreIdeas,
		debug = false
	}: {
		label: string;
		hint: string;
		value: string;
		limit: number;
		chips: readonly string[];
		rows?: number;
		onchange: (text: string) => void;
		/** Asks for more chips, answering them or why there are none; absent when suggestions are off. */
		onMoreIdeas?:
			| (() => Promise<{ ok: true; value: string[] } | ({ ok: false } & SuggestFailure)>)
			| undefined;
		/** Debug mode: a failure shows what came back. */
		debug?: boolean;
	} = $props();

	let extra: string[] = $state([]);
	let asking = $state(false);
	let problem: SuggestFailure | null = $state(null);

	const shown = $derived(mergeChips(chips, extra));
	const id = $props.id();

	async function moreIdeas() {
		if (!onMoreIdeas) {
			return;
		}
		asking = true;
		problem = null;
		const answer = await onMoreIdeas();
		asking = false;
		if (answer.ok) {
			extra = mergeChips(extra, answer.value);
		} else {
			problem = answer;
		}
	}
</script>

<div class="chip-field">
	<label for={`${id}-text`}>
		<span class="label">{label}</span>
		<span class="hint">{hint}</span>
	</label>
	<textarea
		id={`${id}-text`}
		{rows}
		maxlength={limit}
		{value}
		oninput={(event) => onchange(event.currentTarget.value)}
	></textarea>
	{#if shown.length > 0 || onMoreIdeas}
		<div class="chips">
			{#each shown as chip (chip)}
				<!-- A toggle: a native button, because wa-button forwards no
				     aria-pressed to the button inside it (AGENTS.md). -->
				<button
					type="button"
					class="chip"
					aria-pressed={hasChip(value, chip)}
					onclick={() => onchange(toggleChip(value, chip).slice(0, limit))}
				>
					{chip}
				</button>
			{/each}
			{#if onMoreIdeas}
				<wa-button size="s" appearance="plain" disabled={asking} onclick={moreIdeas}>
					<wa-icon slot="start" name="wand-magic-sparkles" variant="solid"></wa-icon>
					{asking ? 'Thinking…' : 'More ideas'}
				</wa-button>
			{/if}
		</div>
	{/if}
	{#if problem}<SuggestionProblem {problem} {debug} />{/if}
</div>

<style>
	.chip-field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;

		label {
			display: flex;
			flex-direction: column;
			gap: 0.125rem;
		}

		.hint {
			font-size: 0.8125rem;
			color: var(--wa-color-text-quiet);
		}
	}

	textarea {
		inline-size: 100%;
		box-sizing: border-box;
		padding: 0.6rem 0.75rem;
		border-radius: 0.6rem;
		border: 1px solid var(--wa-color-surface-border);
		background: var(--wa-color-surface-lowered, transparent);
		color: inherit;
		font: inherit;
		resize: vertical;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.375rem;

		wa-button {
			--wa-form-control-height: 1.75rem;
		}
	}

	.chip {
		padding: 0.2rem 0.65rem;
		border: 1px solid var(--wa-color-surface-border);
		border-radius: 999px;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: 0.8125rem;
		cursor: pointer;

		&[aria-pressed='true'] {
			background: var(--wa-color-brand-fill-quiet);
			border-color: var(--wa-color-brand-border-quiet, var(--wa-color-surface-border));
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}
	}
</style>
