<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import CreditBalances from '$lib/components/CreditBalances.svelte';
	import FloatingAddButton from '$lib/components/FloatingAddButton.svelte';
	import ListDock from '$lib/components/ListDock.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import RewardWallet from '$lib/components/RewardWallet.svelte';
	import SegmentedTabs from '$lib/components/SegmentedTabs.svelte';
	import { partnerName } from '$lib/partner-names.svelte';
	import type { RewardEntry } from '$lib/reward-list';
	import type { PartnershipRewardView } from '$lib/types';
	import type { ActionData, LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	/**
	 * The page's action result, read from `page` because a layout is not handed
	 * `form`: the list lives here so the add, edit and history sheets (child
	 * routes) open over it.
	 */
	const form = $derived(page.form as ActionData | null | undefined);
	/** What the viewer calls them, opened in the browser (`partner-names.svelte.ts`). */
	const partnerShown = $derived(partnerName(data.partner.names));
	const backHref = $derived(resolve('/(auth-required)/(app)/partner/[id]', { id: data.partner.id }));
	const historyHref = $derived(
		resolve('/(auth-required)/(app)/partner/[id]/rewards/history', { id: data.partner.id })
	);
	const addHref = $derived(
		resolve('/(auth-required)/(app)/partner/[id]/rewards/add', { id: data.partner.id })
	);
	const hasSharedControl = $derived(data.partner.canManageRewards && data.partner.canClaimRewards);

	function entry(reward: PartnershipRewardView): RewardEntry {
		const canEdit = data.partner.canManageRewards && reward.createdByMe;
		return {
			reward,
			claimAction: data.partner.canClaimRewards && !reward.createdByMe ? '?/claimReward' : null,
			editHref: canEdit
				? resolve('/(auth-required)/(app)/partner/[id]/rewards/[rewardId]', {
						id: data.partner.id,
						rewardId: reward.id
					})
				: null,
			contentSave: canEdit
				? {
						action: '?/rewardContent',
						scope: { kind: 'partnership', partnershipId: data.partner.id }
					}
				: null
		};
	}

	/** Theirs for you to claim, and yours for them: each its own wallet. */
	const forViewer = $derived(data.rewards.filter((reward) => !reward.createdByMe).map(entry));
	const forPartner = $derived(data.rewards.filter((reward) => reward.createdByMe).map(entry));

	/** The partner's balance is the managing side's to set (`?/setCredits`). */
	const partnerEditable = $derived(
		data.counterpartUserId
			? {
					action: '?/setCredits',
					inputLabel: `Set ${partnerShown}'s reward credits`,
					editLabel: `Edit ${partnerShown}'s reward credits`,
					saveLabel: `Save ${partnerShown}'s reward credits`,
					cancelLabel: 'Cancel editing reward credits',
					targetUserId: data.counterpartUserId
				}
			: null
	);

	/**
	 * Each balance as a pill, as the tasks pages show them: the viewer's own,
	 * when they claim here, and their partner's, which the managing side sets.
	 */
	const balances = $derived([
		...(data.partner.canClaimRewards
			? [{ key: 'viewer', label: 'Yours', credits: data.viewerCredits }]
			: []),
		...(data.partner.canManageRewards && data.counterpartCredits !== null
			? [
					{
						key: 'partner',
						label: partnerShown,
						credits: data.counterpartCredits,
						editable: partnerEditable,
						partner: {
							name: partnerShown,
							image: data.partners.find((partner) => partner.id === data.partner.id)?.image ?? null
						}
					}
				]
			: [])
	]);

	const description = $derived.by(() => {
		if (!data.partner.canManageRewards) {
			return `What ${partnerShown} has set aside for you to claim.`;
		}
		return data.partner.canClaimRewards
			? 'What you have each set aside for the other.'
			: `What you have set aside for ${partnerShown}, and the credits they have to spend.`;
	});
</script>

<section class="page">
	<NestedPageHeader
		{backHref}
		backLabel="Back to partner"
		backText={partnerShown}
		title="Rewards"
		{description}
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

		{#snippet yours()}
			<RewardWallet
				balance={data.viewerCredits}
				entries={forViewer}
				mode="claim"
				emptyMessage={`${partnerShown} has not set aside any rewards for you yet.`}
			/>
		{/snippet}
		{#snippet theirs()}
			<RewardWallet
				balance={data.counterpartCredits ?? 0}
				entries={forPartner}
				mode="set"
				partnerName={partnerShown}
				emptyMessage={`You have not set aside any rewards for ${partnerShown} yet.`}
			/>
		{/snippet}

		{#if hasSharedControl}
			<!-- Split by who claims them, as the tasks page is. -->
			<SegmentedTabs
				label="Whose rewards"
				tabs={[
					{ id: 'for-you', label: 'For you', count: forViewer.length },
					{ id: 'for-them', label: `For ${partnerShown}`, count: forPartner.length }
				]}
			>
				{#snippet panel(id)}
					{#if id === 'for-you'}{@render yours()}{:else}{@render theirs()}{/if}
				{/snippet}
			</SegmentedTabs>
		{:else if data.partner.canManageRewards}
			{@render theirs()}
		{:else}
			{@render yours()}
		{/if}
	</div>

	{#if data.partner.canManageRewards}
		<ListDock>
			<FloatingAddButton href={addHref} label="Add a reward" />
		</ListDock>
	{/if}

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
		padding: 0 var(--page-gutter);
		display: flex;
		flex-direction: column;
		gap: 1rem;
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
