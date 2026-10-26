<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import CreditBalances from '$lib/components/CreditBalances.svelte';
	import FloatingAddButton from '$lib/components/FloatingAddButton.svelte';
	import ListDock from '$lib/components/ListDock.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import SegmentedTabs from '$lib/components/SegmentedTabs.svelte';
	import TaskChecklist from '$lib/components/TaskChecklist.svelte';
	import { partnerName } from '$lib/partner-names.svelte';
	import type { TaskEntry } from '$lib/task-list';
	import type { PartnershipTaskView } from '$lib/types';
	import type { ActionData, LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	/**
	 * The page's action result, read from `page` because a layout is not handed
	 * `form`: the list lives here so the add, edit and history sheets (child
	 * routes) open over it.
	 */
	const form = $derived(page.form as ActionData | null | undefined);
	/** What the viewer calls them, opened in the browser (`partner-names.svelte.ts`). */
	const partnerShown = $derived(partnerName(data.partner.names));
	const backHref = $derived(resolve('/(auth-required)/(app)/partner/[id]', { id: data.partner.id }));
	const addTaskHref = $derived(
		resolve('/(auth-required)/(app)/partner/[id]/tasks/add', { id: data.partner.id })
	);
	const historyHref = $derived(
		resolve('/(auth-required)/(app)/partner/[id]/tasks/history', { id: data.partner.id })
	);
	const hasSharedControl = $derived(data.partner.canManageTasks && data.partner.canCompleteTasks);

	function entry(task: PartnershipTaskView): TaskEntry {
		const canEdit = data.partner.canManageTasks && task.createdByMe;
		return {
			task,
			completeAction: data.partner.canCompleteTasks && !task.createdByMe ? '?/completeTask' : null,
			undoAction: '?/undoCompletion',
			editHref: canEdit
				? resolve('/(auth-required)/(app)/partner/[id]/tasks/[taskId]', {
						id: data.partner.id,
						taskId: task.id
					})
				: null,
			contentSave: canEdit
				? {
						action: '?/taskContent',
						scope: { kind: 'partnership', partnershipId: data.partner.id }
					}
				: null
		};
	}

	/** Theirs to set you, and yours to set them: each is its own list. */
	const forViewer = $derived(data.tasks.filter((task) => !task.createdByMe).map(entry));
	const forPartner = $derived(data.tasks.filter((task) => task.createdByMe).map(entry));

	const description = $derived.by(() => {
		if (!data.partner.canManageTasks) {
			return `Tasks ${partnerShown} has set for you.`;
		}
		return data.partner.canCompleteTasks
			? 'Tasks you set each other.'
			: `Tasks you set for ${partnerShown}.`;
	});

	/**
	 * The balances these tasks pay into: the viewer's, when they complete
	 * them, and their partner's, when they set them.
	 */
	const balances = $derived([
		...(data.partner.canCompleteTasks
			? [{ key: 'viewer', label: 'Yours', credits: data.viewerCredits }]
			: []),
		...(data.partner.canManageTasks
			? [
					{
						key: 'partner',
						label: partnerShown,
						credits: data.counterpartCredits,
						partner: {
							name: partnerShown,
							image: data.partners.find((partner) => partner.id === data.partner.id)?.image ?? null
						}
					}
				]
			: [])
	]);

	/**
	 * The tabs, the viewer's partner's first (and so shown first) when the
	 * viewer sets tasks: setting them is what someone in control comes here to
	 * do. The tabs only appear under shared control, where both sides do.
	 */
	const tabs = $derived.by(() => {
		const forYou = { id: 'for-you', label: 'For you', count: forViewer.length };
		const forThem = { id: 'for-them', label: `For ${partnerShown}`, count: forPartner.length };
		return data.partner.canManageTasks ? [forThem, forYou] : [forYou, forThem];
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
		{backHref}
		backLabel="Back to partner"
		backText={partnerShown}
		title="Tasks"
		{description}
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

		{#if hasSharedControl}
			<!-- Split by who does them, which was two stacked panels: which of
			     these is mine to do is the first thing anyone wants to know. -->
			<SegmentedTabs
				label="Whose tasks"
				tabs={tabs}
			>
				{#snippet panel(id)}
					{#if id === 'for-you'}{@render toDo()}{:else}{@render set()}{/if}
				{/snippet}
			</SegmentedTabs>
		{:else if data.partner.canManageTasks}
			{@render set()}
		{:else}
			{@render toDo()}
		{/if}

		{#snippet toDo()}
			<TaskChecklist
				entries={forViewer}
				mode="to-do"
				partnerName={partnerShown}
				{completion}
				emptyMessage={`${partnerShown} has not set you any tasks yet.`}
			/>
		{/snippet}
		{#snippet set()}
			<TaskChecklist
				entries={forPartner}
				mode="set"
				partnerName={partnerShown}
				emptyMessage={`You have not set ${partnerShown} any tasks yet.`}
			/>
		{/snippet}
	</div>

	{#if data.partner.canManageTasks}
		<ListDock>
			<FloatingAddButton href={addTaskHref} label="Add a task" />
		</ListDock>
	{/if}

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
