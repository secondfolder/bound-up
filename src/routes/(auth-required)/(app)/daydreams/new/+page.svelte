<script lang="ts">
	import { resolve } from '$app/paths';
	import DaydreamSetupForm from '$lib/components/DaydreamSetupForm.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<section class="page">
	<NestedPageHeader
		backHref={resolve('/(auth-required)/(app)/daydreams')}
		backLabel="Back to daydreams"
		backText="Daydreams"
		title="New daydream"
		description="How it's told, who's in it, and what happens. You can change any of it later."
	/>

	<div class="content">
		<DaydreamSetupForm
			setupForm={data.setupForm}
			library={data.library}
			suggestionsOn={data.accepted && data.available}
			submitLabel="Start daydreaming"
		/>
	</div>
</section>

<style>
	.page {
		max-width: 48rem;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.content {
		padding: 0 var(--wa-space-l) var(--wa-space-l);
	}
</style>
