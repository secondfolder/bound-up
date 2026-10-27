<script lang="ts">
	import type { ContextSpaceView, ThreadStickerView } from '$lib/types';
	import ThreadSticker from './ThreadSticker.svelte';

	/**
	 * The board: unread threads first, then a divider, then the read ones.
	 *
	 * Two separate lists rather than one grid with a full-width row in the
	 * middle. Both declare the same columns, so at a given width `auto-fill`
	 * resolves to the same count and the two blocks stay aligned — and "unread
	 * first" becomes plain document order, which is what a screen reader and a
	 * test locator both want.
	 *
	 * The threads arrive already sorted; the server owns that order (see
	 * `listBoard`). This component only decides where the seam goes.
	 */
	let {
		threads,
		spaceOf = null,
		empty = 'Nothing here yet. Write something only the two of you can read.',
		highlightThreadId = null,
		onHighlightEnd
	}: {
		threads: ThreadStickerView[];
		/**
		 * Whose each thread is, on a board that mixes several partnerships
		 * (Everyone): each sticker then wears that partner's chip. Null on one
		 * partnership's board.
		 */
		spaceOf?: ((spaceId: string) => ContextSpaceView | null) | null;
		/** What an empty board says. */
		empty?: string;
		/** A thread to draw attention to once. See `ThreadSticker`'s `highlighted`. */
		highlightThreadId?: string | null;
		onHighlightEnd?: (() => void) | undefined;
	} = $props();

	const unread = $derived(threads.filter((thread) => thread.unread));
	const read = $derived(threads.filter((thread) => !thread.unread));
</script>

{#if threads.length === 0}
	<p class="empty">{empty}</p>
{:else}
	{#if unread.length > 0}
		<ul aria-label="Unread">
			{#each unread as thread, index (thread.id)}
				<ThreadSticker
					{thread}
					space={spaceOf?.(thread.spaceId) ?? null}
					position={index + 1}
					total={unread.length}
					highlighted={thread.id === highlightThreadId}
					{onHighlightEnd}
				/>
			{/each}
		</ul>
	{/if}

	{#if unread.length > 0 && read.length > 0}
		<div class="seam">
			<wa-divider></wa-divider>
			<span>Already read</span>
			<wa-divider></wa-divider>
		</div>
	{/if}

	{#if read.length > 0}
		<ul aria-label="Already read">
			{#each read as thread, index (thread.id)}
				<ThreadSticker
					{thread}
					space={spaceOf?.(thread.spaceId) ?? null}
					position={index + 1}
					total={read.length}
					highlighted={thread.id === highlightThreadId}
					{onHighlightEnd}
				/>
			{/each}
		</ul>
	{/if}
{/if}

<style>
	ul {
		list-style: none;
		margin: 0;
		/* The page gutter, so the stickers line up with the header above them. */
		padding: var(--wa-space-m) var(--page-gutter);
		display: grid;
		/*
		 * auto-fill, not auto-fit: with a single thread, auto-fit would stretch
		 * that one sticker across the whole board. A phone settles at two
		 * columns.
		 */
		grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
		gap: var(--wa-space-s);
	}

	.seam {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: var(--wa-space-s);
		padding-inline: var(--page-gutter);

		span {
			font-size: 0.75rem;
			color: var(--wa-color-text-quiet);
		}
	}

	.empty {
		margin: 0;
		padding: var(--wa-space-xl) var(--wa-space-l);
		text-align: center;
		color: var(--wa-color-text-quiet);
	}
</style>
