<script lang="ts">
	import { kinkById } from '$lib/kink-list/catalog';
	import { kinkListContext } from '$lib/kink-list/context';
	import KinkCategory from './KinkCategory.svelte';
	import SaveStatus from './SaveStatus.svelte';

	/** A category's page, signed in or not: back to the whole list, the save status, and the category. */
	let { categoryId }: { categoryId: string } = $props();

	const { paths } = kinkListContext();
	const category = $derived(kinkById(categoryId));
</script>

<svelte:head>
	<title>{category?.name ?? 'Kink list'} · Kink list · Bound Up</title>
</svelte:head>

<nav class="crumbs">
	<a href={paths.home}>All categories</a>
	<SaveStatus />
</nav>
{#if category}
	<KinkCategory {category} />
{/if}

<style>
	.crumbs {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 1rem;
		margin-block-end: 1rem;
	}
</style>
