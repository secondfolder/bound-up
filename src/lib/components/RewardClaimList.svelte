<script lang="ts">
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ItemCard from '$lib/components/ItemCard.svelte';
	import RichText from '$lib/components/RichText.svelte';
	import { creditsLabel } from '$lib/credits';
	import { openedClaim, shownTitle } from '$lib/sealed-views.svelte';
	import type { PartnershipRewardClaimView, RewardHistoryView } from '$lib/types';

	/**
	 * A reward claim history: the self one and the partnership one, which used
	 * to be two hand-built lists with corners and padding of their own. Each
	 * claim is the same card a reward is, so a claim reads as the reward it was.
	 */
	let { claims }: { claims: (RewardHistoryView | PartnershipRewardClaimView)[] } = $props();

	function formatDateTime(date: Date): string {
		return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
			date
		);
	}

	function isPartnershipClaim(
		claim: RewardHistoryView | PartnershipRewardClaimView
	): claim is PartnershipRewardClaimView {
		return 'mine' in claim;
	}

	/** Each row with its content opened, or a placeholder while it opens (`sealed-views.svelte.ts`). */
	const rows = $derived(claims.map((claim) => ({ claim, content: openedClaim(claim) })));
</script>

{#if claims.length === 0}
	<EmptyState icon="gift" title="Nothing claimed yet.">
		<p>Each reward claimed shows up here, with what it cost at the time.</p>
	</EmptyState>
{:else}
	<ul class="history-list">
		{#each rows as { claim, content } (claim.id)}
			<li>
				<ItemCard title={shownTitle(content)}>
					{#snippet meta()}
						<p>
							{formatDateTime(claim.createdAt)}
							{#if isPartnershipClaim(claim)}
								· {claim.mine ? 'Claimed by you' : 'Claimed by them'}
							{/if}
						</p>
					{/snippet}
					{#snippet value()}{creditsLabel(claim.rewardCost)}{/snippet}

					{#if content?.description}<RichText text={content.description} />{/if}
				</ItemCard>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.history-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	p {
		margin: 0;
	}
</style>
