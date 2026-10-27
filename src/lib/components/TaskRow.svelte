<script lang="ts">
	import ItemRow from '$lib/components/ItemRow.svelte';
	import { enhance } from '$lib/enhance';
	import type { ItemAction } from '$lib/item-action.svelte';
	import { openedTask, shownTitle } from '$lib/sealed-views.svelte';
	import { opensLater, quotaText, type TaskEntry, type TaskListMode } from '$lib/task-list';
	import { shortAvailability, shortTaskSchedule } from '$lib/task-schedule';
	import SpaceChip from './context/SpaceChip.svelte';
	import WhoseTime from './WhoseTime.svelte';

	/**
	 * One task in the checklist (`TaskChecklist`): a circle to tick when it can
	 * be completed now, a clock when it is not due yet, and nothing for a task
	 * the viewer set for their partner, which is not theirs to complete. See docs/tasks.md, "The checklist".
	 */
	let {
		entry,
		mode,
		partnerName = null,
		selected = false,
		completing,
		onopen
	}: {
		entry: TaskEntry;
		mode: TaskListMode;
		/**
		 * The partner the list is about, for "Jun's time" on a list that does not
		 * name them on each row (/tasks in a partnership's context).
		 */
		partnerName?: string | null;
		/** Its detail is open. */
		selected?: boolean;
		/** Shared by every row, so one in flight is known to all. */
		completing: ItemAction;
		onopen: () => void;
	} = $props();

	const task = $derived(entry.task);
	const title = $derived(shownTitle(openedTask(task)));
	/** When the row was last drawn: it is redrawn whenever the list's data is. */
	const now = $derived.by(() => {
		void task;
		return new Date();
	});
	const canTick = $derived(mode === 'to-do' && entry.completeAction !== null && task.canComplete);
	const celebrating = $derived(completing.celebrating === task.id);
	const quota = $derived(quotaText(task, mode));
	const later = $derived(opensLater(task, now));
	/**
	 * Whose time a task with a time zone note runs in. A note only appears when
	 * that time is not the viewer's, so it is always their partner's.
	 */
	const whose = $derived(entry.partnerName ?? partnerName ?? 'Their partner');
	/**
	 * Not doable yet, or done for now on the side that set it: greyed, as it
	 * cannot be completed before then.
	 */
	const notYet = $derived(later);
	const scheduleIcon = $derived(
		{
			'one-off': null,
			'rolling-window': 'repeat',
			'after-completion': 'repeat',
			scheduled: 'calendar'
		}[task.schedule.mode]
	);
	/**
	 * The schedule, with the quota after it on the to-do side ("3× a week · 1
	 * left"), or in its place on the side that set it ("1 of 3 this week"):
	 * there the quota is what is worth knowing.
	 */
	const scheduleText = $derived.by(() => {
		const schedule = shortTaskSchedule(task.schedule);
		if (!quota) {
			return schedule;
		}
		return mode === 'set' ? quota : `${schedule} · ${quota}`;
	});
</script>

<!--
	Nothing at the start of a task the viewer set: they cannot complete it, so
	there is no circle to show, and a ring there (how far along their partner
	was) was a control-shaped thing that did nothing. Every row of such a list is
	one, so the column goes altogether rather than standing empty; the quota
	("1 of 3 this week") and when it is due again say what the ring did.
-->
<ItemRow
	{title}
	{onopen}
	{celebrating}
	{selected}
	dimmed={!task.active}
	quiet={notYet}
	leading={mode === 'set' ? undefined : leading}
>
	{#snippet meta()}
		{#if entry.space}
			<!-- Whose space, on a list of several (Everyone): the chip every
			     Everyone list puts on its rows (docs/contexts.md). -->
			<SpaceChip space={entry.space} />
		{/if}
		{#if later && task.nextEligibleAt}
			<span class="when">
				<wa-icon name="clock" variant="regular"></wa-icon>
				{mode === 'set'
					? `Again ${shortAvailability(task.nextEligibleAt, now, undefined, undefined, { capitalise: false })}`
					: shortAvailability(task.nextEligibleAt, now)}
			</span>
		{/if}
		<span class="piece">
			{#if scheduleIcon}<wa-icon name={scheduleIcon} variant="solid"></wa-icon>{/if}
			{scheduleText}
		</span>
		{#if task.timeZoneNote}
			<WhoseTime
				name={whose}
				timeZone={task.timeZoneNote.timeZone}
				viewerTimeZone={task.timeZoneNote.referenceTimeZone}
			/>
		{/if}
	{/snippet}

	{#snippet trailing()}
		{#if task.creditsAwarded > 0}
			<span class="award">
				+{task.creditsAwarded}<span class="wa-visually-hidden"
					>{' '}credit{task.creditsAwarded === 1 ? '' : 's'}</span
				>
			</span>
			{#if celebrating}
				<!-- What was earned, rising off the number as the circle fills. -->
				<span class="burst" aria-hidden="true">+{task.creditsAwarded}</span>
			{/if}
		{/if}
	{/snippet}
</ItemRow>

{#snippet leading()}
	{#if canTick && entry.completeAction}
		<!-- The form a row's detail dialog submits too (`requestSubmit`), so
		     both ways of completing post exactly the same thing. -->
		<form
			id={`complete-${task.id}`}
			method="POST"
			action={entry.completeAction}
			use:enhance={completing.enhance(task.id)}
		>
			<input type="hidden" name="taskId" value={task.id} />
			<!-- A native button drawn as a circle, not a `wa-button`: it is the
			     tick box of a to-do list, and the round control is the whole of
			     it. Named by the task, so a list of them is not a list of
			     buttons all called "Complete". -->
			<button
				type="submit"
				class={['tick', { done: celebrating }]}
				aria-label={`Complete ${title}`}
				disabled={completing.waiting(task.id)}
			>
				<span class="circle"><wa-icon name="check" variant="solid"></wa-icon></span>
			</button>
		</form>
	{:else if later}
		<span class="waiting" aria-hidden="true"><wa-icon name="clock" variant="regular"></wa-icon></span>
	{:else}
		<span class="waiting" aria-hidden="true"></span>
	{/if}
{/snippet}

<style>
	form {
		display: contents;
	}

	/* The button is the whole leading cell, a comfortable tap target; the
	   circle drawn inside it is smaller. */
	/* Reset from Web Awesome's native-button look (see ItemRow's `.open`). */
	.tick {
		display: grid;
		place-items: center;
		inline-size: 100%;
		block-size: 100%;
		margin: 0;
		transform: none;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: none;
		cursor: pointer;

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: calc(var(--wa-focus-ring-offset) - 0.375rem);
		}

		&:disabled {
			cursor: progress;
		}
	}

	.circle {
		display: grid;
		place-items: center;
		inline-size: 1.625rem;
		block-size: 1.625rem;
		border: 2px solid var(--wa-color-brand-border-loud);
		border-radius: 50%;
		color: transparent;
		font-size: 0.875rem;
		transition:
			background-color 150ms,
			color 150ms;

		@media (hover: hover) {
			.tick:hover:not(:disabled) & {
				background: var(--wa-color-brand-fill-quiet);
				color: var(--wa-color-brand-on-quiet);
			}
		}

		.tick:disabled & {
			opacity: 0.6;
		}

		.tick.done & {
			background: var(--wa-color-brand-fill-loud);
			color: var(--wa-color-brand-on-loud);
			opacity: 1;
		}
	}

	.waiting {
		display: grid;
		place-items: center;
		inline-size: 1.625rem;
		block-size: 1.625rem;
		border: 2px dashed color-mix(in oklab, var(--wa-color-text-quiet) 60%, transparent);
		border-radius: 50%;
		color: var(--wa-color-text-quiet);
		font-size: 0.75rem;
	}

	.when {
		color: var(--wa-color-brand-on-normal);
	}

	.when,
	.piece {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;

		& wa-icon {
			font-size: 0.75rem;
		}
	}

	.award {
		color: var(--wa-color-brand-on-normal);
	}

	.burst {
		display: none;
	}

	@media (prefers-reduced-motion: no-preference) {
		.burst {
			display: block;
			position: absolute;
			inset-inline-end: 0;
			inset-block-end: 100%;
			color: var(--wa-color-brand-on-quiet);
			animation: rise 700ms ease-out forwards;
		}

		.tick.done wa-icon {
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
			transform: scale(0.6);
		}
	}
</style>
