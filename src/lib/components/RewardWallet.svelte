<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import ItemGroup from '$lib/components/ItemGroup.svelte';
	import RewardDetailDialog from '$lib/components/RewardDetailDialog.svelte';
	import RewardRow from '$lib/components/RewardRow.svelte';
	import { ItemAction } from '$lib/item-action.svelte';
	import { groupRewards, type RewardEntry, type RewardListMode } from '$lib/reward-list';

	/**
	 * One balance and the rewards it pays for: what it covers now, what it is
	 * saving up for, and what is inactive. Each reward is paid from exactly one
	 * balance, so a page with several (yours, and one per partner) shows a wallet
	 * for each rather than one list. Tapping a reward opens it; claiming happens
	 * there. See docs/rewards.md, "The wallet".
	 */
	let {
		title = null,
		balance,
		entries,
		mode,
		partnerName = null,
		emptyMessage,
		class: className = ''
	}: {
		/** "Yours", "From Jun"; null on a page with one wallet, whose title says it. */
		title?: string | null;
		/**
		 * What the wallet holds, which decides what is within reach. Shown in the
		 * page's credits (`CreditsControl`, in its header), not here.
		 */
		balance: number;
		entries: RewardEntry[];
		mode: RewardListMode;
		/** Who the rewards are for, in `set` mode: "Jun can afford". */
		partnerName?: string | null;
		emptyMessage: string;
		class?: string;
	} = $props();

	const claiming = new ItemAction();

	const groups = $derived.by(() => {
		const byId = new Map(entries.map((entry) => [entry.reward.id, entry]));
		const back = (subset: RewardEntry['reward'][]) =>
			subset.flatMap((reward) => {
				const entry = byId.get(reward.id);
				return entry ? [entry] : [];
			});
		const grouped = groupRewards(
			entries.map((entry) => entry.reward),
			balance
		);
		const who = mode === 'set' && partnerName ? partnerName : null;
		return [
			{
				key: 'affordable',
				title: who ? `${who} can afford` : 'Within reach',
				entries: back(grouped.affordable),
				collapsed: false
			},
			{
				key: 'saving',
				title: who ? `${who} is saving up` : 'Saving up',
				entries: back(grouped.saving),
				collapsed: false
			},
			{ key: 'inactive', title: 'Inactive', entries: back(grouped.inactive), collapsed: true }
		];
	});

	/**
	 * Rewards that have just come within reach while this wallet was on screen —
	 * the balance was edited up, a task was completed — whose cost glows once to
	 * say so. Only a change is marked: everything affordable glowing as the page
	 * loads would make the glow mean nothing.
	 */
	const glowing = new SvelteSet<string>();
	const wasCovered = new Map<string, boolean>();
	$effect(() => {
		for (const { reward } of entries) {
			const covered = reward.active && reward.cost <= balance;
			if (wasCovered.get(reward.id) === false && covered) {
				untrack(() => glowing.add(reward.id));
				setTimeout(() => glowing.delete(reward.id), 1200);
			}
			wasCovered.set(reward.id, covered);
		}
	});

	let openId = $state<string | null>(null);
	const openEntry = $derived(entries.find((entry) => entry.reward.id === openId) ?? null);
</script>

<section class={['wallet', className]}>
	<!-- The balance itself is in the page's credits (`CreditsControl`), as
	     on the tasks page. -->
	{#if title}<h2>{title}</h2>{/if}

	{#if entries.length === 0}
		<p class="empty">{emptyMessage}</p>
	{:else}
		{#each groups as group (group.key)}
			{#if group.entries.length > 0}
				<ItemGroup title={group.title} count={group.entries.length} collapsed={group.collapsed}>
					{#each group.entries as entry (entry.reward.id)}
						<RewardRow
							{entry}
							{mode}
							{balance}
							{partnerName}
							celebrating={claiming.celebrating === entry.reward.id}
							selected={openId === entry.reward.id}
							glowing={glowing.has(entry.reward.id)}
							onopen={() => {
								openId = entry.reward.id;
							}}
						/>
					{/each}
				</ItemGroup>
			{/if}
		{/each}
	{/if}
</section>

{#if openEntry}
	<RewardDetailDialog
		entry={openEntry}
		{mode}
		{balance}
		{partnerName}
		{claiming}
		onclose={() => {
			openId = null;
		}}
	/>
{/if}

<style>
	.wallet {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);
	}

	h2 {
		margin: 0;
		font-size: 1.125rem;
	}

	.empty {
		margin: 0;
		color: var(--wa-color-text-quiet);
	}
</style>
