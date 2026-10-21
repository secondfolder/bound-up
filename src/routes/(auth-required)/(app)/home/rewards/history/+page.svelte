<script lang="ts">
	import { resolve } from '$app/paths';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import RichText from '$lib/components/RichText.svelte';
	import { openedClaim, shownTitle } from '$lib/sealed-views.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const backHref = $derived(resolve('/(auth-required)/(app)/home/rewards'));

	/** Each row with its content opened, or a placeholder while it opens (`sealed-views.svelte.ts`). */
	const rows = $derived(
		data.selfRewards.claims.map((claim) => ({ claim, content: openedClaim(claim) }))
	);
</script>

<section class="page">
	<NestedPageHeader
		{backHref}
		backLabel="Back to rewards"
		backText="Rewards"
		title="Self reward history"
		description="Each claim keeps the title and cost it had when you redeemed it."
	/>

	<div class="content">
		<section class="panel">
			<h2>Claim history</h2>
			{#if data.selfRewards.claims.length === 0}
				<p class="empty">Nothing claimed yet.</p>
			{:else}
				<ul class="history-list">
					{#each rows as { claim, content } (claim.id)}
						<li>
							<strong>{shownTitle(content)}</strong>
							<span>{claim.rewardCost} credits</span>
							{#if content?.description}
								<div class="description"><RichText text={content.description} /></div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
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

	h2 {
		margin: 0;
	}

	.empty {
		color: var(--wa-color-text-quiet);
	}

	.panel {
		border: 1px solid var(--wa-color-surface-border);
		border-radius: var(--wa-panel-border-radius);
		padding: var(--wa-space-l);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.history-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.history-list li {
		border: 1px solid color-mix(in srgb, var(--wa-color-surface-border) 75%, transparent);
		border-radius: 0.75rem;
		padding: 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
</style>
