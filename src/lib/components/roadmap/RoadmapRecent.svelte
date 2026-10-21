<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatShippedOn, type PlacedItem, recentlyShipped } from '$lib/roadmap';

	const roadmapHref = resolve('/(public)/roadmap');

	/**
	 * Runs of items under one parent, in the order they shipped. The newest
	 * few are often all twigs of one branch — four "Daydreams: …" in a row
	 * read as a stammer — so the parent is said once, over its run.
	 */
	const groups = recentlyShipped(4).reduce<{ parent: PlacedItem['parent']; items: PlacedItem[] }[]>(
		(runs, placed) => {
			const last = runs.at(-1);
			if (last && last.parent?.id === placed.parent?.id) {
				last.items.push(placed);
			} else {
				runs.push({ parent: placed.parent, items: [placed] });
			}
			return runs;
		},
		[]
	);
</script>

<!-- The newest shipped roadmap items, each linking to its own node on
     /roadmap. Lives under the landing page's feature overview rather than in
     RoadmapHighlights: it is what the app already does, not what is coming.
     Its links cannot share a name with the "Coming up" tiles, which are only
     unshipped items, and $lib/roadmap refuses duplicate titles. -->
<div class="recent">
	<h3 id="recently-added">Recently added</h3>
	<!-- One block, centred as a whole, with its lines aligned left inside it:
	     centring each line on its own left the check marks in a zigzag. -->
	<div class="runs">
		{#each groups as { parent, items }, index (`${parent?.id ?? "top"}-${index}`)}
			<div class="run">
				{#if parent}<p class="parent" id="recent-parent-{index}">{parent.title}</p>{/if}
				<ul aria-labelledby={parent ? `recent-parent-${index}` : 'recently-added'}>
					{#each items as { item } (item.id)}
						<li>
							<wa-icon name="check" variant="solid" aria-hidden="true"></wa-icon>
							<a href="{roadmapHref}#{item.id}">{item.title}</a>
							{#if item.shippedOn}
								<span class="date">{formatShippedOn(item.shippedOn)}</span>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
</div>

<style>
	.recent {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		/* On top of the section's gap: this sat closer to the last feature than
		   the features sit to each other, and read as part of it. */
		margin-block-start: 1rem;
	}

	h3 {
		margin: 0;
		font-size: var(--wa-font-size-s);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--wa-color-text-normal);
	}

	.runs {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-inline-size: 100%;
		text-align: start;
	}

	.parent {
		margin: 0 0 0.25rem;
		color: var(--wa-color-text-quiet);
	}

	ul {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	li {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		column-gap: 0.45rem;
	}

	wa-icon {
		color: var(--accent-color);
		align-self: center;
	}

	a {
		color: var(--wa-color-text-normal);
		font-weight: 700;

		&:hover {
			color: var(--accent-tint);
		}
	}

	.date {
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
	}
</style>
