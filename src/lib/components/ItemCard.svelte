<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * One task or one reward in a list: the card both lists are built from.
	 *
	 * They used to be two designs — a task put its credits and button on the
	 * right, a reward put its cost under the title and its button bottom-left,
	 * with different corners, padding and borders — for what is the same thing
	 * to a reader: something with a title, a number of credits, and one thing
	 * to do about it. This component owns that layout; the lists own what goes
	 * in it.
	 *
	 * Wide, the value and the actions sit in a column on the right. Narrow (the
	 * card's own width, not the window's, because the same card sits in panels
	 * of different widths), the column drops under the text as a row, the value
	 * at the start and the actions at the end.
	 */
	let {
		title,
		inactive = false,
		celebrating = false,
		meta,
		children,
		status,
		value,
		actions
	}: {
		title: string;
		/** Dimmed, as an inactive task or reward is still listed but cannot be acted on. */
		inactive?: boolean;
		/** Just completed or claimed: the border flashes amber once. */
		celebrating?: boolean;
		/** Quiet lines under the title: a schedule, a time zone note. */
		meta?: Snippet;
		/** The description. */
		children?: Snippet;
		/** A quiet line about why the action is not available. */
		status?: Snippet;
		/** The credits a task awards or a reward costs. */
		value?: Snippet;
		actions?: Snippet;
	} = $props();
</script>

<article class={['item-card', { celebrating }]}>
	<div class={['layout', { inactive }]}>
		<div class="content-column">
			<div class="heading">
				<h3>{title}</h3>
				{#if meta}{@render meta()}{/if}
			</div>
			{#if children}<div class="description">{@render children()}</div>{/if}
			{#if status}<div class="status">{@render status()}</div>{/if}
		</div>

		{#if value || actions}
			<div class="actions-column">
				{#if value}<div class="value">{@render value()}</div>{/if}
				{#if actions}<div class="actions">{@render actions()}</div>{/if}
			</div>
		{/if}
	</div>
</article>

<style>
	.item-card {
		container: item-card / inline-size;
		border: 1px solid var(--wa-color-surface-border);
		border-radius: var(--wa-panel-border-radius);
		padding: var(--wa-space-m);
		background: color-mix(
			in srgb,
			var(--wa-color-surface-default) 96%,
			var(--wa-color-brand-fill-quiet)
		);
	}

	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.75rem 1.25rem;
	}

	.inactive {
		opacity: 0.7;
	}

	.content-column {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		min-inline-size: 0;
	}

	.heading {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	h3 {
		margin: 0;
		font-size: 1.25rem;
		color: var(--wa-color-text-normal);
	}

	.heading,
	.status {
		color: var(--wa-color-text-quiet);
	}

	.heading :global(p),
	.status :global(p) {
		margin: 0;
	}

	.description {
		/* No `white-space: pre-wrap`: RichText emits real <br> and <p>, so
		   preserving whitespace here would double every line break. */
		min-inline-size: 0;
	}

	.actions-column {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.value {
		position: relative;
		white-space: nowrap;
		font-weight: var(--wa-font-weight-semibold, 600);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	@container item-card (width < 30rem) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}

		h3 {
			font-size: 1.125rem;
		}

		.actions-column {
			justify-content: space-between;
		}

		.actions {
			margin-inline-start: auto;
		}
	}

	@media (prefers-reduced-motion: no-preference) {
		/* Toggling a reward or task active changes this; a fade reads as the
		   same card changing state rather than being replaced. */
		.layout {
			transition: opacity 200ms ease-out;
		}

		.celebrating {
			animation: card-flash 800ms ease-out;
		}
	}

	@keyframes card-flash {
		from {
			border-color: var(--wa-color-brand-border-loud);
			box-shadow: 0 0 0 2px var(--wa-color-brand-fill-normal);
		}
	}
</style>
