<script lang="ts">
	import { untrack } from 'svelte';
	import ItemGroup from '$lib/components/ItemGroup.svelte';
	import TaskDetailDialog from '$lib/components/TaskDetailDialog.svelte';
	import TaskRow from '$lib/components/TaskRow.svelte';
	import TaskUndoRow from '$lib/components/TaskUndoRow.svelte';
	import { ItemAction } from '$lib/item-action.svelte';
	import { openedTask, shownTitle } from '$lib/sealed-views.svelte';
	import type { TaskEntry, TaskListMode } from '$lib/task-list';
	import { groupTasksSet, groupTasksToDo } from '$lib/tasks';

	/**
	 * Tasks as a to-do list, grouped by what can be done about them. For the
	 * viewer's own to-do list: Ready, Later, Inactive. For tasks the viewer set
	 * for their partner: Waiting on them, Done for now, Inactive. Tapping a task
	 * opens its detail. See docs/tasks.md, "The checklist".
	 */
	let {
		entries,
		mode,
		partnerName = null,
		emptyMessage,
		completion = null
	}: {
		entries: TaskEntry[];
		mode: TaskListMode;
		/** Who the tasks were set for, in `set` mode: "Waiting on Jun". */
		partnerName?: string | null;
		emptyMessage: string;
		/** The completion just made, as the complete action answered; null for none. */
		completion?: { id: string; taskId: string } | null;
	} = $props();

	/** How long the undo line stays; it waits while hovered or focused. */
	const UNDO_SHOWN_MS = 10_000;

	const completing = new ItemAction();

	type Group = {
		key: string;
		title: string;
		entries: TaskEntry[];
		collapsed: boolean;
		headless?: boolean;
	};

	const groups: Group[] = $derived.by(() => {
		const byTask = new Map(entries.map((entry) => [entry.task.id, entry]));
		const back = (subset: TaskEntry['task'][]) =>
			subset.flatMap((task) => {
				const entry = byTask.get(task.id);
				return entry ? [entry] : [];
			});
		const tasks = entries.map((entry) => entry.task);
		if (mode === 'set') {
			// One list with no heading, the ones still to do first: the page's
			// tab already says whose these are, and each row's ring says how far
			// along it is. Only the inactive ones are set apart.
			const set = groupTasksSet(tasks);
			return [
				{
					key: 'current',
					title: partnerName ? `Tasks set for ${partnerName}` : 'Tasks set',
					entries: back([...set.waiting, ...set.doneForNow]),
					collapsed: false,
					headless: true
				},
				{ key: 'inactive', title: 'Inactive', entries: back(set.inactive), collapsed: true }
			];
		}
		const toDo = groupTasksToDo(tasks);
		return [
			{ key: 'ready', title: 'Ready', entries: back(toDo.ready), collapsed: false },
			{ key: 'later', title: 'Later', entries: back(toDo.later), collapsed: false },
			{ key: 'inactive', title: 'Inactive', entries: back(toDo.inactive), collapsed: true }
		];
	});

	/**
	 * Where a task sat when it was ticked, and what it was.
	 *
	 * Noted as the completion is posted, because by the time the answer
	 * arrives the list has reloaded and the task has moved — a one-off to
	 * Inactive, or off `/home/tasks` altogether, since a partner's inactive
	 * tasks are not listed there. The undo line goes back where the tap was.
	 */
	let ticked = $state<{ entry: TaskEntry; groupKey: string; index: number } | null>(null);
	$effect.pre(() => {
		const taskId = completing.pending;
		if (!taskId) {
			return;
		}
		untrack(() => {
			for (const group of groups) {
				const index = group.entries.findIndex((candidate) => candidate.task.id === taskId);
				const entry = group.entries[index];
				if (entry) {
					ticked = { entry, groupKey: group.key, index };
					return;
				}
			}
		});
	});

	let dismissedId = $state<string | null>(null);
	let held = $state(false);

	/** The undo line, while there is a completion of a task ticked here to offer it for. */
	const undo = $derived(
		completion &&
			ticked &&
			completion.taskId === ticked.entry.task.id &&
			completion.id !== dismissedId &&
			ticked.entry.undoAction
			? { ...ticked, completionId: completion.id, action: ticked.entry.undoAction }
			: null
	);

	$effect(() => {
		if (!undo || held) {
			return;
		}
		const id = undo.completionId;
		const timer = setTimeout(() => {
			dismissedId = id;
			held = false;
		}, UNDO_SHOWN_MS);
		return () => clearTimeout(timer);
	});

	type Row = { kind: 'task'; key: string; entry: TaskEntry } | { kind: 'undo'; key: string };

	/** The groups as shown: the ticked task kept out of sight, its undo line where it was. */
	const shown = $derived(
		groups.map((group) => {
			const rows: Row[] = group.entries
				.filter((entry) => entry.task.id !== undo?.entry.task.id)
				.map((entry) => ({ kind: 'task', key: entry.task.id, entry }));
			if (undo?.groupKey === group.key) {
				rows.splice(Math.min(undo.index, rows.length), 0, {
					kind: 'undo',
					key: `undo-${undo.completionId}`
				});
			}
			return { ...group, rows };
		})
	);

	/**
	 * The task whose detail is open, by id, so the dialog follows the task
	 * through a refresh (a completion re-runs the loads) and closes if it goes.
	 */
	let openId = $state<string | null>(null);
	const openEntry = $derived(entries.find((entry) => entry.task.id === openId) ?? null);
</script>

<!-- Says so to a screen reader: the line that changes is not a live region. -->
<p class="wa-visually-hidden" role="status">{undo ? 'Task completed.' : ''}</p>

{#if entries.length === 0 && !undo}
	<p class="empty">{emptyMessage}</p>
{:else}
	<div class="checklist">
		{#each shown as group (group.key)}
			{#if group.rows.length > 0}
				<ItemGroup
					title={group.title}
					count={group.rows.length}
					collapsed={group.collapsed}
					headless={group.headless}
				>
					{#each group.rows as row (row.key)}
						{#if row.kind === 'undo' && undo}
							<TaskUndoRow
								title={shownTitle(openedTask(undo.entry.task))}
								creditsAwarded={undo.entry.task.creditsAwarded}
								action={undo.action}
								completionId={undo.completionId}
								partnershipId={undo.entry.partnershipId}
								onhold={(value) => {
									held = value;
								}}
							/>
						{:else if row.kind === 'task'}
							<TaskRow
								entry={row.entry}
								{mode}
								{partnerName}
								selected={openId === row.entry.task.id}
								{completing}
								onopen={() => {
									openId = row.entry.task.id;
								}}
							/>
						{/if}
					{/each}
				</ItemGroup>
			{/if}
		{/each}
	</div>
{/if}

{#if openEntry}
	<TaskDetailDialog
		entry={openEntry}
		{mode}
		{partnerName}
		{completing}
		onclose={() => {
			openId = null;
		}}
	/>
{/if}

<style>
	.checklist {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);
	}

	.empty {
		margin: 0;
		color: var(--wa-color-text-quiet);
	}
</style>
