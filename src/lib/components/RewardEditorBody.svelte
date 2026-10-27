<script lang="ts">
	import RewardForm from '$lib/components/RewardForm.svelte';
	import type { ItemTarget } from '$lib/item-target';
	import { sealScopeForSpace } from '$lib/sealed-forms';
	import { openedReward } from '$lib/sealed-views.svelte';
	import type { RewardView } from '$lib/types';

	/**
	 * Adding or editing a reward, in whichever space: what the add and edit
	 * sheets show, so the two cannot drift.
	 */
	let {
		reward = null,
		target,
		action,
		onsaved
	}: {
		/** The reward being edited; null to add one. */
		reward?: RewardView | null;
		/** Its space: a new one's, posted as `spaceId`, or the edited one's own. */
		target: Pick<ItemTarget, 'spaceId' | 'kind'>;
		/** The route's action, from a sheet on another page. */
		action?: string;
		onsaved?: () => void;
	} = $props();

	const opened = $derived(reward ? openedReward(reward) : null);
	/**
	 * The fields' starting values, taken once the reward is opened. Held rather
	 * than derived for the reason `RewardForm` gives: its fields start from
	 * these and are not held to them.
	 */
	let values = $state<{ title: string; description: string; cost: string; active: boolean } | null>(
		null
	);
	$effect(() => {
		if (values !== null) {
			return;
		}
		if (!reward) {
			values = { title: '', description: '', cost: '', active: true };
		} else if (opened) {
			values = {
				title: opened.title,
				description: opened.description ?? '',
				cost: String(reward.cost),
				active: reward.active
			};
		}
	});
	const sealScope = $derived(sealScopeForSpace(target));
</script>

{#if values}
	<RewardForm
		{values}
		{sealScope}
		fields={{ spaceId: target.spaceId }}
		reward={reward ? { id: reward.id, revision: reward.revision } : null}
		submitLabel={reward ? 'Save reward' : 'Add reward'}
		{action}
		{onsaved}
	/>
{:else if opened === null}
	<p class="quiet">This reward can't be shown on this device right now.</p>
{:else}
	<p class="quiet">…</p>
{/if}

<style>
	.quiet {
		margin: 0;
		color: var(--wa-color-text-quiet);
	}
</style>
