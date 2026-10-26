<script lang="ts">
	import type { Snippet } from 'svelte';
	import { MAX_PROMPT_LEVEL, MIN_PROMPT_LEVEL } from '$lib/scenes/considerations';

	/**
	 * One type of prompt in the scene designer's column, with its own Fewer
	 * and More. Fewer at the lowest step hides the type's prompts, leaving its
	 * heading, so it can be brought back. The buttons say which type they are
	 * for to assistive tech ("More questions"), since every section has a
	 * pair. See docs/scenes.md, "The prompt column".
	 */
	let {
		label,
		level,
		onLevel,
		children
	}: {
		label: string;
		level: number;
		onLevel: (next: number) => void;
		children: Snippet;
	} = $props();

	const hidden = $derived(level <= MIN_PROMPT_LEVEL);
	const headingId = $props.id();
</script>

<section class="prompt-section" aria-labelledby={headingId}>
	<header>
		<h2 id={headingId}>{label}</h2>
		<div class="steps">
			<wa-button
				size="s"
				appearance="plain"
				disabled={level <= MIN_PROMPT_LEVEL}
				onclick={() => onLevel(level - 1)}
			>
				Fewer<span class="wa-visually-hidden">{` ${label.toLowerCase()}`}</span>
			</wa-button>
			<wa-button
				size="s"
				appearance="plain"
				disabled={level >= MAX_PROMPT_LEVEL}
				onclick={() => onLevel(level + 1)}
			>
				More<span class="wa-visually-hidden">{` ${label.toLowerCase()}`}</span>
			</wa-button>
		</div>
	</header>
	{#if hidden}
		<p class="quiet">Hidden. More brings them back.</p>
	{:else}
		{@render children()}
	{/if}
</section>

<style>
	.prompt-section {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--wa-space-xs);
	}

	h2 {
		margin: 0;
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.steps {
		display: flex;
		gap: var(--wa-space-3xs);
	}

	.quiet {
		margin: 0;
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
	}
</style>
