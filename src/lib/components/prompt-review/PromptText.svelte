<script lang="ts">
	import { placeholderSpans } from '$lib/prompt-review';

	/** A prompt's text with the `⟦placeholders⟧` for what a user would write set apart. */
	let { text }: { text: string } = $props();
</script>

{#each placeholderSpans(text) as span, index (index)}{#if span.placeholder}<mark>{span.text}</mark>{:else}{span.text}{/if}{/each}

<style>
	mark {
		background: none;
		color: var(--wa-color-brand-on-quiet);
		font-style: italic;
	}
</style>
