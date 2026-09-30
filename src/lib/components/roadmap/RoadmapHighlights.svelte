<script lang="ts">
	import { resolve } from '$app/paths';
	import { featuredUpcoming, STATUS_LABELS } from '$lib/roadmap';

	const roadmapHref = resolve('/(public)/roadmap');
	const upcoming = featuredUpcoming(6);
</script>

<!-- The landing page's taste of what is coming. Every link goes to the item's
     own node on /roadmap, which opens its details. What has already shipped
     is RoadmapRecent, under the landing page's feature overview. -->
<section class="highlights" aria-labelledby="roadmap-highlights">
	<h2 id="roadmap-highlights">Coming Up</h2>
	<ul class="upcoming">
		{#each upcoming as { item } (item.id)}
			<li>
				<a class="tile" href="{roadmapHref}#{item.id}">
					<wa-icon name={item.icon ?? 'seedling'} variant="solid" aria-hidden="true"></wa-icon>
					<span class="title">{item.title}</span>
					<span class="status">{STATUS_LABELS[item.status]}</span>
				</a>
			</li>
		{/each}
	</ul>

	<a class="all" href={roadmapHref}>See the full roadmap</a>
</section>

<style>
	.highlights {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		inline-size: 100%;
		max-inline-size: 40rem;
		margin-inline: auto;
		text-align: center;
		/* The tiles size their columns off this section's width, not the
		   window's: it is capped at 40rem, so a wide window says nothing. */
		container-type: inline-size;

		h2 {
			/* On top of the section's 1rem gap: the display face is set big,
			   and the tiles crowded it at the gap alone. */
			margin: 0 0 0.75rem;
			font-family: var(--font-display);
			font-size: clamp(2rem, 8vw, 3rem);
			color: var(--accent-color);
		}

		ul {
			list-style: none;
			margin: 0;
			padding: 0;
		}

		/* Web Awesome's native styles indent every `li` by 1.125em, which made
		   each tile 18px wider than its column: three fitted where four should,
		   and one where two should on a phone. */
		li {
			margin: 0;
		}
	}

	.all {
		margin-block-start: 0.75rem;
		color: var(--accent-color);
		font-weight: 700;
		font-size: 1.2em;

		&:hover {
			color: var(--accent-tint);
		}

		&:focus-visible {
			outline: 2px solid var(--accent-tint);
			outline-offset: 3px;
		}
	}

	/*
	 * Fixed-width tiles in a wrapping row rather than a grid: a grid starts a
	 * short last row at the left edge, and a flex row centres it. One `--gap`
	 * both ways, so the columns and rows are spaced alike, and each tile is
	 * exactly one column wide so every full row lines up with the others.
	 */
	.upcoming {
		--columns: 2;
		--gap: 0.75rem;

		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--gap);
		inline-size: 100%;

		> li {
			display: flex;
			flex: 0 0 calc((100% - (var(--columns) - 1) * var(--gap)) / var(--columns));
		}
	}

	@container (min-width: 28rem) {
		.upcoming {
			--columns: 3;
		}
	}

	@container (min-width: 36rem) {
		.upcoming {
			--columns: 4;
		}
	}

	.tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		/* Centred top to bottom too: tiles in a row share the tallest one's
		   height, and a one-line title left the rest top-heavy. */
		justify-content: center;
		gap: 0.35rem;
		/* Fills its column, and a row takes its tallest tile's height. */
		flex: 1 1 auto;
		box-sizing: border-box;
		padding: 1rem 0.5rem;
		border: 1px solid var(--wa-color-brand-border-quiet);
		border-radius: var(--wa-border-radius-l);
		background: var(--wa-color-brand-fill-quiet);
		color: var(--wa-color-text-normal);
		text-decoration: none;
		transition:
			border-color 0.15s ease,
			translate 0.15s ease;

		wa-icon {
			font-size: 1.75rem;
			color: var(--accent-color);
		}

		.title {
			font-weight: 700;
			line-height: 1.2;
		}

		.status {
			font-size: var(--wa-font-size-2xs);
			text-transform: uppercase;
			letter-spacing: 0.06em;
			color: var(--accent-color);
		}

		&:hover {
			border-color: var(--accent-color);
			translate: 0 -2px;
		}

		&:focus-visible {
			outline: 2px solid var(--accent-tint);
			outline-offset: 3px;
		}
	}
</style>
