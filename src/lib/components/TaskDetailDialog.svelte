<script lang="ts">
	import ResponsiveDialog from '$lib/components/ResponsiveDialog.svelte';
	import RichText from '$lib/components/RichText.svelte';
	import WhoseTime from '$lib/components/WhoseTime.svelte';
	import { creditsLabel } from '$lib/credits';
	import { informalWhen, sentenceCase } from '$lib/informal-time';
	import type { ItemAction } from '$lib/item-action.svelte';
	import { openedTask, shownTitle } from '$lib/sealed-views.svelte';
	import { opensLater, quotaPeriod, type TaskEntry, type TaskListMode } from '$lib/task-list';
	import { describeTaskSchedule } from '$lib/task-schedule';

	/**
	 * Everything about one task that its row in the checklist leaves out: the
	 * description, the whole schedule, when it was last done, how far through
	 * its quota it is, and the deliberate way to complete it. A sheet on a
	 * phone, a dialog on a wider screen (`ResponsiveDialog`).
	 */
	let {
		entry,
		mode,
		partnerName = null,
		completing,
		onclose
	}: {
		entry: TaskEntry;
		mode: TaskListMode;
		/** The partner the list is about, for "Jun's time" where the entry does not name them. */
		partnerName?: string | null;
		completing: ItemAction;
		onclose: () => void;
	} = $props();

	let dialog: ResponsiveDialog | undefined = $state();

	const task = $derived(entry.task);
	const content = $derived(openedTask(task));
	const title = $derived(shownTitle(content));
	const canTick = $derived(mode === 'to-do' && entry.completeAction !== null && task.canComplete);
	/** Whether there is anything for the footer: it is left out rather than drawn empty. */
	const hasActions = $derived(
		Boolean((entry.listHref && entry.partnerName) || entry.editHref || canTick)
	);
	const quota = $derived(
		task.schedule.mode === 'rolling-window' && task.schedule.limit && task.windowCompletions !== null
			? { used: task.windowCompletions, of: task.schedule.limit.completions }
			: null
	);

	/** One square per completion the window allows, filled for each used. */
	const squares = $derived(
		quota ? Array.from({ length: quota.of }, (_, index) => index < quota.used) : []
	);

	/** When the sheet was opened, which is what "today" means in it. */
	const now = new Date();

	/**
	 * Completes through the row's own form, so a completion from here is the
	 * same post, the same celebration and the same undo as a tap on the circle.
	 * The dialog closes first, so the row can be seen celebrating.
	 */
	function complete() {
		const form = document.querySelector(`#complete-${task.id}`);
		dialog?.close();
		if (form instanceof HTMLFormElement) {
			form.requestSubmit();
		}
	}
</script>

<ResponsiveDialog bind:this={dialog} label={title} {onclose} footer={hasActions ? actions : undefined}>
	<div class="detail">
		{#if content?.description}<RichText text={content.description} />{/if}

		<dl class="facts">
			{#if entry.partnerName}
				<dt>From</dt>
				<dd>{entry.partnerName}</dd>
			{/if}
			<dt>Repeats</dt>
			<dd>{describeTaskSchedule(task.schedule)}</dd>
			{#if quota && task.schedule.mode === 'rolling-window' && task.schedule.limit}
				<dt>{sentenceCase(quotaPeriod(task.schedule.limit.every, task.schedule.limit.unit))}</dt>
				<dd class="quota">
					<span class="squares" aria-hidden="true">
						{#each squares as used, index (index)}
							<span class={['square', { used }]}></span>
						{/each}
					</span>
					{quota.used} of {quota.of}
				</dd>
			{/if}
			{#if !task.active}
				<dt>Status</dt>
				<dd>Inactive</dd>
			{:else if opensLater(task, now) && task.nextEligibleAt}
				<dt>Due again</dt>
				<dd>{informalWhen(task.nextEligibleAt, now)}</dd>
			{/if}
			{#if task.lastCompletedAt}
				<dt>Last done</dt>
				<dd>{informalWhen(task.lastCompletedAt, now)}</dd>
			{/if}
			{#if task.timeZoneNote}
				<dt>Runs on</dt>
				<dd>
					<WhoseTime
						name={entry.partnerName ?? partnerName ?? 'Their partner'}
						timeZone={task.timeZoneNote.timeZone}
						viewerTimeZone={task.timeZoneNote.referenceTimeZone}
					/>
				</dd>
			{/if}
			<dt>Awards</dt>
			<dd>{creditsLabel(task.creditsAwarded)}</dd>
		</dl>
	</div>
</ResponsiveDialog>

<!-- The thing to do first and widest, then the rest, as the design had it. -->
{#snippet actions()}
	{#if canTick}
		<wa-button
			class="complete"
			variant="brand"
			appearance="accent"
			disabled={completing.waiting(task.id)}
			onclick={complete}
		>
			Complete{task.creditsAwarded > 0 ? ` · +${task.creditsAwarded}` : ''}
		</wa-button>
	{/if}
	{#if entry.editHref}
		<!-- The edit form is a sheet of its own (its route's `RouteSheet`), so
		     this one gets out of its way. -->
		<wa-button appearance="outlined" href={entry.editHref} onclick={() => dialog?.close()}
			>Edit</wa-button
		>
	{/if}
	{#if entry.listHref && entry.partnerName}
		<wa-button appearance="plain" href={entry.listHref}>{entry.partnerName}'s task list</wa-button>
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
	}

	.quota {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.squares {
		display: flex;
		gap: 0.25rem;
	}

	wa-button.complete {
		flex: 1 1 auto;
	}

	.square {
		inline-size: 0.875rem;
		block-size: 0.875rem;
		border-radius: var(--wa-border-radius-s);
		background: var(--wa-color-surface-lowered);

		&.used {
			background: var(--wa-color-brand-fill-loud);
		}
	}
</style>
