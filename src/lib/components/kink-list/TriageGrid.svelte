<script lang="ts">
	import { catalog, categories } from '$lib/kink-list/catalog';
	import { kinkListContext } from '$lib/kink-list/context';
	import IntensitySetting from './IntensitySetting.svelte';

	/**
	 * Quick fill, step one: which areas to go through. A tile is in until it is
	 * tapped out. "Hard limit everything here" answers a whole category in one
	 * go, for its own kinks: the one blanket answer the list allows, since a
	 * wrong "no" costs little and every kink can still be answered on its own
	 * (docs/kink-list.md, "What an unanswered kink shows").
	 */
	let { onstart, remaining }: { onstart: () => void; remaining: number } = $props();

	const { store } = kinkListContext();

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

	<IntensitySetting />

	{#each Object.entries(catalog.sections) as [section, title] (section)}
		<section aria-labelledby="triage-{section}">
			<h2 id="triage-{section}">{title}</h2>
			<ul class="tiles">
				{#each categories(section) as category (category.id)}
					<li class="tile {value(category.id)}">
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
							onclick={() => store.setTriage(category.id, value(category.id) === 'limit' ? 'none' : 'limit')}
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
		/* Web Awesome's native styles indent every <li> for its marker. */
		margin: 0;
		display: flex;
		flex-direction: column;
		border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-l);
		background: var(--wa-color-surface-default);
		overflow: hidden;

		&.none {
			border-color: var(--wa-color-brand-border-loud);
		}

		&.skip {
			opacity: 0.6;
		}

		&.limit {
			border-color: var(--wa-color-danger-border-loud);
		}
	}

	.toggle {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.15rem;
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

	.limit-all {
		padding: 0.4rem 0.75rem;
		border: 0;
		border-block-start: var(--wa-border-width-s) solid var(--wa-color-surface-border);
		background: none;
		color: var(--wa-color-danger-on-quiet);
		font: inherit;
		font-size: 0.75rem;
		text-align: start;
		cursor: pointer;
	}

	.start {
		position: sticky;
		inset-block-end: 0;
		display: flex;
		justify-content: center;
		padding-block: 0.75rem;
	}
</style>
