<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { enhance } from '$app/forms';
	import ItemCard from '$lib/components/ItemCard.svelte';
	import RichText from '$lib/components/RichText.svelte';
	import { creditsLabel, rewardClaimStatus } from '$lib/credits';
	import { ItemAction } from '$lib/item-action.svelte';
	import { openedReward, shownTitle } from '$lib/sealed-views.svelte';
	import type { PartnershipRewardView, SelfRewardView } from '$lib/types';

	type RewardView = SelfRewardView | PartnershipRewardView;
	type EditHrefBuilder = ((rewardId: string) => string) | null;

	let {
		rewards,
		emptyMessage,
		claimAction,
		claimPartnershipId = null,
		editHref = null,
		showClaimUi = true,
		balance = null
	}: {
		rewards: RewardView[];
		emptyMessage: string;
		claimAction: string;
		claimPartnershipId?: string | null;
		editHref?: EditHrefBuilder;
		showClaimUi?: boolean;
		/**
		 * The credits the viewer can spend on these rewards, so an unaffordable
		 * one can say how far off it is. Null where that is not known.
		 */
		balance?: number | null;
	} = $props();

	function rewardCreatedByMe(reward: RewardView): boolean {
		return 'createdByMe' in reward ? reward.createdByMe : false;
	}

	/** Each row with its content opened, or a placeholder while it opens (`sealed-views.svelte.ts`). */
	const rows = $derived(rewards.map((reward) => ({ reward, content: openedReward(reward) })));

	const claiming = new ItemAction();

	/**
	 * Rewards that have just come within reach while this list was on screen —
	 * the balance was edited up, say — whose Claim button glows once to say so.
	 *
	 * Only a change is marked. Every claimable reward glowing as the page
	 * loads would be noise, and would make the glow mean nothing.
	 */
	const glowing = new SvelteSet<string>();
	const wasClaimable = new Map<string, boolean>();
	$effect(() => {
		for (const { id, canClaim } of rewards) {
			if (wasClaimable.get(id) === false && canClaim) {
				untrack(() => glowing.add(id));
				setTimeout(() => glowing.delete(id), 1200);
			}
			wasClaimable.set(id, canClaim);
		}
	});
</script>

{#if rewards.length === 0}
	<p class="empty">{emptyMessage}</p>
{:else}
	<ul class="reward-list">
		{#each rows as { reward, content } (reward.id)}
			{const claimable = $derived(showClaimUi && !rewardCreatedByMe(reward))}
			{const status = $derived(claimable ? rewardClaimStatus(reward, balance) : null)}
			<li>
				<ItemCard
					title={shownTitle(content)}
					inactive={!reward.active}
					celebrating={claiming.celebrating === reward.id}
					actions={claimable || editHref ? rewardActions : undefined}
					status={status ? claimStatus : undefined}
				>
					{#snippet value()}{creditsLabel(reward.cost)}{/snippet}

					{#if content?.description}<RichText text={content.description} />{/if}
				</ItemCard>
			</li>

			{#snippet claimStatus()}
				<p>{status}</p>
			{/snippet}

			{#snippet rewardActions()}
				{#if claimable}
					<form
						method="POST"
						action={claimAction}
						class="claim-form"
						use:enhance={claiming.enhance(reward.id)}
					>
						{#if claimPartnershipId}
							<input type="hidden" name="partnershipId" value={claimPartnershipId} />
						{/if}
						<input type="hidden" name="rewardId" value={reward.id} />
						<!-- Amber only when it can be claimed: a claim the balance does not
						     cover stays a quiet outline, with the shortfall said beside it. -->
						<wa-button
							type="submit"
							class:glow={glowing.has(reward.id)}
							variant={reward.canClaim ? 'brand' : 'neutral'}
							appearance={reward.canClaim ? 'accent' : 'outlined'}
							disabled={!reward.canClaim || claiming.waiting(reward.id)}
						>
							{#if claiming.celebrating === reward.id}
								<wa-icon class="done" name="gift" variant="solid" label="Claimed"></wa-icon>
							{:else}
								Claim
							{/if}
						</wa-button>
					</form>
				{/if}
				{#if editHref}
					<!-- The title is in the name, so a list of cards is not a list of
					     links all called "Edit". -->
					<wa-button appearance="outlined" href={editHref(reward.id)}
						>Edit <span class="wa-visually-hidden">{shownTitle(content)}</span></wa-button
					>
				{/if}
			{/snippet}
		{/each}
	</ul>
{/if}

<style>
	p {
		margin: 0;
	}

	.reward-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.empty {
		color: var(--wa-color-text-quiet);
	}

	@media (prefers-reduced-motion: no-preference) {
		.glow {
			border-radius: var(--wa-form-control-border-radius);
			animation: glow 1200ms ease-out;
		}

		.done {
			animation: pop 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
		}
	}

	@keyframes glow {
		30% {
			box-shadow: 0 0 0 0.375rem var(--wa-color-brand-fill-normal);
		}
	}

	@keyframes pop {
		from {
			transform: scale(0.8);
		}
	}
</style>
