<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';
	import { enhance } from '$app/forms';
	import ItemCard from '$lib/components/ItemCard.svelte';
	import RichText from '$lib/components/RichText.svelte';
	import TimeZoneDisplay from '$lib/components/TimeZoneDisplay.svelte';
	import { creditAwardLabel } from '$lib/credits';
	import { ItemAction } from '$lib/item-action.svelte';
	import { openedTask, shownTitle } from '$lib/sealed-views.svelte';
	import { describeTaskSchedule } from '$lib/task-schedule';
	import type { PartnershipTaskView, SelfTaskView } from '$lib/types';

	type TaskView = SelfTaskView | PartnershipTaskView;

	type Props = {
		tasks: TaskView[];
		emptyMessage: string;
		completeAction?: string | null;
		completePartnershipId?: string | null;
		editHref?: ((taskId: string) => string) | null;
	};

	let {
		tasks,
		emptyMessage,
		completeAction = null,
		completePartnershipId = null,
		editHref = null
	}: Props = $props();

	function formatDateTime(date: Date): string {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(date);
	}

	function isPartnershipTask(task: TaskView): task is PartnershipTaskView {
		return 'createdByMe' in task;
	}

	function canEdit(task: TaskView): boolean {
		return editHref !== null && (!isPartnershipTask(task) || (task.canManage && task.createdByMe));
	}

	function hasActions(task: TaskView): boolean {
		return Boolean((completeAction && task.canComplete) || canEdit(task));
	}

	function availabilityText(task: TaskView): string | null {
		if (!task.active) {
			return 'Inactive';
		}
		if (task.nextEligibleAt) {
			return `Next available ${formatDateTime(task.nextEligibleAt)}`;
		}
		if (task.canComplete) {
			return null;
		}
		if (isPartnershipTask(task) && task.createdByMe) {
			return null;
		}
		return 'Not available right now';
	}

	function isStatusMuted(task: TaskView): boolean {
		return !task.canComplete;
	}

	/** Each row with its content opened, or a placeholder while it opens (`sealed-views.svelte.ts`). */
	const rows = $derived(tasks.map((task) => ({ task, content: openedTask(task) })));

	const completing = new ItemAction();

	/**
	 * A completed task that the refreshed list no longer has slides shut, so
	 * the cards under it close the gap rather than jumping. One that stays (a
	 * repeating task) just changes in place. Nothing slides with reduced motion.
	 */
	function leave(node: Element) {
		return slide(node, { duration: prefersReducedMotion.current ? 0 : 250 });
	}
</script>

{#if tasks.length === 0}
	<p class="empty">{emptyMessage}</p>
{:else}
	<div class="list">
		{#each rows as { task, content } (task.id)}
			<div class="row" out:leave>
				<ItemCard
					title={shownTitle(content)}
					inactive={!task.active}
					celebrating={completing.celebrating === task.id}
					value={task.creditsAwarded > 0 ? credits : undefined}
					actions={hasActions(task) ? taskActions : undefined}
					status={availabilityText(task) ? availability : undefined}
				>
					{#snippet meta()}
						<p class="schedule">{describeTaskSchedule(task.schedule)}</p>
						{#if task.timeZoneNote}
							<TimeZoneDisplay
								timeZone={task.timeZoneNote.timeZone}
								referenceTimeZone={task.timeZoneNote.referenceTimeZone}
								date={task.timeZoneNote.date}
								showCurrentTime={task.timeZoneNote.showCurrentTime}
							/>
						{/if}
					{/snippet}

					{#if content?.description}<RichText text={content.description} />{/if}
				</ItemCard>
			</div>

			<!--
				The credits always sit in the card's value slot, beside the actions,
				whether or not the viewer can act on the task. They used to move to the
				title row when there was no button, so an inactive task's credits
				were somewhere else from every other card's.
			-->
			{#snippet credits()}
				<span class:muted-credits={!task.active} class="credits action-credits">
					{creditAwardLabel(task.creditsAwarded)}
				</span>
				{#if completing.celebrating === task.id}
					<!-- What was earned, rising off the label as the check lands. -->
					<span class="burst" aria-hidden="true">+{task.creditsAwarded}</span>
				{/if}
			{/snippet}

			{#snippet availability()}
				<p class:muted={isStatusMuted(task)}>{availabilityText(task)}</p>
			{/snippet}

			{#snippet taskActions()}
				{#if completeAction && task.canComplete}
					<form method="POST" action={completeAction} use:enhance={completing.enhance(task.id)}>
						<input type="hidden" name="taskId" value={task.id} />
						{#if completePartnershipId}
							<input type="hidden" name="partnershipId" value={completePartnershipId} />
						{/if}
						<!-- Amber: the one thing on the card worth doing, and only shown
						     when it can be done. -->
						<wa-button
							type="submit"
							variant="brand"
							appearance="accent"
							disabled={completing.waiting(task.id)}
						>
							{#if completing.celebrating === task.id}
								<wa-icon class="done" name="check" variant="solid" label="Completed"></wa-icon>
							{:else}
								Complete
							{/if}
						</wa-button>
					</form>
				{/if}
				{#if canEdit(task) && editHref}
					<!-- The title is in the name, so a list of cards is not a list of
					     links all called "Edit". -->
					<wa-button appearance="outlined" href={editHref(task.id)}
						>Edit <span class="wa-visually-hidden">{shownTitle(content)}</span></wa-button
					>
				{/if}
			{/snippet}
		{/each}
	</div>
{/if}

<style>
	.list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	p {
		margin: 0;
	}

	.muted,
	.empty {
		color: var(--wa-color-text-quiet);
	}

	.muted-credits {
		color: var(--wa-color-text-quiet);
	}

	.burst {
		display: none;
	}

	@media (prefers-reduced-motion: no-preference) {
		.burst {
			display: block;
			position: absolute;
			inset-inline-start: 0;
			inset-block-end: 100%;
			color: var(--wa-color-brand-on-quiet);
			animation: rise 700ms ease-out forwards;
		}

		.done {
			animation: pop 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
		}
	}

	@keyframes rise {
		from {
			opacity: 1;
			transform: translateY(0);
		}
		to {
			opacity: 0;
			transform: translateY(-0.75rem);
		}
	}

	@keyframes pop {
		from {
			transform: scale(0.8);
		}
	}
</style>
