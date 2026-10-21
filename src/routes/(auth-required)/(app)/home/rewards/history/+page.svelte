<script lang="ts">
	import { resolve } from '$app/paths';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import RewardClaimList from '$lib/components/RewardClaimList.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const backHref = $derived(resolve('/(auth-required)/(app)/home/rewards'));
</script>

<section class="page">
	<NestedPageHeader
		{backHref}
		backLabel="Back to rewards"
		backText="Rewards"
		title="Your reward history"
		description="Each claim keeps the title and cost the reward had when you claimed it."
	/>

	<!-- No heading or panel of its own: see /home/tasks/history. -->
	<div class="content">
		<RewardClaimList claims={data.selfRewards.claims} />
	</div>
</section>

<style>
	.page {
		max-width: var(--page-width-narrow);
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.content {
		padding: 0 var(--page-gutter) var(--wa-space-l);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
</style>
