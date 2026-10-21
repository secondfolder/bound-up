<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A titled section of a tasks or rewards page: a header row and the list
	 * under it.
	 *
	 * The header is the same everywhere: the title, with anything that
	 * describes it (a credit balance) beside it, on the left; the section's
	 * buttons on the right. Tasks and rewards used to lay this out two ways —
	 * one right-aligned its buttons, the other packed them after the title —
	 * which made sibling pages look like different apps.
	 *
	 * `framed` draws the panel. A page with one section leaves it off, so its
	 * cards sit directly on the page rather than in a card of their own.
	 */
	let {
		title = null,
		framed = true,
		class: className = '',
		meta,
		actions,
		children
	}: {
		/** Left off when the page title already says it (a page with one section). */
		title?: string | null;
		framed?: boolean;
		class?: string;
		/** Beside the title: what the section is measured in, such as a balance. */
		meta?: Snippet;
		actions?: Snippet;
		children: Snippet;
	} = $props();
</script>

<section class={['section-panel', className]} class:panel={framed}>
	{#if title || meta || actions}
		<div class="section-header">
			{#if title || meta}
				<div class="title-row">
					{#if title}<h2>{title}</h2>{/if}
					{#if meta}{@render meta()}{/if}
				</div>
			{/if}
			{#if actions}<div class="section-actions">{@render actions()}</div>{/if}
		</div>
	{/if}

	{@render children()}
</section>

<style>
	.section-panel {
		container: section-panel / inline-size;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.panel {
		border: 1px solid var(--wa-color-surface-border);
		border-radius: var(--wa-panel-border-radius);
		padding: var(--wa-space-l);
		background: color-mix(
			in srgb,
			var(--wa-color-surface-default) 94%,
			var(--wa-color-brand-fill-quiet)
		);

		/* A card inside a panel inside the page gutter left a long title a
		   third of a phone's width. */
		@media (width < 40rem) {
			padding: var(--wa-space-m);
		}
	}

	.section-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem 1rem;
	}

	.title-row {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 1rem;
		min-inline-size: 0;
	}

	h2 {
		margin: 0;
	}

	.section-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-inline-start: auto;
	}

	/* Narrow, the buttons take the full width as equal columns under the title,
	   instead of wrapping one per line at whatever width their words make. */
	@container section-panel (width < 30rem) {
		.section-actions {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
			inline-size: 100%;
			margin-inline-start: 0;
		}
	}
</style>
