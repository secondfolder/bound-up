<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import CreditBalances from '$lib/components/CreditBalances.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import QuickAddLink from '$lib/components/QuickAddLink.svelte';
	import TaskChecklist from '$lib/components/TaskChecklist.svelte';
	import { partnerName } from '$lib/partner-names.svelte';
	import type { TaskEntry } from '$lib/task-list';
	import type { ActionData, LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	/**
	 * The page's action result, read from `page` because a layout is not handed
	 * `form`: the list lives here so the add, edit and history sheets (child
	 * routes) open over it.
	 */
	const form = $derived(page.form as ActionData | null | undefined);
	const backHref = $derived(resolve('/(auth-required)/(app)/home'));
	const historyHref = $derived(resolve('/(auth-required)/(app)/home/tasks/history'));
	const addHref = $derived(resolve('/(auth-required)/(app)/home/tasks/add'));

	/**
	 * One to-do list: the viewer's own tasks and every task a partner set for
	 * them, each of a partner's named by whose it is. There used to be a panel
	 * per partner, each with its own buttons, stacked under the viewer's own.
	 */
	const entries: TaskEntry[] = $derived([
		...data.selfTasks.tasks.map((task) => ({
			task,
			completeAction: '?/selfCompleteTask',
			undoAction: '?/selfUndoCompletion',
			editHref: resolve('/(auth-required)/(app)/home/tasks/[taskId]', { taskId: task.id })
		})),
		...data.partnerTasks.flatMap((section) =>
			section.tasks.map((task) => ({
				task,
				completeAction: '?/partnerCompleteTask',
				undoAction: '?/partnerUndoCompletion',
				partnershipId: section.partnershipId,
				partnerName: partnerName(section.names),
				partnerImage: section.image,
				listHref: resolve('/(auth-required)/(app)/partner/[id]/tasks', {
					id: section.partnershipId
				})
			}))
		)
	]);

	/**
	 * Where the credits go: the viewer's own balance for their own tasks, and
	 * their balance with each partner for that partner's. Kept apart, because
	 * they are spent on different rewards.
	 */
	const balances = $derived([
		{ key: 'self', label: 'Yours', credits: data.selfTasks.credits },
		...data.partnerTasks.map((section) => {
			const name = partnerName(section.names);
			return {
				key: section.partnershipId,
				label: `With ${name}`,
				credits: section.credits,
				partner: { name, image: section.image }
			};
		})
	]);

	/** The completion just made, which the list offers to undo in the task's place. */
	const completion = $derived(
		form && 'completionId' in form && form.completionId && form.taskId
			? { id: form.completionId, taskId: form.taskId }
			: null
	);
</script>

<section class="page">
	<NestedPageHeader
		{backHref}
		backLabel="Back to home"
		backText="Home"
		title="Tasks"
		description="Your own tasks, and the ones your partners have set for you."
	>
		{#snippet actions()}
			<CreditBalances {balances} />
			<wa-button appearance="plain" pill href={historyHref}>
				<wa-icon name="clock-rotate-left" variant="solid" label="Completion history"></wa-icon>
			</wa-button>
		{/snippet}
	</NestedPageHeader>

	<div class="content">

		<!-- No success message: a completion says so in the task's own line,
		     and an undone one by the task coming back. Refusals, here. -->
		{#if form?.error}<p class="invalid">{form.error}</p>{/if}

		<QuickAddLink href={addHref} label="Add a task" />

		<TaskChecklist
			{entries}
			mode="to-do"
			{completion}
			emptyMessage="Nothing to do yet. Add a task of your own, or wait for a partner to set you one."
		/>
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
		padding: 0 var(--page-gutter);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.invalid {
		margin: 0;
		color: var(--wa-color-text-danger);
	}
</style>
