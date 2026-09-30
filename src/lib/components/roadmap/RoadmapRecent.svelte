<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatShippedOn, recentlyShipped } from '$lib/roadmap';

	const roadmapHref = resolve('/(public)/roadmap');
	const recent = recentlyShipped(4);
</script>

<!-- The newest shipped roadmap items, each linking to its own node on
     /roadmap. Lives under the landing page's feature overview rather than in
     RoadmapHighlights: it is what the app already does, not what is coming.
     Its links cannot share a name with the "Coming up" tiles, which are only
     unshipped items, and $lib/roadmap refuses duplicate titles. -->
<div class="recent">
	<h3 id="recently-added">Recently added</h3>
	<ul aria-labelledby="recently-added">
		{#each recent as { item, parent } (item.id)}
			<li>
				<wa-icon name="check" variant="solid" aria-hidden="true"></wa-icon>
				<!-- On one line: whitespace inside the link would be underlined. -->
				<a href="{roadmapHref}#{item.id}">{#if parent}<span class="parent">{parent.title}:</span>&nbsp;{/if}{item.title}</a>
				{#if item.shippedOn}
					<span class="date">{formatShippedOn(item.shippedOn)}</span>
				{/if}
			</li>
		{/each}
	</ul>
</div>

<style>
	.recent {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		text-align: center;
	}

	h3 {
		margin: 0;
		font-size: var(--wa-font-size-s);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--wa-color-text-normal);
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
		/* Web Awesome's native styles indent every `li` by 1.125em. */
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
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

	.parent {
		font-weight: 400;
		color: var(--wa-color-text-quiet);
	}

	.date {
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
	}
</style>
