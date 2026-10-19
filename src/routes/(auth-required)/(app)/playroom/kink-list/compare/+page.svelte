<script lang="ts">
	import { onMount } from 'svelte';
	import CompareView from '$lib/components/kink-list/CompareView.svelte';
	import { kinkListContext } from '$lib/kink-list/context';
	import { decodeShareLink, type SharedList } from '$lib/kink-list/share-link';
	import { PENDING_TEXT } from '$lib/sealed-views.svelte';

	/**
	 * Your own list against one someone shared as a link. The shared list
	 * comes in the fragment (`#k1.…`) and is read here; it never reaches the
	 * server. See docs/kink-list.md, "Comparing".
	 */
	const { store, paths } = kinkListContext();

	let shared = $state<SharedList | null | undefined>(undefined);

	onMount(() => {
		void decodeShareLink(location.hash).then((result) => {
			shared = result;
		});
	});
</script>

<svelte:head>
	<title>Compare · Kink list · Bound Up</title>
</svelte:head>

<nav class="crumbs"><a href={paths.home}>Your list</a></nav>

{#if shared === undefined}
	<p class="quiet" aria-busy="true">{PENDING_TEXT}</p>
{:else if shared === null}
	<h1>Compare</h1>
	<p>
		There's no list to compare with here. Open someone's shared link and choose "Compare with
		mine".
	</p>
{:else}
	<h1>You and {shared.name?.trim() || 'them'}</h1>
	<CompareView
		mine={store.list}
		theirs={shared.list}
		theirName={shared.name}
		side={store.filters.side}
	/>
{/if}

<style>
	h1 {
		text-align: center;
	}

	.crumbs {
		margin-block-end: 1rem;
	}

	.quiet {
		text-align: center;
		color: var(--wa-color-text-quiet);
	}
</style>
