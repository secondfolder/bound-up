<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The header of a page the bottom nav goes to (Tasks & Rewards, Notebook,
	 * Messages): its title, and the context switcher at the end of the same
	 * line. No back link: these are the app's top-level places, siblings of
	 * Today in the nav, not pages under it, and the "‹ Today" they used to
	 * carry cost a whole line to say otherwise. A page under one of them
	 * keeps `NestedPageHeader`.
	 *
	 * Inset, gutter and divider match `NestedPageHeader`, so moving between
	 * the two the title and the content under it stay on one edge.
	 */
	let {
		title,
		description = null,
		corner,
		toolbar
	}: {
		title: string;
		/**
		 * None by default: no page has one now (what one used to say is in
		 * its page's body or empty state). Kept for a page that turns out to
		 * need a line under its title.
		 */
		description?: string | null;
		/** At the end of the title's line: the context switcher. */
		corner?: Snippet;
		/**
		 * A second line, under the title: the page's segmented control, and on
		 * the tasks and rewards pages their credits at its end.
		 */
		toolbar?: Snippet;
	} = $props();
</script>

<header>
	<div class="top">
		<h1>{title}</h1>
		{#if corner}<div class="corner">{@render corner()}</div>{/if}
	</div>
	{#if toolbar}<div class="toolbar">{@render toolbar()}</div>{/if}
	{#if description}<p>{description}</p>{/if}
</header>

<style>
	header {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-inline: var(--page-gutter);
		padding-block: var(--wa-space-s) var(--wa-space-m);
		border-block-end: 1px solid var(--wa-color-surface-border);
	}

	.top {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		/* The switcher's pill is 40px; a short title must not make the line shorter. */
		min-block-size: 2.75rem;

		h1 {
			margin: 0;
			min-inline-size: 0;
			overflow-wrap: anywhere;
		}
	}

	.corner {
		display: flex;
		margin-inline-start: auto;
	}

	/* The segmented control at the start and anything else (the credits) at
	   the end; wrapped under it on a screen too narrow for both. */
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	p {
		margin: 0;
		color: var(--wa-color-text-quiet);
	}
</style>
