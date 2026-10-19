<script lang="ts">
	import Deck from '$lib/components/kink-list/Deck.svelte';
	import KinkCategory from '$lib/components/kink-list/KinkCategory.svelte';
	import KinkRow from '$lib/components/kink-list/KinkRow.svelte';
	import { kinkById } from '$lib/kink-list/catalog';
	import { setKinkListContext } from '$lib/kink-list/context';
	import type { KinkListStore } from '$lib/kink-list/store.svelte';

	/**
	 * A kink-list screen needs its store and paths from a layout's context,
	 * which a bare component render has none of. This is that layout, for the
	 * component tests: one row, one whole category, or the quick-fill deck.
	 */
	let {
		store,
		itemKey,
		categoryId,
		deck = false,
		ondone = () => undefined
	}: {
		store: KinkListStore;
		itemKey?: string;
		categoryId?: string;
		deck?: boolean;
		ondone?: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	setKinkListContext({
		store,
		paths: {
			home: '/kink-list',
			category: (id) => `/kink-list/${id}`,
			quick: '/kink-list/quick',
			transfer: '/kink-list/transfer'
		}
	});

	const category = $derived(categoryId ? kinkById(categoryId) : undefined);
</script>

{#if deck}
	<Deck {ondone} />
{:else if itemKey}
	<KinkRow {itemKey} />
{:else if category}
	<KinkCategory {category} />
{/if}
