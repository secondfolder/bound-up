<script lang="ts">
	import type { SuperValidated } from 'sveltekit-superforms';
	import { page } from '$app/state';
	import SealedTaskEditor from '$lib/components/SealedTaskEditor.svelte';
	import { partnerName } from '$lib/partner-names.svelte';
	import type { PartnerNamesSource } from '$lib/partnership';
	import type { TaskContent } from '$lib/sealed-kinds/tasks';
	import { openedTask } from '$lib/sealed-views.svelte';
	import type { TaskEditorFormValues } from '$lib/task-editor-form';
	import type { TaskView } from '$lib/task-list';

	/**
	 * Adding or editing a task, self or partnership: what the four add and edit
	 * pages show under their headers, and what the task list's sheet shows
	 * (`RoutedDialog` over those same routes), so the two cannot drift.
	 */
	let {
		taskForm,
		task = null,
		partner = null,
		action,
		onsaved
	}: {
		/** The settings, as the route's load prepared them. */
		taskForm: SuperValidated<TaskEditorFormValues>;
		/** The task being edited; null to add one. */
		task?: TaskView | null;
		/** The partnership a partnership task belongs to; null for a self task. */
		partner?: {
			id: string;
			names: PartnerNamesSource;
			counterpartUserId: string;
			counterpartTimezone: string;
		} | null;
		/** The route's action, from a sheet on another page. */
		action?: string;
		onsaved?: () => void;
	} = $props();

	const opened = $derived(task ? openedTask(task) : null);
	/**
	 * The content as first opened, held so the editor is mounted once: a save
	 * re-runs the load, and the new ciphertext reads as "still opening" for a
	 * moment, which would otherwise unmount the form and lose its state.
	 */
	let content = $state<TaskContent | null | undefined>(undefined);
	$effect(() => {
		if (content === undefined && opened !== undefined) {
			content = opened;
		}
	});

	const timeZoneContext = $derived(
		partner && page.data.user
			? {
					viewerUserId: page.data.user.id,
					viewerTimezone: page.data.user.timezone,
					counterpartUserId: partner.counterpartUserId,
					counterpartTimezone: partner.counterpartTimezone,
					counterpartName: partnerName(partner.names)
				}
			: null
	);
	const sealScope = $derived(
		partner ? { kind: 'partnership' as const, partnershipId: partner.id } : { kind: 'self' as const }
	);
</script>

{#if !task}
	<SealedTaskEditor {taskForm} {sealScope} submitLabel="Add task" {timeZoneContext} {action} {onsaved} />
{:else if content === undefined}
	<p class="quiet">…</p>
{:else if content === null}
	<p class="quiet">This task can't be shown on this device right now.</p>
{:else}
	<SealedTaskEditor
		{taskForm}
		{sealScope}
		task={{ id: task.id, revision: task.revision, content }}
		submitLabel="Save task"
		{timeZoneContext}
		{action}
		{onsaved}
	/>
{/if}

<style>
	.quiet {
		margin: 0;
		color: var(--wa-color-text-quiet);
	}
</style>
