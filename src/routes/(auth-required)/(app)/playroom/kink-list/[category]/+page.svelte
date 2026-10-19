<script lang="ts">
	import KinkCategoryPage from '$lib/components/kink-list/KinkCategoryPage.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<KinkCategoryPage categoryId={data.categoryId} />
