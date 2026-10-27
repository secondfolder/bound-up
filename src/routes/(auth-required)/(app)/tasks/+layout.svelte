<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import CreditBalances from '$lib/components/CreditBalances.svelte';
	import ContextSwitcher from '$lib/components/context/ContextSwitcher.svelte';
	import ItemsTabs from '$lib/components/ItemsTabs.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import QuickAddLink from '$lib/components/QuickAddLink.svelte';
	import TaskChecklist from '$lib/components/TaskChecklist.svelte';
	import { shownSpace } from '$lib/context-client.svelte';
	import { balancePills, itemTargets, partnerIn, shownSpaces } from '$lib/item-pages.svelte';
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
	const addHref = resolve('/(auth-required)/(app)/tasks/add');

	/** The spaces the list shows, as the switcher knows them: one, or several in Everyone. */
	const spaces = $derived(shownSpaces(data.list.spaces, data.contextSpaces));
	const several = $derived(spaces.length > 1);
	const only = $derived(spaces.length === 1 ? spaces[0] : undefined);
	/** Somewhere the viewer may add a task to, from here. */
	const canAdd = $derived(itemTargets(data.list.spaces, data.contextSpaces).length > 0);

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

	const balances = $derived(
		balancePills(data.list.balances, data.contextSpaces, data.partners, { editable: false })
	);

	const description = $derived.by(() => {
		if (several) {
			return 'Your own tasks, and the ones you and your partners set each other.';
		}
		if (partnerShown) {
			return `Tasks you and ${partnerShown} set each other.`;
		}
		return 'Your own tasks, for nobody but you.';
	});

	/** The completion just made, which the list offers to undo in the task's place. */
	const completion = $derived(
		form && 'completionId' in form && form.completionId && form.taskId
			? { id: form.completionId, taskId: form.taskId }
			: null
	);
</script>

<section class="page">
	<NestedPageHeader
		backHref={resolve('/(auth-required)/(app)/home')}
		backLabel="Back to home"
		backText="Home"
		title="Tasks"
		{description}
	>
		{#snippet actions()}
			<CreditBalances {balances} />
			<wa-button appearance="plain" pill href={historyHref}>
				<wa-icon name="clock-rotate-left" variant="solid" label="Completion history"></wa-icon>
			</wa-button>
		{/snippet}
		{#snippet corner()}
			<ContextSwitcher spaces={data.contextSpaces} context={data.context} you={data.user?.name ?? ''} />
		{/snippet}
	</NestedPageHeader>

	<div class="content">
		<ItemsTabs current="tasks" />

		<!-- No success message: a completion says so in the task's own line,
		     and an undone one by the task coming back. Refusals, here. -->
		{#if form?.error}<p class="invalid">{form.error}</p>{/if}

		{#if canAdd}<QuickAddLink href={addHref} label="Add a task" />{/if}

		<section class="list" aria-labelledby="to-do">
			<h2 id="to-do">To do</h2>
			<TaskChecklist
				entries={toDo}
				mode="to-do"
				partnerName={partnerShown}
				{completion}
				emptyMessage={partnerShown
					? `${partnerShown} has not set you any tasks yet.`
					: 'Nothing to do yet. Add a task of your own, or wait for a partner to set you one.'}
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
	</div>

	{@render children()}
</section>

<style>
	.page {
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
</style>
