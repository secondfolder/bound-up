<script lang="ts">
	import ManagedTaskList from '$lib/components/ManagedTaskList.svelte';
	import SectionPanel from '$lib/components/SectionPanel.svelte';
	import type { PartnershipTaskView, SelfTaskView } from '$lib/types';

	type TaskView = SelfTaskView | PartnershipTaskView;

	type Props = {
		/** Null on a page whose title already names the one list on it. */
		title?: string | null;
		tasks: TaskView[];
		emptyMessage: string;
		completeAction?: string | null;
		completePartnershipId?: string | null;
		editHref?: ((taskId: string) => string) | null;
		historyHref?: string | null;
		historyLabel?: string;
		addHref?: string | null;
		addLabel?: string;
		extraHref?: string | null;
		extraLabel?: string;
		wrapInPanel?: boolean;
		class?: string;
	};

	let {
		title = null,
		tasks,
		emptyMessage,
		completeAction = null,
		completePartnershipId = null,
		editHref = null,
		historyHref = null,
		historyLabel = 'Completion history',
		addHref = null,
		addLabel = 'Add a task',
		extraHref = null,
		extraLabel = '',
		wrapInPanel = true,
		class: className = ''
	}: Props = $props();

	const hasActions = $derived(Boolean(historyHref || (extraHref && extraLabel) || addHref));
</script>

<SectionPanel {title} framed={wrapInPanel} class={className} actions={hasActions ? sectionActions : undefined}>
	<ManagedTaskList {tasks} {emptyMessage} {completeAction} {completePartnershipId} {editHref} />
</SectionPanel>

<!-- The same order on every tasks and rewards page: where to look first, then
     the one that makes something new, last. -->
{#snippet sectionActions()}
	{#if historyHref}
		<wa-button appearance="outlined" href={historyHref}>{historyLabel}</wa-button>
	{/if}
	{#if extraHref && extraLabel}
		<wa-button appearance="outlined" href={extraHref}>{extraLabel}</wa-button>
	{/if}
	{#if addHref}
		<wa-button appearance="outlined" href={addHref}>{addLabel}</wa-button>
	{/if}
{/snippet}
