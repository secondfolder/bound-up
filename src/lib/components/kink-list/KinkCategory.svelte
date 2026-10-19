<script lang="ts">
	import { customMatches, isAnswered, isShown } from '$lib/kink-list/answers';
	import { childrenOf, type KinkItem, relatedKinks } from '$lib/kink-list/catalog';
	import { kinkListContext, kinkListSearch } from '$lib/kink-list/context';
	import KinkRow from './KinkRow.svelte';

	/**
	 * One category, as a section of the one-page list that starts open and
	 * folds away: its kinks, any the person added to it, and the kinks that
	 * live in another category but fit here too.
	 *
	 * While the page is searched, it shows only what matches (`searchView`),
	 * and leaves out its related kinks, which are shown in their own category,
	 * and its count of kinks the filters hide, which the page gives for the
	 * search as a whole.
	 *
	 * There is no adding a kink of one's own any more: custom kinks already in
	 * a list, or brought in by an import, still show and can be removed. A way
	 * to suggest a kink for the catalogue is to come instead.
	 *
	 * Related kinks are behind a button rather than mixed in, so the category
	 * reads as the list it is. They answer exactly as in their own category:
	 * it is the same item, so the answer is the same answer.
	 */
	let { category }: { category: KinkItem } = $props();

	const { store } = kinkListContext();
	const id = $props.id();

	const search = kinkListSearch();
	const view = $derived(search?.view ?? null);

	/** What the filters show: what the count is of, search or no search. */
	const listed = $derived(childrenOf(category.id).filter((kink) => isShown(kink, store.filters)));
	const hidden = $derived(childrenOf(category.id).length - listed.length);
	const related = $derived(relatedKinks(category.id).filter((kink) => isShown(kink, store.filters)));
	const allCustom = $derived(store.customKinks(category.id));
	/** "3 of 12": how much of what is shown here is answered. */
	const answered = $derived(
		listed.filter((kink) => isAnswered(store.list.answers[kink.id])).length +
			allCustom.filter(([key]) => isAnswered(store.list.answers[key])).length
	);

	/** What is on screen: everything listed, or only what a search left of it. */
	const kinks = $derived(view ? listed.filter((kink) => view.shown.has(kink.id)) : listed);
	const custom = $derived(
		view ? allCustom.filter(([, kink]) => customMatches(kink.name, search?.query ?? '')) : allCustom
	);

	let showRelated = $state(false);
</script>

<!-- Open from the start, in the server's HTML too: `open` is safe in markup
     because it is never false here (AGENTS.md, on boolean properties). -->
<wa-details class="category" id="category-{category.id}" open>
	<span slot="summary" class="summary">
		<h3 id="{id}-title">{category.name}</h3>
		<span class="count">{answered} of {listed.length + allCustom.length}</span>
	</span>
	<p class="description">{category.description}</p>

	<div class="kinks">
		{#each kinks as kink (kink.id)}
			<KinkRow itemKey={kink.id} />
		{/each}
		{#each custom as [key] (key)}
			<div class="custom">
				<KinkRow itemKey={key} />
				<button type="button" class="link" onclick={() => store.removeCustom(key)}>
					Remove<span class="wa-visually-hidden">{store.list.custom[key]?.name}</span>
				</button>
			</div>
		{/each}
	</div>

	{#if hidden > 0 && !view}
		<p class="hidden-note">
			{hidden === 1 ? '1 more kink is' : `${hidden} more kinks are`} hidden by your level of detail.
		</p>
	{/if}

	{#if related.length > 0 && !view}
		<div class="actions">
			<!-- A disclosure: aria-expanded, which wa-button would not forward. -->
			<button
				type="button"
				class="link"
				aria-expanded={showRelated}
				aria-controls="{id}-related"
				onclick={() => {
					showRelated = !showRelated;
				}}
			>
				{showRelated ? 'Hide related kinks' : `${related.length} related kinks`}
			</button>
		</div>

		{#if showRelated}
			<div class="related" id="{id}-related">
				<p class="description">These live in another category, and fit here too. Answering one here answers it there.</p>
				{#each related as kink (kink.id)}
					<KinkRow itemKey={kink.id} />
				{/each}
			</div>
		{/if}
	{/if}
</wa-details>

<style>
	.category {
		&::part(header) {
			padding-block: 0.5rem;
		}

		&::part(content) {
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
			padding-block-start: 0;
		}
	}

	.summary {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		inline-size: 100%;

		h3 {
			margin: 0;
			font-size: 1.05rem;
		}
	}

	.count {
		font-size: 0.8125rem;
		color: var(--wa-color-text-quiet);
		white-space: nowrap;
	}

	.description,
	.hidden-note {
		margin: 0;
		font-size: 0.9rem;
		color: var(--wa-color-text-quiet);
	}

	/* The width KinkRow lays its two context columns out against. */
	.kinks,
	.related {
		display: flex;
		flex-direction: column;
		container: kinks / inline-size;
	}

	.custom {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.25rem;

		:global(.kink) {
			align-self: stretch;
		}
	}

	/* The last row's line goes, as in `KinkRow`, also when that row is a
	   custom kink, which is not the last child of its wrapper (Remove is). */
	.custom:last-child :global(.kink) {
		border-block-end: 0;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.25rem;
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
</style>
