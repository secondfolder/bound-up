<script lang="ts">
	import { resolve } from '$app/paths';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import RewardCreditsInline from '$lib/components/RewardCreditsInline.svelte';
	import RewardList from '$lib/components/RewardList.svelte';
	import SectionPanel from '$lib/components/SectionPanel.svelte';
	import { partnerName } from '$lib/partner-names.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form?: ActionData } = $props();
	const backHref = $derived(resolve('/(auth-required)/(app)/home'));
	const hasPartnerSections = $derived(data.partnerRewards.length > 0);
	const selfEditHref = (rewardId: string) =>
		resolve('/(auth-required)/(app)/home/rewards/[rewardId]', { rewardId });
</script>

<section class="page">
	<NestedPageHeader
		{backHref}
		backLabel="Back to home"
		backText="Home"
		title="Rewards"
		description="Manage your own rewards here, then claim what your partners have set aside for you."
	/>

	<div class="content">
		{#if form?.message}<p class="status">{form.message}</p>{/if}
		{#if form?.error}<p class="invalid">{form.error}</p>{/if}

		<!-- Laid out as /home/tasks is: a panel per section once there is more
		     than one, the balance beside the title, the buttons on the right. -->
		<SectionPanel title="Your rewards" class="self" framed={hasPartnerSections}>
			{#snippet meta()}
				<RewardCreditsInline
					label="Credits:"
					unit={null}
					credits={data.selfRewards.credits}
					compact
					editable={{
						action: '?/selfSetCredits',
						inputLabel: 'Set your reward credits',
						editLabel: 'Edit your reward credits',
						saveLabel: 'Save your reward credits',
						cancelLabel: 'Cancel editing reward credits'
					}}
				/>
			{/snippet}
			{#snippet actions()}
				<!-- Always there, like the tasks page's history: an empty history
				     page says so, and the buttons do not move when the first claim
				     lands. -->
				<wa-button appearance="outlined" href={resolve('/(auth-required)/(app)/home/rewards/history')}
					>Claim history</wa-button
				>
				<wa-button appearance="outlined" href={resolve('/(auth-required)/(app)/home/rewards/add')}
					>Add a reward</wa-button
				>
			{/snippet}

			<RewardList
				rewards={data.selfRewards.rewards}
				emptyMessage="You have not created any rewards of your own yet."
				claimAction="?/selfClaimReward"
				editHref={selfEditHref}
				balance={data.selfRewards.credits}
			/>
		</SectionPanel>

		<div class="partner-sections">
			{#each data.partnerRewards as section (section.partnershipId)}
				<SectionPanel title={`${partnerName(section.names)}'s rewards`} class="partner">
					{#snippet meta()}
						<RewardCreditsInline label="Credits:" unit={null} credits={section.credits} compact />
					{/snippet}
					{#snippet actions()}
						<wa-button
							appearance="outlined"
							href={resolve('/(auth-required)/(app)/partner/[id]/rewards', {
								id: section.partnershipId
							})}>Open full rewards</wa-button
						>
					{/snippet}

					<RewardList
						rewards={section.rewards}
						emptyMessage={`No claimable rewards from ${partnerName(section.names)} right now.`}
						claimAction="?/partnerClaimReward"
						claimPartnershipId={section.partnershipId}
						editHref={null}
						balance={section.credits}
					/>
				</SectionPanel>
			{/each}
		</div>
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

	.content,
	.partner-sections {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.content {
		padding: 0 var(--page-gutter) var(--wa-space-l);
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
