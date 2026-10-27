<script lang="ts">
	import SectionWidget from '$lib/components/SectionWidget.svelte';
	import type { AppContext } from '$lib/context';
	import { followInContext } from '$lib/context-client.svelte';
	import type { PartnerMessagesWidgetView } from '$lib/types';

	/**
	 * Counts, never content.
	 *
	 * The server has no plaintext to preview here — bodies are encrypted to keys
	 * it does not hold — and decrypting one on this page would mean shipping the
	 * whole unlock flow to it. The board behind the link is where that lives.
	 */
	let {
		messages,
		href,
		opensIn
	}: {
		messages: PartnerMessagesWidgetView;
		href: string;
		/**
		 * The partnership's context: `/messages` follows the context, so the
		 * card switches to it first, as the tasks card does (`followInContext`).
		 */
		opensIn: AppContext;
	} = $props();

	async function follow(event: MouseEvent) {
		await followInContext(event, opensIn, href);
	}

	/**
	 * A thread count is worth a line; "Nothing here yet." is not.
	 *
	 * "All caught up" is not an empty state — it says history exists and you
	 * have read it, which an absent body does not say. Never having written to
	 * each other is what the absent body says on its own.
	 */
	const hasBody = $derived(messages.totalThreads > 0);
</script>

<SectionWidget
	title="Messages"
	{href}
	icon="envelope"
	onfollow={follow}
	body={hasBody ? preview : undefined}
/>

{#snippet preview()}
	{#if messages.unreadThreads > 0}
		<p class="unread">
			<!-- The same dot an unread sticker wears on the board, so the two read
			     as one signal. Decorative: the words say it. -->
			<span class="dot" aria-hidden="true"></span>
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
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--wa-color-brand-fill-loud, var(--wa-color-text-link));
		font-weight: var(--wa-font-weight-semibold, 600);
	}

	.dot {
		flex: none;
		inline-size: 0.5rem;
		block-size: 0.5rem;
		border-radius: 50%;
		background: currentColor;
	}

	/* It pops in as the line appears: on the page opening with something
	   unread, or on any reload of the page's data that swaps "All caught up"
	   for it. */
	@media (prefers-reduced-motion: no-preference) {
		.dot {
			animation: dot-in 320ms cubic-bezier(0.34, 1.56, 0.64, 1);
		}
	}

	@keyframes dot-in {
		from {
			transform: scale(0);
		}

		60% {
			transform: scale(1.4);
		}
	}

	.summary {
		color: var(--wa-color-text-quiet);
	}
</style>
