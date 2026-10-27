<script lang="ts">
	import SpaceChip from '$lib/components/context/SpaceChip.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ItemGroup from '$lib/components/ItemGroup.svelte';
	import ItemRow from '$lib/components/ItemRow.svelte';
	import { groupByDay, timeOfDay } from '$lib/day-groups';
	import { openedClaim, shownTitle } from '$lib/sealed-views.svelte';
	import type { ContextSpaceView, RewardClaimView } from '$lib/types';

	/**
	 * A reward claim history: a line per claim under the day it was made, with
	 * what it cost at the time, as the task history is. Over several spaces
	 * (Everyone), each line says whose space with a chip.
	 */
	let {
		claims,
		spaces
	}: {
		claims: RewardClaimView[];
		/** The spaces the history covers, as the switcher knows them. */
		spaces: readonly ContextSpaceView[];
	} = $props();

	const spaceById = $derived(new Map(spaces.map((space) => [space.id, space])));
	const several = $derived(spaces.length > 1);

	/** Each row with its content opened, or a placeholder while it opens (`sealed-views.svelte.ts`). */
	const days = $derived(
		groupByDay(
			claims.map((claim) => ({ claim, content: openedClaim(claim) })),
			(row) => row.claim.createdAt
		)
	);
</script>

{#if claims.length === 0}
	<EmptyState icon="gift" title="Nothing claimed yet.">
		<p>Each reward claimed shows up here, with what it cost at the time.</p>
	</EmptyState>
{:else}
	<div class="days">
		{#each days as day (day.key)}
			<ItemGroup title={day.label}>
				{#each day.items as { claim, content } (claim.id)}
					<ItemRow title={shownTitle(content)}>
						{#snippet meta()}
							<span>{timeOfDay(claim.createdAt)}</span>
							{const space = $derived(spaceById.get(claim.spaceId))}
							{#if several && space}<SpaceChip {space} />{/if}
							{#if space?.kind === 'shared'}
								<span>{claim.mine ? 'Claimed by you' : 'Claimed by them'}</span>
							{/if}
						{/snippet}
						{#snippet trailing()}
							<span class="cost">
								−{claim.rewardCost}<span class="wa-visually-hidden"
									>{' '}credit{claim.rewardCost === 1 ? '' : 's'}</span
								>
							</span>
						{/snippet}
					</ItemRow>
				{/each}
			</ItemGroup>
		{/each}
	</div>
{/if}

<style>
	.days {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-l);
	}

	.cost {
		color: var(--wa-color-text-quiet);
	}
</style>
