<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import CreditBalances from '$lib/components/CreditBalances.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import QuickAddLink from '$lib/components/QuickAddLink.svelte';
	import RewardWallet from '$lib/components/RewardWallet.svelte';
	import { partnerName } from '$lib/partner-names.svelte';
	import type { RewardEntry } from '$lib/reward-list';
	import type { ActionData, LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	/**
	 * The page's action result, read from `page` because a layout is not handed
	 * `form`: the list lives here so the add, edit and history sheets (child
	 * routes) open over it.
	 */
	const form = $derived(page.form as ActionData | null | undefined);
	const backHref = $derived(resolve('/(auth-required)/(app)/home'));
	const historyHref = $derived(resolve('/(auth-required)/(app)/home/rewards/history'));
	const addHref = $derived(resolve('/(auth-required)/(app)/home/rewards/add'));

	const ownEntries: RewardEntry[] = $derived(
		data.selfRewards.rewards.map((reward) => ({
			reward,
			claimAction: '?/selfClaimReward',
			editHref: resolve('/(auth-required)/(app)/home/rewards/[rewardId]', { rewardId: reward.id })
		}))
	);

	/**
	 * A wallet per balance — yours, then one per partner — rather than one list:
	 * each reward is paid from exactly one of them, and a merged list would hide
	 * which a cost comes out of.
	 */
	const partnerWallets = $derived(
		data.partnerRewards.map((section) => {
			const name = partnerName(section.names);
			const listHref = resolve('/(auth-required)/(app)/partner/[id]/rewards', {
				id: section.partnershipId
			});
			return {
				section,
				name,
				entries: section.rewards.map(
					(reward): RewardEntry => ({
						reward,
						claimAction: '?/partnerClaimReward',
						partnershipId: section.partnershipId,
						listHref,
						listOwner: name
					})
				)
			};
		})
	);

	/**
	 * Each balance as a pill, as the tasks pages show them: the viewer's own,
	 * which they may set, and theirs with each partner, which they spend here.
	 */
	const balances = $derived([
		{
			key: 'self',
			label: 'Yours',
			credits: data.selfRewards.credits,
			editable: {
				action: '?/selfSetCredits',
				inputLabel: 'Set your reward credits',
				editLabel: 'Edit your reward credits',
				saveLabel: 'Save your reward credits',
				cancelLabel: 'Cancel editing reward credits'
			}
		},
		...partnerWallets.map((wallet) => ({
			key: wallet.section.partnershipId,
			label: `With ${wallet.name}`,
			credits: wallet.section.credits,
			partner: { name: wallet.name, image: wallet.section.image }
		}))
	]);
</script>

<section class="page">
	<NestedPageHeader
		{backHref}
		backLabel="Back to home"
		backText="Home"
		title="Rewards"
		description="What your credits can buy: your own rewards, and the ones your partners set aside for you."
	>
		{#snippet actions()}
			<CreditBalances {balances} />
			<wa-button appearance="plain" pill href={historyHref}>
				<wa-icon name="clock-rotate-left" variant="solid" label="Claim history"></wa-icon>
			</wa-button>
		{/snippet}
	</NestedPageHeader>

	<div class="content">
		{#if form?.message}<p class="status">{form.message}</p>{/if}
		{#if form?.error}<p class="invalid">{form.error}</p>{/if}


		<QuickAddLink href={addHref} label="Add a reward" />

		<RewardWallet
			class="self"
			title={partnerWallets.length > 0 ? 'Yours' : null}
			balance={data.selfRewards.credits}
			entries={ownEntries}
			mode="claim"
			emptyMessage="You have not made any rewards of your own yet."
		/>

		{#each partnerWallets as wallet (wallet.section.partnershipId)}
			<RewardWallet
				class="partner"
				title={`From ${wallet.name}`}
				balance={wallet.section.credits}
				entries={wallet.entries}
				mode="claim"
				emptyMessage={`No rewards from ${wallet.name} right now.`}
			/>
		{/each}
	</div>

	{@render children()}
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
		gap: var(--wa-space-xl);
	}

	p {
		margin: 0;
	}

	.status {
		color: var(--wa-color-text-success);
	}

	.invalid {
		color: var(--wa-color-text-danger);
	}
</style>
