<script lang="ts">
	import { catalog, categories } from '$lib/kink-list/catalog';
	import { kinkListContext } from '$lib/kink-list/context';
	import ListFilters from './ListFilters.svelte';

	/**
	 * Quick fill, step one: which areas to go through. A tile is in until it is
	 * tapped out. "Hard limit everything here" answers a whole category in one
	 * go, for its own kinks: the one blanket answer the list allows, since a
	 * wrong "no" costs little and every kink can still be answered on its own
	 * (docs/kink-list.md, "What an unanswered kink shows").
	 */
	let { onstart, remaining }: { onstart: () => void; remaining: number } = $props();

	const { store } = kinkListContext();

	/** The area just ruled out, for its one pulse; never one that loaded that way. */
	let pulsed: string | null = $state(null);

	function value(categoryId: string) {
		return store.list.triage[categoryId]?.value ?? 'none';
	}
</script>

<div class="triage">
	<h1>Quick fill</h1>
	<p class="intro">
		Tap out any area you'd rather skip. You'll then get one card per kink: answer it, swipe it or
		skip it.
	</p>

	<ListFilters />

	{#each Object.entries(catalog.sections) as [section, title] (section)}
		<section aria-labelledby="triage-{section}">
			<h2 id="triage-{section}">{title}</h2>
			<ul class="tiles">
				{#each categories(section) as category (category.id)}
					<li
						class="tile {value(category.id)}"
						class:pulsed={pulsed === category.id}
						onanimationend={() => {
							pulsed = null;
						}}
					>
						<!-- A toggle: aria-pressed, which wa-button would not forward. -->
						<button
							type="button"
							class="toggle"
							aria-pressed={value(category.id) === 'none'}
							disabled={value(category.id) === 'limit'}
							onclick={() => store.setTriage(category.id, value(category.id) === 'skip' ? 'none' : 'skip')}
						>
							<span class="name">{category.name}</span>
							<span class="state">
								{#if value(category.id) === 'limit'}Hard limit{:else if value(category.id) === 'skip'}Skipping{:else}Going through{/if}
							</span>
						</button>
						<button
							type="button"
							class="limit-all"
							onclick={() => {
								const next = value(category.id) === 'limit' ? 'none' : 'limit';
								pulsed = next === 'limit' ? category.id : null;
								store.setTriage(category.id, next);
							}}
						>
							{value(category.id) === 'limit' ? 'Not a hard limit after all' : 'Hard limit everything here'}<span
								class="wa-visually-hidden">({category.name})</span
							>
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/each}

	<div class="start">
		<wa-button variant="brand" appearance="accent" onclick={onstart}>
			{remaining === 0 ? 'Review' : `Start (${remaining} to go)`}
		</wa-button>
	</div>
</div>

<style>
	.triage {
		display: flex;
		flex-direction: column;
		gap: 1rem;

		h1 {
			text-align: center;
			margin: 0;
		}

		h2 {
			margin: 0 0 0.5rem;
			font-size: 1.1rem;
		}
	}

	.intro {
		margin: 0;
		text-align: center;
		color: var(--wa-color-text-quiet);
	}

	.tiles {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
		gap: 0.5rem;
	}

	.tile {
		margin: 0;
		display: flex;
		flex-direction: column;
		border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-l);
		background: var(--wa-color-surface-default);
		overflow: hidden;

		/* "Going through" is where every tile starts, so it keeps the plain
		   border: amber on all thirty said nothing. Only a change stands out. */
		&.skip {
			opacity: 0.55;
			scale: 0.98;
		}

		&.limit {
			border-color: var(--wa-color-danger-border-loud);
		}

		@media (prefers-reduced-motion: no-preference) {
			transition:
				opacity 150ms ease-out,
				scale 150ms ease-out,
				border-color 150ms ease-out;

			/* One red pulse as a whole area is ruled out, so the tap that did
			   it is seen to have done something that big. */
			&.pulsed {
				animation: ruled-out 450ms ease-out;
			}
		}
	}

	@keyframes ruled-out {
		30% {
			box-shadow: 0 0 0 0.25rem var(--wa-color-danger-fill-quiet);
		}
	}

	/* Web Awesome's native styles give a <button> a form control's height,
	   centred: a two-line name ran out of the top and bottom of the tile and
	   pushed its state out of sight. Sized by its content instead, from the
	   top, so every tile's name starts on the same line. */
	.toggle {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: flex-start;
		gap: 0.15rem;
		flex: 1 1 auto;
		block-size: auto;
		min-block-size: 4.5rem;
		inline-size: 100%;
		padding: 0.75rem;
		/* Web Awesome's native button styles keep a label on one line; a tile's
		   name wraps instead. */
		white-space: normal;
		overflow-wrap: anywhere;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: start;
		cursor: pointer;

		&:disabled {
			cursor: default;
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: calc(-1 * var(--wa-focus-ring-width));
		}

		.name {
			font-weight: var(--wa-font-weight-semibold);
		}

		.state {
			font-size: 0.8125rem;
			color: var(--wa-color-text-quiet);
		}
	}

	/* Quiet until it is meant: thirty red links read as thirty warnings. Red
	   on hover and focus, and once the area is a hard limit. */
	.limit-all {
		justify-content: flex-start;
		block-size: auto;
		padding: 0.4rem 0.75rem;
		border: 0;
		border-block-start: var(--wa-border-width-s) solid var(--wa-color-surface-border);
		background: none;
		color: var(--wa-color-text-quiet);
		font: inherit;
		font-size: 0.75rem;
		text-align: start;
		white-space: normal;
		cursor: pointer;

		&:hover,
		&:focus-visible,
		.limit > & {
			color: var(--wa-color-danger-on-quiet);
		}
	}

	/* Pinned to the foot of the screen over an opaque strip, as the list's
	   pinned bar is at its head: with nothing behind it the button sat on top
	   of the tiles and covered their text. */
	.start {
		position: sticky;
		inset-block-end: 0;
		display: flex;
		justify-content: center;
		padding-block: 0.75rem;
		background: linear-gradient(to bottom, transparent, var(--wa-color-surface-lowered) 0.75rem);
	}
</style>
