<script lang="ts">
	import { resolve } from '$app/paths';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import RewardForm from '$lib/components/RewardForm.svelte';
	import { partnerName } from '$lib/partner-names.svelte';
	import { openedReward } from '$lib/sealed-views.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	/** What the viewer calls them, opened in the browser (`partner-names.svelte.ts`). */
	const partnerShown = $derived(partnerName(data.partner.names));
	const opened = $derived(openedReward(data.reward));
	/**
	 * The fields' starting values, taken once the reward is opened. Held rather
	 * than derived for the reason `RewardForm` gives: its fields start from
	 * these and are not held to them.
	 */
	let values = $state<{ title: string; description: string; cost: string; active: boolean } | null>(
		null
	);
	$effect(() => {
		if (values === null && opened) {
			values = {
				title: opened.title,
				description: opened.description ?? '',
				cost: String(data.reward.cost),
				active: data.reward.active
			};
		}
	});
	const backHref = $derived(
		resolve('/(auth-required)/(app)/partner/[id]/rewards', { id: data.partner.id })
	);
</script>

<section class="page">
	<NestedPageHeader
		{backHref}
		backLabel="Back to rewards"
		backText="Rewards"
		title={`Edit a reward for ${partnerShown}`}
		description="Use the same reward form here that creates a new partnership reward, but with the current values prefilled."
	/>

	<div class="content">
		{#if values}
			<RewardForm
				{values}
				sealScope={{ kind: 'partnership', partnershipId: data.partner.id }}
				reward={{ id: data.reward.id, revision: data.reward.revision }}
				submitLabel="Save reward"
			/>
		{:else if opened === null}
			<p class="quiet">This reward can't be shown on this device right now.</p>
		{:else}
			<p class="quiet">…</p>
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
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.quiet {
		color: var(--wa-color-text-quiet);
	}
</style>
