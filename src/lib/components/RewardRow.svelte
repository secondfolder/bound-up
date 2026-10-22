<script lang="ts">
	import ItemRow from '$lib/components/ItemRow.svelte';
	import {
		progressTowards,
		type RewardEntry,
		type RewardListMode,
		shortfallText
	} from '$lib/reward-list';
	import { openedReward, shownTitle } from '$lib/sealed-views.svelte';

	/**
	 * One reward in a wallet (`RewardWallet`): its title, and its cost at the
	 * end — amber when the balance covers it, quiet when not, with a bar under
	 * it showing how close the balance is. Nothing to tap but the reward itself:
	 * claiming is done from its detail, a second, deliberate tap, because a claim
	 * spends credits and cannot be taken back. See docs/rewards.md, "The wallet".
	 */
	let {
		entry,
		mode,
		balance,
		partnerName = null,
		celebrating = false,
		selected = false,
		glowing = false,
		onopen
	}: {
		entry: RewardEntry;
		mode: RewardListMode;
		/** What the wallet holds: the viewer's, or in `set` mode the partner's. */
		balance: number;
		/** Who the reward is for, in `set` mode. */
		partnerName?: string | null;
		celebrating?: boolean;
		/** Its detail is open. */
		selected?: boolean;
		/** It has just come within reach while the page was open. */
		glowing?: boolean;
		onopen: () => void;
	} = $props();

	const reward = $derived(entry.reward);
	const title = $derived(shownTitle(openedReward(reward)));
	const covered = $derived(reward.active && reward.cost <= balance);
	const shortfall = $derived(
		reward.active ? shortfallText(reward.cost, balance, mode, partnerName) : null
	);
</script>

<ItemRow {title} {onopen} {celebrating} {selected} dimmed={!reward.active}>
	{#snippet trailing()}
		<span class={['cost', { covered, glowing }]}>
			{#if celebrating}
				<wa-icon class="claimed" name="gift" variant="solid" label="Claimed"></wa-icon>
			{:else}
				{reward.cost}<span class="wa-visually-hidden"
					>{' '}credit{reward.cost === 1 ? '' : 's'}</span
				>
			{/if}
		</span>
	{/snippet}

	{#snippet below()}
		{#if shortfall}
			<div class="progress">
				<wa-progress-bar
					value={progressTowards(reward.cost, balance)}
					label={`${balance} of ${reward.cost} credits`}
				></wa-progress-bar>
				<span>{shortfall}</span>
			</div>
		{/if}
	{/snippet}
</ItemRow>

<style>
	.cost {
		display: inline-grid;
		place-items: center;
		min-inline-size: 2.25rem;
		padding: 0.125rem 0.625rem;
		border-radius: var(--wa-border-radius-pill);
		color: var(--wa-color-text-quiet);

		&.covered {
			background: var(--wa-color-brand-fill-quiet);
			border: 1px solid var(--wa-color-brand-border-normal);
			color: var(--wa-color-brand-on-normal);
		}
	}

	.progress {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.8125rem;
		color: var(--wa-color-text-quiet);

		& wa-progress-bar {
			flex: 1 1 auto;
			--track-height: 0.25rem;
			--track-color: var(--wa-color-surface-lowered);
			--indicator-color: var(--wa-color-brand-fill-normal);
		}

		& span {
			flex: none;
			font-variant-numeric: tabular-nums;
		}
	}

	@media (prefers-reduced-motion: no-preference) {
		.glowing {
			animation: glow 1200ms ease-out;
		}

		.claimed {
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
