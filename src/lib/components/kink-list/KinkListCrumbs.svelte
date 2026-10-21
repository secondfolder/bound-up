<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The way back from a kink list page, and anything that goes beside it
	 * (the save status, a link onwards). Drawn as NestedPageHeader's back link
	 * is — a chevron and the page's name, not an underlined link — so the way
	 * back looks the same here as on the daydream and settings pages; the kink
	 * list keeps its own centred title under it, which a NestedPageHeader would
	 * have replaced. The pages used to say "Whole list" on one and "Your list"
	 * on another for the same place.
	 *
	 * `label` is the link's accessible name, as on NestedPageHeader: the visible
	 * text is the parent's title, and two links named only that could collide
	 * in a link list.
	 */
	let {
		href,
		text,
		label,
		children
	}: { href: string; text: string; label: string; children?: Snippet } = $props();
</script>

<nav class="crumbs">
	<a {href} aria-label={label}>
		<wa-icon name="chevron-left" variant="solid"></wa-icon>
		<span>{text}</span>
	</a>
	{@render children?.()}
</nav>

<style>
	.crumbs {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.25rem 1rem;
		margin-block-end: 0.5rem;
	}

	a {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		min-inline-size: 0;
		/* A comfortable tap target, as NestedPageHeader's. */
		min-block-size: 2.75rem;
		text-decoration: none;
		color: inherit;
		font-weight: var(--wa-font-weight-semibold, 600);
	}
</style>
