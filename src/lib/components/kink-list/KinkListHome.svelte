<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tick } from 'svelte';
	import { adopted } from '$lib/kink-list/adopted.svelte';
	import { customMatches, searchView } from '$lib/kink-list/answers';
	import { catalog, categories, childrenOf, type KinkItem } from '$lib/kink-list/catalog';
	import { kinkListContext, setKinkListSearch } from '$lib/kink-list/context';
	import KinkCategory from './KinkCategory.svelte';
	import LevelKey from './LevelKey.svelte';
	import ListFilters from './ListFilters.svelte';
	import SaveStatus from './SaveStatus.svelte';
	import ShareLink from './ShareLink.svelte';
	import YourSideControl from './YourSideControl.svelte';

	/**
	 * The whole kink list on one page: search, the filters, and every category
	 * by section, each a section that starts open and folds away, with its
	 * kinks one to a line. The key to the answer dots and "Answer as" stay
	 * pinned above it while it scrolls.
	 *
	 * Search narrows the list as the filters do, rather than replacing it with
	 * a list of results: what matches stays in its category, under its kink,
	 * so it is seen where it lives (`searchView`). Matches the filters hide
	 * are counted, so a search that seems to find nothing says why.
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

	type WaField = HTMLElement & { value: string | null };
	let query = $state('');
	const searching = $derived(query.trim() !== '');
	const view = $derived(searchView(query, store.filters));
	setKinkListSearch({
		get query() {
			return query;
		},
		get view() {
			return view;
		}
	});

	/** Whether a category has anything to show for the search, or anything at all with none. */
	function hasMatches(category: KinkItem): boolean {
		if (!view) {
			return true;
		}
		return (
			childrenOf(category.id).some((kink) => view.shown.has(kink.id)) ||
			store.customKinks(category.id).some(([, kink]) => customMatches(kink.name, query))
		);
	}

	const sections = $derived(
		Object.entries(catalog.sections)
			.map(([section, heading]) => ({
				section,
				heading,
				categories: categories(section).filter(hasMatches)
			}))
			.filter((entry) => entry.categories.length > 0)
	);

	/** A search opens every category, so no match sits folded away in one closed earlier. */
	$effect(() => {
		if (searching) {
			tick().then(() => setAllOpen(true));
		}
	});

	/** Wired by hand: a wa-input's input happens in its shadow root (AGENTS.md). */
	function searchField(node: WaField) {
		const onInput = () => {
			query = node.value ?? '';
		};
		node.addEventListener('input', onInput);
		return () => node.removeEventListener('input', onInput);
	}

	let sectionsEl: HTMLElement | undefined = $state();
	let sharing = $state(false);

	/**
	 * Whether the pinned bar is stuck at the top: it takes a background only
	 * then, so above the list it sits on the page like the controls around it.
	 * Watched with a sentinel just above it, which has scrolled out of sight
	 * exactly when the bar has stuck. The viewport is the root for both
	 * shells: the app shell's <main> scrolls inside it, starting at its top.
	 */
	let stuck = $state(false);
	function watchStuck(sentinel: HTMLElement) {
		const observer = new IntersectionObserver(([entry]) => {
			stuck = entry !== undefined && !entry.isIntersecting && entry.boundingClientRect.top < 0;
		});
		observer.observe(sentinel);
		return () => observer.disconnect();
	}

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

	{#if !minimal}
		<div class="more">
			<wa-button size="s" variant="brand" appearance="accent" href={paths.quick}>
				<wa-icon slot="start" name="layer-group" variant="solid"></wa-icon>
				Quick fill
			</wa-button>
			<!-- svelte-ignore a11y_click_events_have_key_events,a11y_no_static_element_interactions -->
			<wa-button
				size="s"
				appearance="outlined"
				onclick={() => {
					sharing = true;
				}}
			>
				<wa-icon slot="start" name="share-nodes" variant="solid"></wa-icon>
				Share
			</wa-button>
			<wa-button size="s" appearance="outlined" href={paths.transfer}>
				<wa-icon slot="start" name="file-export" variant="solid"></wa-icon>
				Import or export
			</wa-button>
			{#if paths.history}
				<wa-button size="s" appearance="outlined" href={paths.history}>
					<wa-icon slot="start" name="clock-rotate-left" variant="solid"></wa-icon>
					History
				</wa-button>
			{/if}
		</div>
		{#if sharing}
			<!-- Mounted only while open, so it starts fresh each time and its
			     `open` is never false in markup (AGENTS.md, boolean properties). -->
			<wa-dialog
				label="Share a link to your list"
				open
				onwa-after-hide={() => {
					sharing = false;
				}}
			>
				<ShareLink />
			</wa-dialog>
		{/if}
	{/if}

	<div class="sentinel" aria-hidden="true" {@attach watchStuck}></div>
	<div class="pinned" class:stuck={stuck}>
		<LevelKey />
		<div class="pinned-row">
			<YourSideControl />
			<span class="fold">
				<button type="button" class="link" onclick={() => setAllOpen(true)}>Expand all</button>
				<button type="button" class="link" onclick={() => setAllOpen(false)}>Collapse all</button>
			</span>
		</div>
	</div>

	<!-- Said as the search changes, so a screen reader hears what it left. -->
	<div class="search-notes" aria-live="polite">
		{#if view}
			{#if sections.length === 0}
				<p class="quiet">Nothing{view.hidden > 0 ? ' shown' : ''} matches “{query.trim()}”.</p>
			{/if}
			{#if view.hidden > 0}
				<p class="quiet">
					{view.hidden === 1 ? '1 kink matches' : `${view.hidden} kinks match`} but
					{view.hidden === 1 ? 'is' : 'are'} hidden by your intensity and rareness filters.
				</p>
			{/if}
		{/if}
	</div>

	<div class="sections" bind:this={sectionsEl}>
		{#each sections as { section, heading, categories: shown } (section)}
			<section class="section" aria-labelledby="section-{section}">
				<h2 id="section-{section}">{heading}</h2>
				{#each shown as category (category.id)}
					<KinkCategory {category} />
				{/each}
			</section>
		{/each}
	</div>
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

	/* The search and the two filters on one row when there is room for them;
	   the filters wrap under it when there is not. */
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.75rem 1.5rem;

		wa-input {
			flex: 1 1 14rem;
		}
	}

	.more {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	/* Zero height: only where it is matters (`watchStuck`). */
	.sentinel {
		block-size: 0;
		margin-block-end: -1.25rem;
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
		padding-block: 0.5rem;

		/* The background it takes once stuck, from one edge of the page to the
		   other rather than only the column's width, so rows scrolling under it
		   are hidden right across. A border-image outset reaches out that far
		   without widening what the page scrolls over, which a wide box would.
		   Opaque, so nothing shows through, and faded in quickly. */
		&::before {
			content: '';
			position: absolute;
			inset: 0;
			z-index: -1;
			border-image-source: linear-gradient(var(--wa-color-surface-lowered) 0 0);
			border-image-slice: 0 fill;
			border-image-outset: 0 100vw;
			opacity: 0;
			transition: opacity 150ms ease-out;
			pointer-events: none;
		}

		&.stuck::before {
			opacity: 1;
		}

		@media (prefers-reduced-motion: reduce) {
			&::before {
				transition: none;
			}
		}
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

	.search-notes:empty {
		display: none;
	}

	.search-notes p {
		margin: 0;
	}

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
</style>
