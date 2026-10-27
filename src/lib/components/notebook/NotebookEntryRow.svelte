<script lang="ts">
	import SpaceChip from '$lib/components/context/SpaceChip.svelte';
	import { openedNotebookHeader } from '$lib/sealed-views.svelte';
	import type { ContextSpaceView, NotebookEntryView } from '$lib/types';

	/**
	 * One entry in a notebook list: its title and excerpt, opened on this
	 * device, or for an entry hidden from the viewer that they may show again,
	 * the button that does.
	 */
	let {
		entry,
		href,
		dayLabel,
		edited,
		note,
		showHiddenAction,
		chip
	}: {
		entry: NotebookEntryView;
		href: string;
		dayLabel: string;
		edited: string;
		note: string | null;
		showHiddenAction: string | null;
		/** Whose space it is in, on a list of several; absent on a list of one. */
		chip?: ContextSpaceView | undefined;
	} = $props();

	const opened = $derived(openedNotebookHeader(entry.header));
</script>

<li class="entry">
	{#if entry.header === null}
		<!-- Hidden from the viewer, who may now show it again: control moved to them. -->
		<div class="hidden-entry">
			<span>An entry hidden from you {#if chip}<SpaceChip space={chip} />{/if}</span>
			{#if showHiddenAction}
				<form method="POST" action={showHiddenAction}>
					<input type="hidden" name="entryId" value={entry.id} />
					<!-- The write names its space; it is never read from the context. -->
					<input type="hidden" name="spaceId" value={entry.spaceId} />
					<wa-button type="submit" size="s" appearance="outlined">Show it again</wa-button>
				</form>
			{/if}
		</div>
	{:else}
		<a class="entry-link" {href}>
			<span class="entry-title">
				{#if opened === undefined}
					…
				{:else if opened === null}
					Can’t be shown on this device
				{:else if opened.title}
					{opened.title}
				{:else}
					Untitled {entry.kind === 'journal' ? `entry, ${dayLabel}` : entry.kind}
				{/if}
			</span>
			{#if opened?.excerpt}<span class="excerpt">{opened.excerpt}</span>{/if}
			<span class="meta">
				{#if chip}<SpaceChip space={chip} />{/if}
				{#if entry.kind === 'journal'}<span>{dayLabel}</span>{/if}
				<span>{edited}</span>
				{#if note}<wa-badge appearance="outlined" variant="neutral">{note}</wa-badge>{/if}
			</span>
		</a>
	{/if}
</li>

<style>
	.entry-link,
	.hidden-entry {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-3xs);
		padding: var(--wa-space-s) var(--wa-space-m);
		border-radius: var(--wa-border-radius-m);
		background: var(--wa-color-surface-raised);
		color: inherit;
		text-decoration: none;
	}

	.entry-link:hover,
	.entry-link:focus-visible {
		background: var(--wa-color-surface-lowered);
	}

	.hidden-entry {
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		color: var(--wa-color-text-quiet);
	}

	.entry-title {
		font-weight: var(--wa-font-weight-semibold);
	}

	.excerpt {
		color: var(--wa-color-text-quiet);
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--wa-space-xs) var(--wa-space-s);
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
	}
</style>
