<script lang="ts">
	import {
		dependents,
		findItem,
		formatShippedOn,
		type PlacedItem,
		type RoadmapStatus,
		STATUS_LABELS
	} from '$lib/roadmap';

	type Props = { placed: PlacedItem };

	let { placed }: Props = $props();

	const item = $derived(placed.item);
	const children = $derived('children' in item ? (item.children ?? []) : []);
	const needs = $derived(
		(item.dependsOn ?? []).flatMap((id) => {
			const found = findItem(id);
			return found ? [found] : [];
		})
	);
	const leadsTo = $derived(dependents(item.id));

	// Shipped reads as done; the rest as how far along it is.
	const BADGE_VARIANTS: Record<RoadmapStatus, 'brand' | 'neutral'> = {
		shipped: 'brand',
		'in-progress': 'brand',
		planned: 'neutral',
		exploring: 'neutral'
	};
</script>

<div class="details">
	<p class="where">
		{placed.branch.title}{#if placed.parent}
			<span class="separator" aria-hidden="true">›</span><a href="#{placed.parent.id}">{placed.parent.title}</a>
		{/if}
	</p>

	<p class="status">
		<wa-badge
			variant={BADGE_VARIANTS[item.status]}
			appearance={item.status === 'shipped' ? 'accent' : 'outlined'}
		>
			{STATUS_LABELS[item.status]}
		</wa-badge>
		{#if item.shippedOn}
			<span>{formatShippedOn(item.shippedOn)}</span>
		{/if}
	</p>

	<p class="summary">{item.summary}</p>

	{#if item.notes?.length}
		<ul class="notes">
			{#each item.notes as note (note)}
				<li>{note}</li>
			{/each}
		</ul>
	{/if}

	{#if children.length}
		<h3>What's part of it</h3>
		{@render trail(children.map((child) => ({ id: child.id, title: child.title, status: child.status })))}
	{/if}

	<!-- A tech tree's prerequisites, both ways: what this is waiting on, and
	     what is waiting on this. Each is a fragment link, so following one
	     swaps the drawer to that item. -->
	{#if needs.length}
		<h3>Needs first</h3>
		{@render trail(needs.map((p) => p.item))}
	{/if}

	{#if leadsTo.length}
		<h3>Leads to</h3>
		{@render trail(leadsTo.map((p) => p.item))}
	{/if}
</div>

{#snippet trail(items: { id: string; title: string; status: RoadmapStatus }[])}
	<ul class="trail">
		{#each items as linked (linked.id)}
			<li>
				<a href="#{linked.id}">{linked.title}</a>
				<span class="trail-status">{STATUS_LABELS[linked.status]}</span>
			</li>
		{/each}
	</ul>
{/snippet}

<style>
	.details {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;

		p {
			margin: 0;
		}

		h3 {
			margin: 0.5rem 0 0;
			font-size: var(--wa-font-size-s);
			text-transform: uppercase;
			letter-spacing: 0.06em;
			color: var(--wa-color-text-quiet);
		}

		a {
			color: var(--accent-color);

			&:hover {
				color: var(--accent-tint);
			}
		}
	}

	.where {
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
	}

	.separator {
		margin-inline: 0.5em;
	}

	.status {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
	}

	.summary {
		font-size: var(--wa-font-size-l);
	}

	.notes,
	.trail {
		margin: 0;
		padding-inline-start: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.trail-status {
		margin-inline-start: 0.4rem;
		font-size: var(--wa-font-size-2xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--wa-color-text-quiet);
	}
</style>
