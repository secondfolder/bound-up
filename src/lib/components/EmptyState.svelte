<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * What a page shows in place of a list it has nothing in yet.
	 *
	 * A line of quiet text under a heading read as a page that had not finished
	 * loading — the guides page was an empty wash under its title. This says
	 * what is missing and what will fill it, with an icon so it reads as
	 * deliberate at a glance.
	 */
	let {
		icon,
		title,
		children
	}: {
		/** A Font Awesome name, as `wa-icon` takes it. Decorative. */
		icon: string;
		title: string;
		/** A sentence on what will appear here, and any way onward. */
		children?: Snippet;
	} = $props();
</script>

<div class="empty-state">
	<wa-icon name={icon} variant="solid"></wa-icon>
	<p class="title">{title}</p>
	{#if children}<div class="body">{@render children()}</div>{/if}
</div>

<style>
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: var(--wa-space-2xl) var(--wa-space-l);
		text-align: center;
		border: 1px dashed var(--wa-color-surface-border);
		border-radius: var(--wa-panel-border-radius);
		background: var(--wa-color-surface-default);
	}

	wa-icon {
		font-size: 2rem;
		color: var(--wa-color-brand-fill-loud);
	}

	.title {
		margin: 0;
		font-weight: var(--wa-font-weight-semibold, 600);
		font-size: 1.125rem;
	}

	.body {
		color: var(--wa-color-text-quiet);
		max-inline-size: 28rem;

		:global(p) {
			margin: 0;
		}
	}
</style>
