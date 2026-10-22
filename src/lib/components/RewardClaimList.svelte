<script lang="ts">
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ItemGroup from '$lib/components/ItemGroup.svelte';
	import ItemRow from '$lib/components/ItemRow.svelte';
	import { groupByDay, timeOfDay } from '$lib/day-groups';
	import { openedClaim, shownTitle } from '$lib/sealed-views.svelte';
	import type { PartnershipRewardClaimView, RewardHistoryView } from '$lib/types';

	/**
	 * A reward claim history, self or partnership: a line per claim under the
	 * day it was made, with what it cost at the time, as the task history is.
	 */
	let { claims }: { claims: (RewardHistoryView | PartnershipRewardClaimView)[] } = $props();

	function isPartnershipClaim(
		claim: RewardHistoryView | PartnershipRewardClaimView
	): claim is PartnershipRewardClaimView {
		return 'mine' in claim;
	}

	/** Each row with its content opened, or a placeholder while it opens (`sealed-views.svelte.ts`). */
	const days = $derived(
		groupByDay(
			claims.map((claim) => ({ claim, content: openedClaim(claim) })),
			(row) => row.claim.createdAt
		)
	);
</script>

{#if claims.length === 0}
	<EmptyState icon="gift" title="Nothing claimed yet.">
		<p>Each reward claimed shows up here, with what it cost at the time.</p>
	</EmptyState>
{:else}
	<div class="days">
		{#each days as day (day.key)}
			<ItemGroup title={day.label}>
				{#each day.items as { claim, content } (claim.id)}
					<ItemRow title={shownTitle(content)}>
						{#snippet meta()}
							<span>{timeOfDay(claim.createdAt)}</span>
							{#if isPartnershipClaim(claim)}
								<span>{claim.mine ? 'Claimed by you' : 'Claimed by them'}</span>
							{/if}
						{/snippet}
						{#snippet trailing()}
							<span class="cost">
								−{claim.rewardCost}<span class="wa-visually-hidden"
									>{' '}credit{claim.rewardCost === 1 ? '' : 's'}</span
								>
							</span>
						{/snippet}
					</ItemRow>
				{/each}
			</ItemGroup>
		{/each}
	</div>
{/if}

<style>
	.days {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-l);
	}

	.cost {
		color: var(--wa-color-text-quiet);
	}
</style>
