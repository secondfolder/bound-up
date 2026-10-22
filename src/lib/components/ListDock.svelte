<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * What floats over the bottom of a list page: the round add button. Last in
	 * the page, and pushed to the bottom of a short one.
	 *
	 * Sticky, not fixed: in the app shell the window does not scroll and
	 * `position: fixed` stops working (AGENTS.md, "Adding a route"), while sticky
	 * pins to the bottom of `<main>`'s scrollport — just above the nav, which is
	 * where it belongs. The page under it needs room at the end for it, which
	 * the dock's own height gives it, since it is in the flow.
	 */
	let { children }: { children: Snippet } = $props();
</script>

<div class="dock">{@render children()}</div>

<style>
	.dock {
		position: sticky;
		inset-block-end: 0;
		margin-block-start: auto;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: var(--wa-space-s);
		padding: var(--wa-space-s) var(--page-gutter) var(--wa-space-m);
		/* Taps between its pieces reach the list under it. */
		pointer-events: none;

		& > :global(*) {
			pointer-events: auto;
		}
	}
</style>
