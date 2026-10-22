<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A labelled run of `ItemRow`s: "Ready", "Later", one wallet's rewards. The
	 * caller leaves out a group with nothing in it. A collapsed group (the
	 * inactive ones) is a closed `wa-details`, there for whoever looks for it and
	 * out of the way of everyone else. A headless one is the rows alone, where
	 * something else already says what they are (a tab). See docs/theme.md,
	 * "Lists of items".
	 */
	let {
		title,
		count = null,
		collapsed = false,
		headless = false,
		header,
		children
	}: {
		title: string;
		/** Shown beside the title; null for none. */
		count?: number | null;
		collapsed?: boolean;
		/** No heading drawn; `title` still names the group to a screen reader. */
		headless?: boolean;
		/** Replaces the plain heading's right-hand side: a balance, say. */
		header?: Snippet;
		/** The rows, as `<li>`s. */
		children: Snippet;
	} = $props();
</script>

{#if collapsed}
	<wa-details class="item-group collapsed">
		<span slot="summary" class="summary">
			{title}{#if count !== null}<span class="count">{count}</span>{/if}
		</span>
		<ul class="rows">{@render children()}</ul>
	</wa-details>
{:else if headless}
	<section class="item-group" aria-label={title}>
		<ul class="rows">{@render children()}</ul>
	</section>
{:else}
	<section class="item-group">
		<div class="heading">
			<h3>
				{title}{#if count !== null}<span class="count">{count}</span>{/if}
			</h3>
			{#if header}{@render header()}{/if}
		</div>
		<ul class="rows">{@render children()}</ul>
	</section>
{/if}

<style>
	.item-group {
		display: flex;
		flex-direction: column;
	}

	.heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		padding-block-end: 0.125rem;
	}

	h3,
	.summary {
		margin: 0;
		font-size: 0.75rem;
		font-weight: var(--wa-font-weight-semibold, 600);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--wa-color-text-quiet);
	}

	/* A small round badge, not a bare number: a number set where a heading
	   meets the right-hand column read, at a skim, as one more row's credits. */
	.count {
		display: inline-grid;
		place-items: center;
		min-inline-size: 1.25rem;
		margin-inline-start: 0.5rem;
		padding: 0 0.375rem;
		border-radius: var(--wa-border-radius-pill);
		background: var(--wa-color-surface-raised);
		color: var(--wa-color-text-normal);
		font-size: 0.6875rem;
		font-weight: var(--wa-font-weight-normal, 400);
		line-height: 1.125rem;
		letter-spacing: 0;
		text-transform: none;
		vertical-align: 0.0625rem;
		font-variant-numeric: tabular-nums;
	}

	/* `theme.css` already leaves bullet-less lists flush; this one has no bullets. */
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	wa-details.collapsed {
		--spacing: 0;

		&::part(details) {
			border: none;
			background: none;
		}

		&::part(header) {
			padding-block: 0.5rem;
			padding-inline: 0;
		}

		&::part(content) {
			padding: 0;
		}
	}
</style>
