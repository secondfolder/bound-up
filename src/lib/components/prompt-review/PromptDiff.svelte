<script lang="ts">
	import RadioButton from '$lib/components/segmented/RadioButton.svelte';
	import RadioButtonGroup from '$lib/components/segmented/RadioButtonGroup.svelte';
	import { type DiffLine, diffTexts, sideBySide } from '$lib/prompt-review';

	/**
	 * Two prompts compared (docs/prompt-review.md, "The debug page"): line by
	 * line, with the changed words marked inside each changed line, unchanged
	 * stretches folded away, one column or two, and spaces at the ends of lines counted or not (jsdiff's
	 * `ignoreWhitespace` compares lines trimmed, nothing more).
	 */
	let {
		before,
		after,
		beforeLabel,
		afterLabel
	}: { before: string; after: string; beforeLabel: string; afterLabel: string } = $props();

	let layout = $state<'unified' | 'split'>('unified');
	let ignoreWhitespace = $state(false);

	const diff = $derived(diffTexts(before, after, { ignoreWhitespace }));
	const rows = $derived(sideBySide(diff.lines));

	function listenForWhitespace(element: HTMLElement) {
		const listener = () => {
			ignoreWhitespace = Boolean((element as HTMLElement & { checked: boolean }).checked);
		};
		element.addEventListener('change', listener);
		return () => element.removeEventListener('change', listener);
	}

	function sign(line: DiffLine): string {
		switch (line.kind) {
			case 'added':
				return '+';
			case 'removed':
				return '−';
			default:
				return ' ';
		}
	}

	/** The line's number on its own side: the new text's for an addition, the old one's otherwise. */
	function number(line: DiffLine): number | '' {
		switch (line.kind) {
			case 'added':
				return line.after;
			case 'skipped':
				return '';
			default:
				return line.before;
		}
	}
</script>

<div class="controls">
	<p class="labels">
		<span class="before">− {beforeLabel}</span>
		<span class="after">+ {afterLabel}</span>
		<span class="count">{diff.removed} lines out, {diff.added} in</span>
	</p>
	<RadioButtonGroup label="Layout" size="s" bind:value={layout}>
		<RadioButton value="unified">One column</RadioButton>
		<RadioButton value="split">Side by side</RadioButton>
	</RadioButtonGroup>
	<wa-switch size="s" {@attach listenForWhitespace}>Ignore spaces at line ends</wa-switch>
</div>

{#snippet content(line: DiffLine)}
	{#if line.kind === 'same'}{line.text}{:else if line.kind === 'skipped'}⋯ {line.count} unchanged lines ⋯{:else}{#each line.spans as span, index (index)}{#if span.changed}<mark>{span.text}</mark>{:else}{span.text}{/if}{/each}{/if}
{/snippet}

{#if diff.added === 0 && diff.removed === 0}
	<p class="same">No difference.</p>
{:else if layout === 'unified'}
	<div class="diff unified">
		{#each diff.lines as line, index (index)}
			<div class="row {line.kind}">
				<span class="number">{number(line)}</span>
				<span class="sign">{sign(line)}</span>
				<pre>{@render content(line)}</pre>
			</div>
		{/each}
	</div>
{:else}
	<div class="diff split">
		{#each rows as row, index (index)}
			<div class="row">
				{#each [row.before, row.after] as line, side (side)}
					{#if line}
						<pre class={line.kind}>{@render content(line)}</pre>
					{:else}
						<pre class="empty"></pre>
					{/if}
				{/each}
			</div>
		{/each}
	</div>
{/if}

<style>
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.5rem 1rem;
		margin-block-end: 0.75rem;
	}

	.labels {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		flex: 1 1 16rem;
		margin: 0;
		font-size: var(--wa-font-size-s);
		overflow-wrap: anywhere;
	}

	.before {
		color: var(--wa-color-danger-on-quiet);
	}

	.after {
		color: var(--wa-color-success-on-quiet);
	}

	.count,
	.same {
		color: var(--wa-color-text-quiet);
	}

	.diff {
		border: 1px solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-m);
		overflow-x: auto;
		font-family: var(--wa-font-family-code, monospace);
		font-size: 0.8125rem;
	}

	pre {
		margin: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font: inherit;
		min-width: 0;
	}

	mark {
		color: inherit;
		background: color-mix(in srgb, currentColor 25%, transparent);
		border-radius: 2px;
	}

	/* A whole row in one column, a single cell side by side: either way the class is the line's kind. */
	.removed {
		background: var(--wa-color-danger-fill-quiet);
		color: var(--wa-color-danger-on-quiet);
	}

	.added {
		background: var(--wa-color-success-fill-quiet);
		color: var(--wa-color-success-on-quiet);
	}

	.skipped {
		color: var(--wa-color-text-quiet);
		font-style: italic;
	}

	.unified .row {
		display: grid;
		grid-template-columns: 3rem 1rem 1fr;
		gap: 0.25rem;
	}

	.split .row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.number,
	.sign {
		color: var(--wa-color-text-quiet);
		text-align: end;
		user-select: none;
	}
</style>
