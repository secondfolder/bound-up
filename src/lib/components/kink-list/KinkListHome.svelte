<script lang="ts">
	import type { Snippet } from 'svelte';
	import { adopted } from '$lib/kink-list/adopted.svelte';
	import { catalog, categories, searchKinks } from '$lib/kink-list/catalog';
	import { kinkListContext } from '$lib/kink-list/context';
	import KinkCategory from './KinkCategory.svelte';
	import KinkRow from './KinkRow.svelte';
	import LevelKey from './LevelKey.svelte';
	import ListFilters from './ListFilters.svelte';
	import SaveStatus from './SaveStatus.svelte';
	import ShareLink from './ShareLink.svelte';
	import YourSideControl from './YourSideControl.svelte';

	/**
	 * The whole kink list on one page: search, the filters, and every category
	 * by section, each a section that starts open and folds away, with its
	 * kinks one to a line. The key to the answer dots and "Your side" stay
	 * pinned above it while it scrolls.
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

	let sectionsEl: HTMLElement | undefined = $state();

	/** Opens or folds every category at once. Not stored: each visit starts open. */
	function setAllOpen(open: boolean) {
		for (const details of sectionsEl?.querySelectorAll<HTMLElement & { open: boolean }>(
			'wa-details.category'
		) ?? []) {
			details.open = open;
		}
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
		<ListFilters />
	</div>

	<div class="pinned">
		<LevelKey />
		<div class="pinned-row">
			<YourSideControl />
			{#if !query.trim()}
				<span class="fold">
					<button type="button" class="link" onclick={() => setAllOpen(true)}>Expand all</button>
					<button type="button" class="link" onclick={() => setAllOpen(false)}>Collapse all</button>
				</span>
			{/if}
		</div>
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

		<div class="sections" bind:this={sectionsEl}>
			{#each Object.entries(catalog.sections) as [section, title] (section)}
				<section class="section" aria-labelledby="section-{section}">
					<h2 id="section-{section}">{title}</h2>
					{#each categories(section) as category (category.id)}
						<KinkCategory {category} />
					{/each}
				</section>
			{/each}
		</div>
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
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	/* Pinned to the top of whatever scrolls: the app shell's <main>, or the
	   window on the public list. Opaque, so rows scrolling under it don't
	   show through. */
	.pinned {
		position: sticky;
		inset-block-start: 0;
		z-index: 1;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		/* Out over the page's gutters, so rows scrolling under it are hidden
		   edge to edge rather than showing at its sides. */
		margin-inline: -1rem;
		padding: 0.5rem 1rem;
		background: var(--wa-color-surface-lowered);
		border-block-end: var(--wa-border-width-s) solid var(--wa-color-surface-border);
	}

	.pinned-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.375rem 1rem;
	}

	.fold {
		display: flex;
		gap: 0.75rem;
		font-size: 0.875rem;
	}

	.link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--wa-color-brand-on-quiet);
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}

	.sections {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.results,
	.section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;

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
</style>
