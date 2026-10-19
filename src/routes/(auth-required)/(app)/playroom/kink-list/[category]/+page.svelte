<script lang="ts">
	import KinkCategory from '$lib/components/kink-list/KinkCategory.svelte';
	import SaveStatus from '$lib/components/kink-list/SaveStatus.svelte';
	import { kinkById } from '$lib/kink-list/catalog';
	import { kinkListContext } from '$lib/kink-list/context';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const { paths } = kinkListContext();
	const category = $derived(kinkById(data.categoryId));
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
