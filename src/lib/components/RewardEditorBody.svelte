<script lang="ts">
	import RewardForm from '$lib/components/RewardForm.svelte';
	import type { RewardView } from '$lib/reward-list';
	import { openedReward } from '$lib/sealed-views.svelte';

	/**
	 * Adding or editing a reward, self or partnership: what the four add and
	 * edit pages show under their headers, and what the rewards list's sheet
	 * shows (`RoutedDialog` over those same routes), so the two cannot drift.
	 */
	let {
		reward = null,
		partnershipId = null,
		action,
		onsaved
	}: {
		/** The reward being edited; null to add one. */
		reward?: RewardView | null;
		/** The partnership a partnership reward belongs to; null for a self reward. */
		partnershipId?: string | null;
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
	const sealScope = $derived(
		partnershipId ? { kind: 'partnership' as const, partnershipId } : { kind: 'self' as const }
	);
</script>

{#if values}
	<RewardForm
		{values}
		{sealScope}
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
