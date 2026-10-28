<script lang="ts">
	import EmptyState from '$lib/components/EmptyState.svelte';
	import GuidesList from '$lib/components/GuidesList.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let { data } = $props();
	let { guides } = $derived(data);
</script>

<!-- The header of the app's top-level pages: reached from Today's card, but
     no "‹ Today" back link, which the bottom nav already is (as on Tasks &
     Rewards, the notebook and messages). -->
<section class="page">
	<PageHeader title="Guides" />

	<div class="content">
		{#if guides.length > 0}
			<GuidesList {guides} />
		{:else}
			<EmptyState icon="book-open" title="No guides yet.">
				<p>New guides will appear here as they are added.</p>
			</EmptyState>
		{/if}
	</div>
</section>

<style>
	.page {
		max-width: var(--page-width);
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.content {
		padding: 0 var(--page-gutter) var(--wa-space-l);
	}
</style>
