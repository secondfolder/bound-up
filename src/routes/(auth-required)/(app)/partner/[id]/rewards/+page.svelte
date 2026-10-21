<script lang="ts">
	import { resolve } from '$app/paths';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import RewardCreditsInline from '$lib/components/RewardCreditsInline.svelte';
	import RewardList from '$lib/components/RewardList.svelte';
	import SectionPanel from '$lib/components/SectionPanel.svelte';
	import { partnerName } from '$lib/partner-names.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form?: ActionData } = $props();
	/** What the viewer calls them, opened in the browser (`partner-names.svelte.ts`). */
	const partnerShown = $derived(partnerName(data.partner.names));
	const backHref = $derived(resolve('/(auth-required)/(app)/partner/[id]', { id: data.partner.id }));
	const editHref = (rewardId: string) =>
		resolve('/(auth-required)/(app)/partner/[id]/rewards/[rewardId]', {
			id: data.partner.id,
			rewardId
		});
	const description = $derived.by(() => {
		if (!data.partner.canManageRewards) {
			return 'You can claim rewards from this list when you have enough credits.';
		}
		return data.partner.canClaimRewards
			? 'You can manage this reward list and claim rewards your partner created.'
			: 'You control this reward list and set the credits they can spend.';
	});
</script>

<section class="page">
	<NestedPageHeader
		{backHref}
		backLabel="Back to partner"
		backText={partnerShown}
		title="Rewards"
		{description}
	/>

	<div class="content">
		{#if form?.message}<p class="status">{form.message}</p>{/if}
		{#if form?.error}<p class="invalid">{form.error}</p>{/if}

		<!--
			One list, so no panel and no section title: the page is titled
			"Rewards", and a panel around the only list on the page put every
			reward in a card inside a card. The balance takes the title's place.
		-->
		<SectionPanel framed={false}>
			{#snippet meta()}
				{#if data.partner.canClaimRewards}
					<RewardCreditsInline label="Your credits:" unit={null} credits={data.viewerCredits} compact />
				{:else if data.counterpartCredits !== null && data.counterpartUserId}
					<RewardCreditsInline
						label={`${partnerShown}'s credits:`}
						unit={null}
						credits={data.counterpartCredits}
						compact
						editable={{
							action: '?/setCredits',
							inputLabel: `Set ${partnerShown}'s reward credits`,
							editLabel: `Edit ${partnerShown}'s reward credits`,
							saveLabel: `Save ${partnerShown}'s reward credits`,
							cancelLabel: 'Cancel editing reward credits',
							targetUserId: data.counterpartUserId
						}}
					/>
				{/if}
			{/snippet}
			{#snippet actions()}
				<!-- Always there, as on /home/rewards and the tasks pages. -->
				<wa-button
					appearance="outlined"
					href={resolve('/(auth-required)/(app)/partner/[id]/rewards/history', {
						id: data.partner.id
					})}>Claim history</wa-button
				>
				{#if data.partner.canManageRewards}
					<wa-button
						appearance="outlined"
						href={resolve('/(auth-required)/(app)/partner/[id]/rewards/add', { id: data.partner.id })}
						>Add a reward</wa-button
					>
				{/if}
			{/snippet}

			{#if data.partner.canClaimRewards && data.counterpartCredits !== null && data.counterpartUserId}
				<div class="secondary-credit-row">
					<RewardCreditsInline
						label={`${partnerShown}'s credits:`}
						unit={null}
						credits={data.counterpartCredits}
						compact
						editable={{
							action: '?/setCredits',
							inputLabel: `Set ${partnerShown}'s reward credits`,
							editLabel: `Edit ${partnerShown}'s reward credits`,
							saveLabel: `Save ${partnerShown}'s reward credits`,
							cancelLabel: 'Cancel editing reward credits',
							targetUserId: data.counterpartUserId
						}}
					/>
				</div>
			{/if}

			<RewardList
				rewards={data.rewards}
				emptyMessage="No rewards have been created for this partnership yet."
				claimAction="?/claimReward"
				editHref={data.partner.canManageRewards ? editHref : null}
				showClaimUi={data.partner.canClaimRewards}
				balance={data.partner.canClaimRewards ? data.viewerCredits : null}
			/>
		</SectionPanel>
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

	.secondary-credit-row {
		padding-block-end: 0.75rem;
		border-block-end: 1px solid color-mix(in srgb, var(--wa-color-surface-border) 75%, transparent);
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
