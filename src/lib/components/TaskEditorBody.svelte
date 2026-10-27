<script lang="ts">
	import type { SuperValidated } from 'sveltekit-superforms';
	import { page } from '$app/state';
	import SealedTaskEditor from '$lib/components/SealedTaskEditor.svelte';
	import type { ItemTarget } from '$lib/item-target';
	import { partnerName } from '$lib/partner-names.svelte';
	import { sealScopeForSpace } from '$lib/sealed-forms';
	import type { TaskContent } from '$lib/sealed-kinds/tasks';
	import { openedTask } from '$lib/sealed-views.svelte';
	import type { TaskEditorFormValues } from '$lib/task-editor-form';
	import type { TaskView } from '$lib/types';

	/**
	 * Adding or editing a task, in whichever space: what the add and edit
	 * sheets show, so the two cannot drift.
	 */
	let {
		taskForm,
		task = null,
		target,
		action,
		onsaved
	}: {
		/** The settings, as the route's load prepared them. */
		taskForm: SuperValidated<TaskEditorFormValues>;
		/** The task being edited; null to add one. */
		task?: TaskView | null;
		/**
		 * The space it is in: a new task's, which the form posts as `spaceId`
		 * (never the context's, docs/contexts.md), or the edited task's own.
		 * `partner` is who else is in a shared one, for whose time it runs in.
		 */
		target: ItemTarget;
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
		target.partner && page.data.user
			? {
					viewerUserId: page.data.user.id,
					viewerTimezone: page.data.user.timezone,
					counterpartUserId: target.partner.userId,
					counterpartTimezone: target.partner.timezone,
					counterpartName: partnerName(target.partner.names)
				}
			: null
	);
	const sealScope = $derived(sealScopeForSpace(target));

	/**
	 * A new task in a shared space runs in the partner's time unless changed:
	 * it is theirs to do. Given its own id, as superforms tells forms apart by
	 * it, so a sheet that changes "For whom?" starts a fresh form.
	 */
	const newTaskForm = $derived(
		target.partner
			? {
					...taskForm,
					id: `${taskForm.id}:${target.spaceId}`,
					data: { ...taskForm.data, timezoneOwnerUserId: target.partner.userId }
				}
			: taskForm
	);
	const fields = $derived({ spaceId: target.spaceId });
</script>

{#if !task}
	<SealedTaskEditor
		taskForm={newTaskForm}
		{sealScope}
		{fields}
		submitLabel="Add task"
		{timeZoneContext}
		{action}
		{onsaved}
	/>
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
