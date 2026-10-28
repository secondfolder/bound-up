<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import AddButton from '$lib/components/AddButton.svelte';
	import CreditsControl from '$lib/components/CreditsControl.svelte';
	import ContextSwitcher from '$lib/components/context/ContextSwitcher.svelte';
	import ItemsTabs from '$lib/components/ItemsTabs.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import TaskChecklist from '$lib/components/TaskChecklist.svelte';
	import { shownSpace } from '$lib/context-client.svelte';
	import { creditGroups, itemTargets, partnerIn, shownSpaces } from '$lib/item-pages.svelte';
	import { sealScopeForSpace } from '$lib/sealed-forms';
	import type { TaskEntry } from '$lib/task-list';
	import type { TaskView } from '$lib/types';
	import type { ActionData, LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	/**
	 * The page's action result, read from `page` because a layout is not handed
	 * `form`: the list lives here so the add, edit and history sheets (child
	 * routes) open over it.
	 */
	const form = $derived(page.form as ActionData | null | undefined);
	const historyHref = resolve('/(auth-required)/(app)/tasks/history');

	/** The spaces the list shows, as the switcher knows them: one, or several in Everyone. */
	const spaces = $derived(shownSpaces(data.list.spaces, data.contextSpaces));
	const several = $derived(spaces.length > 1);
	const only = $derived(spaces.length === 1 ? spaces[0] : undefined);
	/** Where the viewer may add a task to, from here: the add button's choices. */
	const targets = $derived(
		itemTargets(data.list.spaces, data.contextSpaces).map((target) => target.spaceId)
	);

	/**
	 * Opens the add sheet for the space picked (or the only one), handed over
	 * in history state rather than the URL (`PageState.addFor`), so the sheet
	 * skips "For whom?". The sheet posts it; nothing reads the context.
	 */
	function add(spaceId: string) {
		void goto(resolve('/(auth-required)/(app)/tasks/add'), { state: { addFor: spaceId } });
	}

	function entry(task: TaskView, mode: 'to-do' | 'set'): TaskEntry {
		const space = spaces.find((candidate) => candidate.id === task.spaceId) ?? null;
		return {
			task,
			completeAction: mode === 'to-do' ? '?/complete' : null,
			undoAction: '?/undo',
			// Whose space it is in, said on each row only where the list mixes several.
			space: several ? space : null,
			partnerName: partnerIn(task.spaceId, data.contextSpaces),
			editHref: task.canManage
				? resolve('/(auth-required)/(app)/tasks/[taskId]', { taskId: task.id })
				: null,
			contentSave:
				task.canManage && space
					? { action: '?/content', scope: sealScopeForSpace({ spaceId: space.id, kind: space.kind }) }
					: null
		};
	}

	const toDo = $derived(data.list.toDo.map((task) => entry(task, 'to-do')));
	const setForOthers = $derived(data.list.setForOthers.map((task) => entry(task, 'set')));
	/** The partner a one-space list is about, for "Tasks set for Jun" and "Jun's time". */
	const partnerShown = $derived(only?.kind === 'shared' ? shownSpace(only).name : null);

	const credits = $derived(
		creditGroups(data.list.balances, data.contextSpaces, data.user?.name ?? '', { editable: false })
	);

	/** The completion just made, which the list offers to undo in the task's place. */
	const completion = $derived(
		form && 'completionId' in form && form.completionId && form.taskId
			? { id: form.completionId, taskId: form.taskId }
			: null
	);
</script>

<section class="page">
	<PageHeader title="Tasks & Rewards">
		{#snippet corner()}
			<ContextSwitcher spaces={data.contextSpaces} context={data.context} you={data.user?.name ?? ''} />
		{/snippet}
		{#snippet toolbar()}
			<ItemsTabs current="tasks" />
			<CreditsControl groups={credits} everyone={several} />
		{/snippet}
	</PageHeader>

	<div class="content">
		<!-- No success message: a completion says so in the task's own line,
		     and an undone one by the task coming back. Refusals, here. -->
		{#if form?.error}<p class="invalid">{form.error}</p>{/if}

		<section class="list" aria-labelledby="to-do">
			<h2 id="to-do">To do</h2>
			<TaskChecklist
				entries={toDo}
				mode="to-do"
				partnerName={partnerShown}
				{completion}
				emptyMessage={partnerShown
					? `${partnerShown} has not set you any tasks yet.`
					: 'Nothing to do yet. Add a task of your own with the + button, or wait for a partner to set you one.'}
			/>
		</section>

		<!-- Hidden in Me, and whenever it is empty: it is for the ones the
		     viewer set for someone else, in a space they manage. -->
		{#if setForOthers.length > 0}
			<section class="list" aria-labelledby="set-for-others">
				<h2 id="set-for-others">Set for others</h2>
				<TaskChecklist
					entries={setForOthers}
					mode="set"
					partnerName={partnerShown}
					emptyMessage="You have not set anyone any tasks yet."
				/>
			</section>
		{/if}

		<!-- At the end of the list, where looking back belongs: it used to be
		     a clock icon in the header, which on a phone wrapped onto a line of
		     its own under the balances. -->
		<a class="history" href={historyHref}>
			<wa-icon name="clock-rotate-left" variant="solid"></wa-icon>
			Completed tasks
			<wa-icon name="chevron-right" variant="solid"></wa-icon>
		</a>
	</div>

	<AddButton
		label="Add a task"
		lead="New task for"
		{targets}
		spaces={data.contextSpaces}
		you={data.user?.name ?? ''}
		onadd={add}
	/>

	{@render children()}
</section>

<style>
	/* Fills <main>, so the add button, its last child, sticks to the bottom. */
	.page {
		flex: 1 1 auto;
		max-width: var(--page-width);
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.content {
		padding: 0 var(--page-gutter) var(--wa-space-l);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);

		h2 {
			margin: 0;
			font-size: var(--wa-font-size-l);
		}
	}

	.invalid {
		margin: 0;
		color: var(--wa-color-text-danger);
	}

	.history {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		align-self: flex-start;
		min-block-size: 2.75rem;
		color: var(--wa-color-brand-on-quiet);
		font-weight: var(--wa-font-weight-semibold, 600);
		text-decoration: none;

		wa-icon:last-child {
			font-size: 0.75em;
		}
	}
</style>
