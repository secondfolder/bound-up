<script lang="ts">
	import SectionWidget from '$lib/components/SectionWidget.svelte';
	import type { PartnerMessagesWidgetView } from '$lib/types';

	/**
	 * Counts, never content.
	 *
	 * The server has no plaintext to preview here — bodies are encrypted to keys
	 * it does not hold — and decrypting one on this page would mean shipping the
	 * whole unlock flow to it. The board behind the link is where that lives.
	 */
	let { messages, href }: { messages: PartnerMessagesWidgetView; href: string } = $props();

	/**
	 * A thread count is worth a line; "Nothing here yet." is not.
	 *
	 * "All caught up" is not an empty state — it says history exists and you
	 * have read it, which an absent body does not say. Never having written to
	 * each other is what the absent body says on its own.
	 */
	const hasBody = $derived(messages.totalThreads > 0);
</script>

<SectionWidget title="Messages" {href} icon="envelope" body={hasBody ? preview : undefined} />

{#snippet preview()}
	{#if messages.unreadThreads > 0}
		<p class="unread">
			{messages.unreadThreads} unread thread{messages.unreadThreads === 1 ? '' : 's'}
		</p>
	{:else}
		<p class="summary">
			All caught up · {messages.totalThreads} thread{messages.totalThreads === 1 ? '' : 's'}
		</p>
	{/if}
{/snippet}

<style>
	p {
		margin: 0;
		font-size: 0.875rem;
	}

	.unread {
		color: var(--wa-color-brand-fill-loud, var(--wa-color-text-link));
		font-weight: var(--wa-font-weight-semibold, 600);
	}

	.summary {
		color: var(--wa-color-text-quiet);
	}
</style>
