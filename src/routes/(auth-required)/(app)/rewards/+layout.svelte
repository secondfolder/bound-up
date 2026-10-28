<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import AddButton from '$lib/components/AddButton.svelte';
	import CreditsControl from '$lib/components/CreditsControl.svelte';
	import ContextSwitcher from '$lib/components/context/ContextSwitcher.svelte';
	import ItemsTabs from '$lib/components/ItemsTabs.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import RewardWallet from '$lib/components/RewardWallet.svelte';
	import { creditGroups, itemTargets, partnerIn, shownSpaces } from '$lib/item-pages.svelte';
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

	const spaces = $derived(shownSpaces(data.list.spaces, data.contextSpaces));
	const several = $derived(spaces.length > 1);
	/** Where the viewer may add a reward to, from here: the add button's choices. */
	const targets = $derived(
		itemTargets(data.list.spaces, data.contextSpaces).map((target) => target.spaceId)
	);

	/**
	 * Opens the add sheet for the space picked (or the only one), handed over
	 * in history state rather than the URL (`PageState.addFor`), so the sheet
	 * skips "For whom?". The sheet posts it; nothing reads the context.
	 */
	function add(spaceId: string) {
		void goto(resolve('/(auth-required)/(app)/rewards/add'), { state: { addFor: spaceId } });
	}

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

	const credits = $derived(
		creditGroups(
			data.list.wallets.map(({ rewards: _, ...balance }) => balance),
			data.contextSpaces,
			data.user?.name ?? '',
			{ editable: true }
		)
	);
</script>

<section class="page">
	<PageHeader title="Tasks & Rewards">
		{#snippet corner()}
			<ContextSwitcher spaces={data.contextSpaces} context={data.context} you={data.user?.name ?? ''} />
		{/snippet}
		{#snippet toolbar()}
			<ItemsTabs current="rewards" />
			<!-- Set from its sheet, where the viewer may: they used to be edited
			     in place, in a row of pills that wrapped onto three lines. -->
			<CreditsControl groups={credits} everyone={several} />
		{/snippet}
	</PageHeader>

	<div class="content">
		{#if form?.message}<p class="status">{form.message}</p>{/if}
		{#if form?.error}<p class="invalid">{form.error}</p>{/if}

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

		<!-- At the end of the list, where looking back belongs, as the tasks
		     page's "Completed tasks" is. -->
		<a class="history" href={historyHref}>
			<wa-icon name="clock-rotate-left" variant="solid"></wa-icon>
			Claimed rewards
			<wa-icon name="chevron-right" variant="solid"></wa-icon>
		</a>
	</div>

	<AddButton
		label="Add a reward"
		lead="New reward for"
		{targets}
		spaces={data.contextSpaces}
		you={data.user?.name ?? ''}
		onadd={add}
	/>


	{@render children()}
</section>

<style>
	/* Fills <main>, so the add button, its last child, sticks to the bottom. */
	.page {
		flex: 1 1 auto;
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

	.history {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		align-self: flex-start;
		min-block-size: 2.75rem;
		color: var(--wa-color-brand-on-quiet);
		font-weight: var(--wa-font-weight-semibold, 600);
		text-decoration: none;

		wa-icon:last-child {
			font-size: 0.75em;
		}
	}
</style>
