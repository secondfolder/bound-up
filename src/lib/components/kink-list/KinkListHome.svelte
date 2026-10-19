<script lang="ts">
	import type { Snippet } from 'svelte';
	import { adopted } from '$lib/kink-list/adopted.svelte';
	import { isAnswered } from '$lib/kink-list/answers';
	import {
		catalog,
		categories,
		childrenOf,
		type KinkItem,
		searchKinks
	} from '$lib/kink-list/catalog';
	import { kinkListContext } from '$lib/kink-list/context';
	import IntensitySetting from './IntensitySetting.svelte';
	import KinkRow from './KinkRow.svelte';
	import SaveStatus from './SaveStatus.svelte';
	import ShareLink from './ShareLink.svelte';

	/**
	 * The kink list's front page: search, how intense a list to show, and
	 * every category by section with how much of it is answered. Each
	 * category opens a page of its own.
	 */
	let {
		intro,
		title = 'Kink list',
		minimal = false
	}: {
		intro?: Snippet;
		title?: string;
		/** A partner's view: the list, without quick fill, sharing a link, or import. */
		minimal?: boolean;
	} = $props();

	const { store, paths } = kinkListContext();

	const SEARCH_LIMIT = 30;

	type WaField = HTMLElement & { value: string | null };
	let query = $state('');
	const results = $derived(searchKinks(query).slice(0, SEARCH_LIMIT));
	const customResults = $derived(
		query.trim()
			? store
					.customKinks()
					.filter(([, kink]) => kink.name.toLowerCase().includes(query.trim().toLowerCase()))
			: []
	);

	/** Wired by hand: a wa-input's input happens in its shadow root (AGENTS.md). */
	function searchField(node: WaField) {
		const onInput = () => {
			query = node.value ?? '';
		};
		node.addEventListener('input', onInput);
		return () => node.removeEventListener('input', onInput);
	}

	/** "3 of 12": how much of a category is answered, within the intensity setting. */
	function progress(category: KinkItem): string {
		const kinks = childrenOf(category.id).filter(
			(kink) => kink.intensity <= store.list.settings.maxIntensity
		);
		const custom = store.customKinks(category.id);
		const answered =
			kinks.filter((kink) => isAnswered(store.list.answers[kink.id])).length +
			custom.filter(([key]) => isAnswered(store.list.answers[key])).length;
		return `${answered} of ${kinks.length + custom.length}`;
	}
</script>

<div class="home">
	<header>
		<h1>{title}</h1>
		<SaveStatus />
	</header>
	{@render intro?.()}

	{#if store.kind === 'account' && !minimal && adopted.count > 0}
		<wa-callout variant="success" appearance="outlined">
			<wa-icon slot="icon" name="circle-check" variant="solid"></wa-icon>
			Added {adopted.count === 1 ? 'the answer' : `the ${adopted.count} answers`} saved on this device to
			your list.
		</wa-callout>
	{/if}

	{#if !minimal}
		<wa-button class="quick" variant="brand" appearance="accent" href={paths.quick}>
			<wa-icon slot="start" name="layer-group" variant="solid"></wa-icon>
			Quick fill
		</wa-button>
	{/if}

	<div class="controls">
		<wa-input
			type="search"
			label="Search"
			placeholder="Try “fellatio”, “CNC” or “ropes”"
			with-clear
			{@attach searchField}
		></wa-input>
		<IntensitySetting />
	</div>

	{#if query.trim()}
		<section class="results" aria-label="Search results">
			{#if results.length === 0 && customResults.length === 0}
				<p class="quiet">Nothing matches “{query.trim()}”. You can add it yourself in any category.</p>
			{/if}
			{#each results as kink (kink.id)}
				<KinkRow itemKey={kink.id} />
			{/each}
			{#each customResults as [key] (key)}
				<KinkRow itemKey={key} />
			{/each}
		</section>
	{:else}
		{#if !minimal}
			<wa-details summary="Share a link to your list">
				<ShareLink />
			</wa-details>
			<p class="transfer"><a href={paths.transfer}>Import or export your list</a></p>
			{#if paths.history}
				<p class="transfer"><a href={paths.history}>See how your list has changed</a></p>
			{/if}
		{/if}

		{#each Object.entries(catalog.sections) as [section, title] (section)}
			<section class="section" aria-labelledby="section-{section}">
				<h2 id="section-{section}">{title}</h2>
				<ul class="categories">
					{#each categories(section) as category (category.id)}
						<li>
							<a href={paths.category(category.id)}>
								<span class="name">{category.name}</span>
								<span class="count">{progress(category)}</span>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	{/if}
</div>

<style>
	.home {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	header {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;

		h1 {
			margin: 0;
		}
	}

	.quick {
		align-self: center;
	}

	.controls {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.75rem;

		@media (min-width: 600px) {
			grid-template-columns: 2fr 1fr;
		}
	}

	.results,
	.section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;

		h2 {
			margin: 0;
			font-size: 1.15rem;
		}
	}

	.quiet {
		color: var(--wa-color-text-quiet);
	}

	.transfer {
		margin: 0;
	}

	.categories {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: 0.5rem;

		/* Web Awesome's native styles indent every <li> for its marker; a
		   grid of cards has none. */
		li {
			margin: 0;
		}

		a {
			display: flex;
			justify-content: space-between;
			align-items: baseline;
			gap: 0.5rem;
			padding: 0.75rem 1rem;
			border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
			border-radius: var(--wa-border-radius-l);
			background: var(--wa-color-surface-default);
			color: inherit;
			text-decoration: none;

			&:hover,
			&:focus-visible {
				border-color: var(--wa-color-brand-border-loud);
			}
		}

		.count {
			font-size: 0.8125rem;
			color: var(--wa-color-text-quiet);
			white-space: nowrap;
		}
	}
</style>
