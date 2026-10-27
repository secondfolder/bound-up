<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import ResponsiveDialog from '$lib/components/ResponsiveDialog.svelte';
	import RichText from '$lib/components/RichText.svelte';
	import { creditsLabel } from '$lib/credits';
	import { type ContentSaveTarget, descriptionSaver } from '$lib/description-ticks';
	import { enhance } from '$lib/enhance';
	import type { ItemAction } from '$lib/item-action.svelte';
	import type { RewardEntry, RewardListMode } from '$lib/reward-list';
	import { type RewardContent, rewardKind } from '$lib/sealed-kinds/tasks';
	import { openedReward, shownTitle } from '$lib/sealed-views.svelte';

	/**
	 * One reward, and the only place it is claimed: what it is, what it costs,
	 * and what the balance will be after. A sheet on a phone, a dialog on a
	 * wider screen (`ResponsiveDialog`).
	 *
	 * The claim celebrates here, then the dialog closes on the refreshed list.
	 * A refusal is said here too: the page's own error line is under the dialog.
	 */
	let {
		entry,
		mode,
		balance,
		partnerName = null,
		claiming,
		onclose
	}: {
		entry: RewardEntry;
		mode: RewardListMode;
		balance: number;
		partnerName?: string | null;
		claiming: ItemAction;
		onclose: () => void;
	} = $props();

	let dialog: ResponsiveDialog | undefined = $state();
	let refusal = $state<string | null>(null);

	const reward = $derived(entry.reward);
	/**
	 * The reward's content as last opened, held through a reload of the same
	 * reward, as on the task sheet: a tick saved from here re-runs the load,
	 * and the new ciphertext reads as "still opening" for a moment.
	 */
	let held: { id: string; content: RewardContent | null } | null = null;
	const content = $derived.by(() => {
		const opened = openedReward(reward);
		if (opened !== undefined) {
			held = { id: reward.id, content: opened };
		}
		return held?.id === reward.id ? held.content : undefined;
	});

	/** Built on the first tick and kept, as on the task sheet (`descriptionSaver`). */
	let saveDescription: ((description: string) => Promise<boolean>) | null = null;

	function saveTick(target: ContentSaveTarget, description: string): Promise<boolean> {
		refusal = null;
		saveDescription ??= descriptionSaver({
			kind: rewardKind,
			target,
			recordId: reward.id,
			current: () => {
				if (!content) {
					throw new Error('The reward is not open on this device.');
				}
				return { revision: reward.revision, content };
			},
			onRefused: (message) => {
				refusal = message;
			}
		});
		return saveDescription(description);
	}

	/** Ticks save only where the viewer may edit the reward; elsewhere the boxes are disabled. */
	const onChecklistToggle = $derived.by(() => {
		const target = entry.contentSave;
		return target ? (stored: string) => saveTick(target, stored) : undefined;
	});
	const title = $derived(shownTitle(content));
	const canClaim = $derived(mode === 'claim' && entry.claimAction !== null && reward.canClaim);
	const celebrating = $derived(claiming.celebrating === reward.id);
	const hasActions = $derived(Boolean(canClaim || entry.editHref));

	const claim: SubmitFunction = async (input) => {
		refusal = null;
		const after = await claiming.enhance(reward.id)(input);
		if (!after) {
			return;
		}
		return async (outcome) => {
			await after(outcome);
			if (outcome.result.type === 'success') {
				dialog?.close();
			} else if (outcome.result.type === 'failure') {
				const said = outcome.result.data?.error;
				refusal = typeof said === 'string' ? said : 'That reward could not be claimed.';
			}
		};
	};
</script>

<ResponsiveDialog bind:this={dialog} label={title} {onclose} footer={hasActions ? actions : undefined}>
	<div class="detail">
		{#if content?.description}<RichText text={content.description} {onChecklistToggle} />{/if}

		<dl class="facts">
			<dt>Costs</dt>
			<dd>{creditsLabel(reward.cost)}</dd>
			<dt>{mode === 'set' && partnerName ? `${partnerName} has` : 'You have'}</dt>
			<dd>{creditsLabel(balance)}</dd>
			{#if !reward.active}
				<dt>Status</dt>
				<dd>Inactive</dd>
			{:else if reward.cost <= balance && mode === 'claim'}
				<dt>Afterwards</dt>
				<dd>{creditsLabel(balance - reward.cost)} left</dd>
			{:else if reward.cost > balance}
				<dt>To go</dt>
				<dd>{creditsLabel(reward.cost - balance)}</dd>
			{/if}
		</dl>

		{#if refusal}<p class="refusal" role="alert">{refusal}</p>{/if}
	</div>
</ResponsiveDialog>

<!-- The thing to do first and widest, then the rest, as the task sheet has it. -->
{#snippet actions()}
	{#if canClaim && entry.claimAction}
		<form method="POST" action={entry.claimAction} class="claim-form" use:enhance={claim}>
			<input type="hidden" name="rewardId" value={reward.id} />
			<wa-button
				class="claim"
				type="submit"
				variant="brand"
				appearance="accent"
				disabled={claiming.waiting(reward.id)}
			>
				{#if celebrating}
					<wa-icon class="claimed" name="gift" variant="solid" label="Claimed"></wa-icon>
				{:else}
					Claim · {creditsLabel(reward.cost)}
				{/if}
			</wa-button>
		</form>
	{/if}
	{#if entry.editHref}
		<!-- The edit form is a sheet of its own (its route's `RouteSheet`), so
		     this one gets out of its way. -->
		<wa-button appearance="outlined" href={entry.editHref} onclick={() => dialog?.close()}
			>Edit</wa-button
		>
	{/if}
{/snippet}

<style>
	.detail {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-m);
	}

	.facts {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.375rem 1rem;
		margin: 0;
		font-size: 0.9375rem;
	}

	dt {
		color: var(--wa-color-text-quiet);
	}

	dd {
		margin: 0;
		font-variant-numeric: tabular-nums;
	}

	.refusal {
		margin: 0;
		color: var(--wa-color-text-danger);
	}

	.claim-form {
		display: contents;
	}

	wa-button.claim {
		flex: 1 1 auto;
	}

	@media (prefers-reduced-motion: no-preference) {
		.claimed {
			animation: pop 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
		}
	}

	@keyframes pop {
		from {
			transform: scale(0.8);
		}
	}
</style>
