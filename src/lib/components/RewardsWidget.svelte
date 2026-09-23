<script lang="ts">
	import SectionWidget from '$lib/components/SectionWidget.svelte';
	import WidgetItems from '$lib/components/WidgetItems.svelte';
	import type { RewardsWidgetView } from '$lib/types';

	let {
		rewards,
		href,
		title = 'Rewards'
	}: { rewards: RewardsWidgetView; href: string; title?: string } = $props();

	const hidden = $derived(Math.max(0, rewards.claimableCount - rewards.claimable.length));
	/**
	 * Only ever about rewards you can claim.
	 *
	 * There is deliberately no "N still out of reach" line. Naming a reward you
	 * cannot have yet is not an offer, it is a reminder of what you are short
	 * of — and the balance above already says where you stand. This is why an
	 * account with rewards it cannot afford gets no body at all.
	 */
	const more = $derived(hidden > 0 ? `and ${hidden} more you can claim` : null);

	/**
	 * Only balances with something in them.
	 *
	 * A bare "0 credits" is the same kind of line as "Nothing you can afford
	 * yet.": it costs a glance to learn there is nothing. With no out-of-reach
	 * count either, a scope you cannot spend in contributes nothing at all —
	 * which is the intent, not an oversight.
	 */
	const balances = $derived(rewards.balances.filter((balance) => balance.credits > 0));

	const hasBody = $derived(
		rewards.viewerActs ? balances.length > 0 || rewards.claimable.length > 0 : rewards.activeCount > 0
	);
</script>

<SectionWidget {title} {href} icon="gift" body={hasBody ? preview : undefined} />

{#snippet preview()}
	{#if rewards.viewerActs}
		{#if balances.length > 0}
			<!--
				One line per balance, never a total. Credits do not pool: a
				partnership's credits buy that partnership's rewards and nothing
				else, so adding them up would state a spending power nobody has.
				With a single unlabelled balance this reads as it did before
				partners were merged in.
			-->
			<ul class="credits">
				{#each balances as balance (balance.id)}
					<li>
						<strong>{balance.credits}</strong>
						{#if balance.label}
							<span class="whose">with {balance.label}</span>
						{:else}
							credit{balance.credits === 1 ? '' : 's'}
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		<!-- The note on each row is that reward's cost, so the balances above are
		     what make the list readable. -->
		<WidgetItems items={rewards.claimable} {more} />
	{:else}
		<!-- The managing side does not claim these; see TasksWidget. -->
		<p class="summary">
			{rewards.activeCount}
			active reward{rewards.activeCount === 1 ? '' : 's'} you manage
		</p>
	{/if}
{/snippet}

<style>
	.credits {
		list-style: none;
		margin: 0 0 0.5rem;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		color: var(--wa-color-text-quiet);
		font-size: 0.875rem;

		li {
			display: flex;
			align-items: baseline;
			gap: 0.3125rem;
		}

		strong {
			font-size: 1.25rem;
			color: var(--wa-color-text-normal);
		}
	}

	.summary {
		margin: 0;
		color: var(--wa-color-text-quiet);
		font-size: 0.875rem;
	}
</style>
