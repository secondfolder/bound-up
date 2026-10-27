<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import CreditBalances from '$lib/components/CreditBalances.svelte';
	import ContextSwitcher from '$lib/components/context/ContextSwitcher.svelte';
	import ItemsTabs from '$lib/components/ItemsTabs.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import QuickAddLink from '$lib/components/QuickAddLink.svelte';
	import RewardWallet from '$lib/components/RewardWallet.svelte';
	import { balancePills, itemTargets, partnerIn, shownSpaces } from '$lib/item-pages.svelte';
	import type { RewardEntry } from '$lib/reward-list';
	import { sealScopeForSpace } from '$lib/sealed-forms';
	import type { RewardView, RewardWalletView } from '$lib/types';
	import type { ActionData, LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	/**
	 * The page's action result, read from `page` because a layout is not handed
	 * `form`: the wallets live here so the add, edit and history sheets (child
	 * routes) open over them.
	 */
	const form = $derived(page.form as ActionData | null | undefined);
	const historyHref = resolve('/(auth-required)/(app)/rewards/history');
	const addHref = resolve('/(auth-required)/(app)/rewards/add');

	const spaces = $derived(shownSpaces(data.list.spaces, data.contextSpaces));
	const several = $derived(spaces.length > 1);
	const canAdd = $derived(itemTargets(data.list.spaces, data.contextSpaces).length > 0);

	function entry(reward: RewardView, wallet: RewardWalletView): RewardEntry {
		const space = spaces.find((candidate) => candidate.id === reward.spaceId);
		return {
			reward,
			claimAction: wallet.mine ? '?/claim' : null,
			editHref: reward.canManage
				? resolve('/(auth-required)/(app)/rewards/[rewardId]', { rewardId: reward.id })
				: null,
			contentSave:
				reward.canManage && space
					? { action: '?/content', scope: sealScopeForSpace({ spaceId: space.id, kind: space.kind }) }
					: null
		};
	}

	/**
	 * A wallet per balance, never one merged list: each reward is paid from
	 * exactly one, and a merged list would hide which a cost comes out of. The
	 * viewer's own first — what they can spend — then each partner's they keep
	 * rewards in.
	 */
	const wallets = $derived(
		data.list.wallets.map((wallet) => {
			const name = partnerIn(wallet.spaceId, data.contextSpaces);
			let title: string;
			let emptyMessage: string;
			if (!wallet.mine) {
				title = `For ${name ?? 'them'}`;
				emptyMessage = `You have not set aside any rewards for ${name ?? 'them'} yet.`;
			} else if (name) {
				title = several ? `From ${name}` : 'For you';
				emptyMessage = `${name} has not set aside any rewards for you yet.`;
			} else {
				title = 'Yours';
				emptyMessage = 'You have not made any rewards of your own yet.';
			}
			return {
				key: `${wallet.spaceId}|${wallet.userId}`,
				wallet,
				name,
				// One wallet is the page's; its title would say what the page does.
				title: data.list.wallets.length > 1 ? title : null,
				emptyMessage,
				entries: wallet.rewards.map((reward) => entry(reward, wallet))
			};
		})
	);
	const yours = $derived(wallets.filter((shown) => shown.wallet.mine));
	const theirs = $derived(wallets.filter((shown) => !shown.wallet.mine));

	const balances = $derived(
		balancePills(
			data.list.wallets.map(({ rewards: _, ...balance }) => balance),
			data.contextSpaces,
			data.partners,
			{ editable: true }
		)
	);

	const description = $derived.by(() => {
		if (several) {
			return 'What your credits can buy, and what you have set aside for your partners.';
		}
		return theirs.length > 0
			? 'What you have each set aside for the other.'
			: 'What your credits can buy.';
	});
</script>

<section class="page">
	<NestedPageHeader
		backHref={resolve('/(auth-required)/(app)/home')}
		backLabel="Back to home"
		backText="Home"
		title="Rewards"
		{description}
	>
		{#snippet actions()}
			<CreditBalances {balances} />
			<wa-button appearance="plain" pill href={historyHref}>
				<wa-icon name="clock-rotate-left" variant="solid" label="Claim history"></wa-icon>
			</wa-button>
		{/snippet}
		{#snippet corner()}
			<ContextSwitcher spaces={data.contextSpaces} context={data.context} you={data.user?.name ?? ''} />
		{/snippet}
	</NestedPageHeader>

	<div class="content">
		<ItemsTabs current="rewards" />

		{#if form?.message}<p class="status">{form.message}</p>{/if}
		{#if form?.error}<p class="invalid">{form.error}</p>{/if}

		{#if canAdd}<QuickAddLink href={addHref} label="Add a reward" />{/if}

		{#each yours as shown (shown.key)}
			<RewardWallet
				title={shown.title}
				balance={shown.wallet.credits}
				entries={shown.entries}
				mode="claim"
				emptyMessage={shown.emptyMessage}
			/>
		{/each}

		<!-- Hidden in Me and wherever the viewer keeps rewards for nobody. -->
		{#if theirs.length > 0}
			{#if yours.length > 0}<h2>Set for others</h2>{/if}
			{#each theirs as shown (shown.key)}
				<RewardWallet
					title={shown.title}
					balance={shown.wallet.credits}
					entries={shown.entries}
					mode="set"
					partnerName={shown.name}
					emptyMessage={shown.emptyMessage}
				/>
			{/each}
		{/if}
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

	h2 {
		margin: 0;
		font-size: var(--wa-font-size-l);
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
