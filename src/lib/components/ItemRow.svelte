<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * One task or reward in a list, a line each, the way a to-do app lists
	 * them: something to act on at the start, the title and one quiet line under
	 * it, and the credits at the end. Tapping the row opens the item's detail
	 * (`ResponsiveDialog`), which is where its description and its other actions
	 * live. See docs/theme.md, "Lists of items".
	 *
	 * These replaced a card per item (`ItemCard`), which gave every one a border,
	 * a big heading, its whole description and a row of buttons: two tasks filled
	 * a phone screen.
	 */
	let {
		title,
		onopen,
		dimmed = false,
		quiet = false,
		selected = false,
		celebrating = false,
		leading,
		meta,
		trailing,
		below,
		...attributes
	}: {
		title: string;
		/** Opens the detail. Without it the title is plain text. */
		onopen?: () => void;
		/** Listed, but switched off: inactive. */
		dimmed?: boolean;
		/** Not doable yet, though it will be: the title and the number go grey. */
		quiet?: boolean;
		/** Its detail is open over the list. */
		selected?: boolean;
		/** Just completed or claimed. */
		celebrating?: boolean;
		/** The control at the start: a circle to tick, a clock, a ring. */
		leading?: Snippet;
		/**
		 * Quiet pieces under the title, a few words each. Outside the title's
		 * button, so a piece may be a control of its own (`WhoseTime`).
		 */
		meta?: Snippet;
		/** The credits at the end. */
		trailing?: Snippet;
		/** A full-width line under the rest: a reward's progress towards its cost. */
		below?: Snippet;
		/** Anything else goes on the `<li>`: a pointer or focus handler, say. */
		[attribute: string]: unknown;
	} = $props();
</script>

<li
	{...attributes}
	class={['item-row', { dimmed, quiet, selected, celebrating, 'has-leading': Boolean(leading) }]}
>
	{#if leading}<div class="leading">{@render leading()}</div>{/if}

	<div class="body">
		{#if onopen}
			<!-- A native button, named by the title alone. It covers the whole row
			     (`::after`), so a tap anywhere but another control opens it; the
			     controls in the row sit above it. -->
			<button type="button" class="open" onclick={onopen}>{title}</button>
		{:else}
			<span class="title">{title}</span>
		{/if}
		{#if meta}<span class="meta">{@render meta()}</span>{/if}
	</div>

	{#if trailing}<div class="trailing">{@render trailing()}</div>{/if}
	{#if below}<div class="below">{@render below()}</div>{/if}
</li>

<style>
	.item-row {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-areas: 'body trailing' 'below below';
		align-items: center;
		column-gap: 0.625rem;
		padding-block: 0.25rem;
		border-block-end: 1px solid color-mix(in oklab, var(--wa-color-surface-border) 45%, transparent);
		transition: background-color 150ms;

		&:last-child {
			border-block-end: none;
		}

		&.has-leading {
			grid-template-columns: auto minmax(0, 1fr) auto;
			grid-template-areas: 'leading body trailing' '. below below';
		}

		/* Its detail is open over the list: the row it came from stays lit
		   behind the backdrop, so it is plain which one it is. */
		&.selected {
			border-radius: var(--wa-border-radius-m);
			background: var(--wa-color-brand-fill-quiet);
			border-block-end-color: transparent;
		}
	}

	/* Above the title's stretched button, so they get their own taps. */
	.leading,
	.trailing,
	.below,
	.meta :global(button),
	.meta :global(a) {
		position: relative;
		z-index: 1;
	}

	.leading {
		grid-area: leading;
		display: grid;
		place-items: center;
		/* The circle's own box: rows line up whichever control they have. Its
		   button fills it, a comfortable tap target for a small circle. */
		inline-size: 2.5rem;
		block-size: 2.5rem;
	}

	.body {
		grid-area: body;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.0625rem;
		min-inline-size: 0;
		padding-block: 0.25rem;
	}

	.open,
	.title {
		font: inherit;
		font-size: 0.9375rem;
		font-weight: var(--wa-font-weight-semibold, 600);
		line-height: 1.3;
		color: var(--wa-color-text-normal);
		overflow-wrap: anywhere;
		text-align: start;
	}

	/* Web Awesome styles every native button as a form control
	   (`native.css`): a fixed control height, which made each row half as tall
	   again as the title, `nowrap`, which stopped a long title wrapping, and a
	   lift on hover. A title is none of those. */
	.open {
		display: inline;
		block-size: auto;
		margin: 0;
		padding: 0;
		border: none;
		background: none;
		white-space: normal;
		transform: none;
		cursor: pointer;

		&::after {
			content: '';
			position: absolute;
			inset: 0;
			border-radius: var(--wa-border-radius-m);
		}

		&:focus-visible {
			outline: none;

			&::after {
				outline: var(--wa-focus-ring);
				outline-offset: calc(-1 * var(--wa-focus-ring-width, 3px));
			}
		}
	}

	@media (hover: hover) {
		.item-row:hover .open {
			color: var(--wa-color-text-link);
		}
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 0.5rem;
		font-size: 0.75rem;
		color: var(--wa-color-text-quiet);
	}

	.trailing {
		grid-area: trailing;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
		font-weight: var(--wa-font-weight-semibold, 600);
	}

	.below {
		grid-area: below;
		padding-block-end: 0.375rem;

		/* A snippet with nothing to say this time still renders the box. */
		&:empty {
			display: none;
		}
	}

	.dimmed .body,
	.dimmed .trailing {
		opacity: 0.65;
	}

	.quiet :is(.open, .title),
	.quiet .trailing,
	.quiet .trailing :global(*) {
		color: var(--wa-color-text-quiet);
	}

	.celebrating :is(.open, .title) {
		color: var(--wa-color-text-quiet);
		text-decoration: line-through;
		text-decoration-color: var(--wa-color-brand-on-quiet);
	}
</style>
