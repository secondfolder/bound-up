<script lang="ts">
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import GuidesList from '$lib/components/GuidesList.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';

	let { data } = $props();
	let { guides } = $derived(data);
</script>

<!-- The same header as every other page under Home, with its way back: this
     was the one that had none, a centred title alone over the wash. -->
<section class="page">
	<NestedPageHeader
		backHref={resolve('/(auth-required)/(app)/home')}
		backLabel="Back to home"
		backText="Home"
		title="Guides"
		description="Step-by-step guides to work through at your own pace."
	/>

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
