<script lang="ts">
	import type { SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { invalidateAll } from '$app/navigation';
	import TaskForm from '$lib/components/TaskForm.svelte';
	import { taskEditorFormSchema } from '$lib/schemas/taskEditorForm';
	import { replaceWithSealed, type SealScope, sealForSubmit } from '$lib/sealed-forms';
	import { type TaskContent, taskKind } from '$lib/sealed-kinds/tasks';
	import { superForm } from '$lib/superform';
	import { type TaskEditorFormValues, taskContentFromEditorForm } from '$lib/task-editor-form';

	type TimeZoneContext = {
		viewerUserId: string;
		viewerTimezone: string;
		counterpartUserId: string;
		counterpartTimezone: string;
		counterpartName: string;
	};

	let {
		taskForm,
		sealScope,
		task = null,
		submitLabel,
		timeZoneContext = null,
		fields = {},
		action,
		onsaved
	}: {
		/** The settings, as the load prepared them. */
		taskForm: SuperValidated<TaskEditorFormValues>;
		sealScope: SealScope;
		/** The task being edited, opened; null to create one. */
		task?: { id: string; revision: number; content: TaskContent } | null;
		submitLabel: string;
		timeZoneContext?: TimeZoneContext | null;
		/** Posted beside the sealed record: a new task's `spaceId`, which the form names. */
		fields?: Record<string, string>;
		/**
		 * Where it posts, when that is not the page it is on: the add or edit
		 * route's action, from a sheet over the task list.
		 */
		action?: string;
		/** Called once it has saved, instead of following the action's redirect. */
		onsaved?: () => void;
	} = $props();

	/** The text fields, which are sealed and never posted as they are. */
	const TEXT_FIELDS = ['title', 'description', 'completionMessagesText'] as const;

	/** The kind's field names, as the editor names them. */
	const EDITOR_FIELD: Record<string, (typeof TEXT_FIELDS)[number]> = {
		title: 'title',
		description: 'description',
		completionMessages: 'completionMessagesText'
	};

	function describe(field: string): string {
		switch (field) {
			case 'title':
				return 'Please enter a task title of 80 characters or fewer';
			case 'description':
				return 'Please keep the description to 500 characters or fewer';
			case 'completionMessages':
				return 'Please keep each completion message to 1000 characters or fewer';
			default:
				return 'Please check the form and try again';
		}
	}

	let problem = $state<string | null>(null);
	let saved = $state(0);
	/**
	 * A new task's id, chosen here because it is part of what the content is
	 * sealed to. Kept across attempts, so a retry after a lost response cannot
	 * make the task twice: the second create is refused as a taken id.
	 */
	let newId: string | null = null;

	// svelte-ignore state_referenced_locally
	// Captured once on purpose, as on every superform: the stores it returns are
	// the live connection. A task being edited is mounted only once it is
	// opened (see the edit pages), so its content is here from the start, and
	// the form's own "unsaved changes" baseline includes it.
	// The opened task gets a distinct id because it is merged into a copy:
	// superforms recognises its initial form by identity, so the original still
	// in `page.data` under the same id would read as an update and be written
	// over the opened content as soon as the page store ticked.
	const initial: SuperValidated<TaskEditorFormValues> = task
		? {
				...taskForm,
				id: `${taskForm.id}:opened`,
				data: {
					...taskForm.data,
					title: task.content.title,
					description: task.content.description ?? '',
					completionMessagesText: task.content.completionMessages.join('\n')
				}
			}
		: taskForm;

	const superform = superForm(initial, {
		resetForm: false,
		validators: zod4Client(taskEditorFormSchema),
		async onSubmit({ formData, cancel }) {
			problem = null;
			// superforms validates after `onSubmit`, and this has to seal what it
			// validated, so it validates first itself.
			const checked = await superform.validateForm({ update: true });
			if (!checked.valid) {
				cancel();
				return;
			}
			const content = taskContentFromEditorForm(checked.data);
			newId ??= crypto.randomUUID();
			const outcome = await sealForSubmit(taskKind, {
				scope: sealScope,
				recordId: task?.id ?? newId,
				payload: content,
				describe
			});
			if (!outcome.ok) {
				cancel();
				const field = outcome.field ? EDITOR_FIELD[outcome.field] : undefined;
				if (field) {
					superform.errors.update((errors) => ({ ...errors, [field]: [outcome.error] }));
				} else {
					({ error: problem } = outcome);
				}
				return;
			}
			replaceWithSealed(formData, TEXT_FIELDS, {
				...fields,
				...outcome.fields,
				completionMessageCount: String(content.completionMessages.length),
				...(task ? { expectedRevision: String(task.revision) } : {})
			});
		},
		async onResult({ result, cancel }) {
			// Saved, in a sheet: the list under it is refreshed and the sheet
			// closes, rather than an add's redirect navigating to the page the
			// viewer is already on.
			if (onsaved && (result.type === 'redirect' || result.type === 'success')) {
				cancel();
				await invalidateAll();
				onsaved();
				return;
			}
			// The action answers a sealed post with a message or `{ saved }`, not
			// a superform — there are no fields of its to send back — so these two
			// are handled here, and superforms keeps what was typed.
			if (result.type === 'failure') {
				cancel();
				problem =
					typeof result.data?.error === 'string'
						? result.data.error
						: 'That task could not be saved. Reload and try again.';
			} else if (result.type === 'success') {
				cancel();
				saved += 1;
				await invalidateAll();
			}
		}
	});
</script>

{#if problem}<p class="invalid" role="alert">{problem}</p>{/if}
{#if saved > 0}<p class="status">Task saved.</p>{/if}
<!--
	Keyed on each save, so the form takes what was just saved as its new
	baseline and the save button goes back to outlined.
-->
{#key saved}
	<TaskForm {superform} {submitLabel} {timeZoneContext} {action} />
{/key}

<style>
	.invalid {
		color: var(--wa-color-text-danger);
	}

	.status {
		color: var(--wa-color-text-success);
	}
</style>
