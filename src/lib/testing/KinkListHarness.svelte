<script lang="ts">
	import Deck from '$lib/components/kink-list/Deck.svelte';
	import KinkCategory from '$lib/components/kink-list/KinkCategory.svelte';
	import KinkListHome from '$lib/components/kink-list/KinkListHome.svelte';
	import KinkRow from '$lib/components/kink-list/KinkRow.svelte';
	import ListFilters from '$lib/components/kink-list/ListFilters.svelte';
	import YourSideControl from '$lib/components/kink-list/YourSideControl.svelte';
	import { kinkById } from '$lib/kink-list/catalog';
	import { setKinkListContext } from '$lib/kink-list/context';
	import type { KinkListStore } from '$lib/kink-list/store.svelte';

	/**
	 * A kink-list screen needs its store and paths from a layout's context,
	 * which a bare component render has none of. This is that layout, for the
	 * component tests: one row, one whole category, the quick-fill deck, or the
	 * whole page (`home`), with the filters and "Answer as" above it when
	 * `controls` is set.
	 */
	let {
		store,
		itemKey,
		categoryId,
		deck = false,
		home = false,
		controls = false,
		ondone = () => undefined
	}: {
		store: KinkListStore;
		itemKey?: string;
		categoryId?: string;
		deck?: boolean;
		home?: boolean;
		controls?: boolean;
		ondone?: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	setKinkListContext({
		store,
		paths: {
			home: '/kink-list',
			quick: '/kink-list/quick',
			transfer: '/kink-list/transfer'
		}
	});

	const category = $derived(categoryId ? kinkById(categoryId) : undefined);
</script>

{#if controls}
	<ListFilters />
	<YourSideControl />
{/if}
{#if home}
	<KinkListHome />
{:else if deck}
	<Deck {ondone} />
{:else if itemKey}
	<KinkRow {itemKey} />
{:else if category}
	<KinkCategory {category} />
{/if}
