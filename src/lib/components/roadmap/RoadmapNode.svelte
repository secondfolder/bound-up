<script lang="ts">
	import { type RoadmapItem, type RoadmapTwig, STATUS_LABELS } from '$lib/roadmap';

	type Props = {
		item: RoadmapItem | RoadmapTwig;
		/** A twig: a smaller marker, no icon, no visible status chip. */
		twig?: boolean;
		/** Filtered out by the legend: still there, so the tree keeps its shape. */
		dimmed?: boolean;
	};

	let { item, twig = false, dimmed = false }: Props = $props();
</script>

<!-- A link to its own fragment, not a button: the node is deep-linkable, a
     plain link still scrolls to it without JavaScript, and the page opens the
     details drawer from `page.url.hash` — so the back button closes it. The id
     is on the link itself so the fragment lands on it. -->
<a
	class="node"
	class:twig
	class:dimmed={dimmed}
	id={item.id}
	href="#{item.id}"
	data-status={item.status}
>
	<!-- The slot is one line of the title tall, so the marker centres on that
	     line — which is where the tree's elbow connectors arrive (0.5lh down;
	     see RoadmapTree). The marker itself cannot measure it: its own lh is
	     its glyph's. -->
	<span class="marker-slot" aria-hidden="true">
		<span class="marker">
			{#if item.status === 'shipped'}
				<wa-icon name="check" variant="solid"></wa-icon>
			{:else if item.status === 'exploring'}
				?
			{/if}
		</span>
	</span>
	<span class="text">
		<span class="title">
			{#if item.icon && !twig}
				<wa-icon class="icon" name={item.icon} variant="solid" aria-hidden="true"></wa-icon>
			{/if}
			{item.title}
		</span>
		<!-- The status is said in words as well as shown by the marker's shape,
		     never by colour alone. A twig keeps it for screen readers only. -->
		<span class={twig ? 'wa-visually-hidden' : 'status'}>
			{twig ? ` (${STATUS_LABELS[item.status]})` : STATUS_LABELS[item.status]}
		</span>
		{#if !twig}
			<span class="summary">{item.summary}</span>
		{/if}
	</span>
</a>

<style>
	.node {
		--marker-size: 1.25rem;

		/* Positioned so the marker paints over the tree's elbow connector,
		   which is a positioned pseudo-element on the item around it and
		   would otherwise be drawn across the marker's ring. The elbow ends on
		   the ring's edge; this is what keeps it from showing inside it. */
		position: relative;
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		color: var(--wa-color-text-normal);
		text-decoration: none;
		border-radius: var(--wa-border-radius-m);
		/* Scrolled to from a fragment: clear of the top edge rather than flush. */
		scroll-margin-block: 5rem;

		&.twig {
			--marker-size: 0.85rem;
			gap: 0.5rem;
		}

		&:focus-visible {
			outline: 2px solid var(--accent-tint);
			outline-offset: 3px;
		}
	}

	.marker-slot {
		flex: none;
		display: grid;
		place-items: center;
		block-size: 1lh;
	}

	.marker {
		display: grid;
		place-items: center;
		inline-size: var(--marker-size);
		block-size: var(--marker-size);
		box-sizing: border-box;
		border-radius: 50%;
		border: 2px solid var(--accent-color);
		/* Opaque, so the connector that runs into it stops at its edge. */
		background: var(--wa-color-surface-default);
		color: var(--wa-color-brand-on-loud);
		font-size: calc(var(--marker-size) * 0.6);
		font-weight: 800;
		line-height: 1;

		[data-status='shipped'] & {
			background: var(--accent-color);
		}

		[data-status='in-progress'] & {
			background: linear-gradient(
				to top,
				var(--accent-color) 50%,
				var(--wa-color-surface-default) 50%
			);
			animation: growing 2.4s ease-in-out infinite;

			@media (prefers-reduced-motion: reduce) {
				animation: none;
			}
		}

		/* Not committed to yet: the same ring, half there. */
		[data-status='exploring'] & {
			border-color: color-mix(in oklab, var(--accent-color) 50%, transparent);
			color: var(--wa-color-text-quiet);
		}
	}

	@keyframes growing {
		50% {
			box-shadow: 0 0 0 0.3rem color-mix(in oklab, var(--accent-color) 30%, transparent);
		}
	}

	.text {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		column-gap: 0.5rem;
		row-gap: 0.1rem;
		min-inline-size: 0;
	}

	.title {
		font-weight: 700;

		.twig & {
			font-weight: 500;
		}
	}

	.icon {
		color: var(--accent-color);
		margin-inline-end: 0.2rem;
	}

	.status {
		font-size: var(--wa-font-size-2xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 700;
		color: var(--accent-color);

		[data-status='exploring'] & {
			color: var(--wa-color-text-quiet);
		}
	}

	.summary {
		flex-basis: 100%;
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
		/* Two lines at most: the drawer has the rest. */
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
	}

	/* The states last, as the most specific rules here. */

	/* Dimmed: the marker and the text, not the node. The tree draws
	   connectors on the node too, and those are dimmed by what they lead to,
	   not by this item alone (see RoadmapTree). */
	.node > .marker-slot,
	.node > .text {
		transition: opacity 0.15s ease;
	}

	.node.dimmed > .marker-slot,
	.node.dimmed > .text {
		opacity: var(--dim-opacity, 0.3);
	}

	.node:hover .title {
		color: var(--accent-tint);
		text-decoration: underline;
	}

	/* The node the fragment points at, while the drawer is showing it. */
	.node:target .marker {
		outline: 2px solid var(--accent-tint);
		outline-offset: 3px;
	}
</style>
