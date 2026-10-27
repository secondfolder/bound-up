import { error } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { taskEditorFormSchema } from '$lib/schemas/taskEditorForm';
import { malformedSealed, readSealedTask, sealedRefusal } from '$lib/server/sealed-submit';
import { getTaskForViewer, updateTask } from '$lib/server/tasks';
import { taskEditorFormValuesFromTask, taskInputFromSealedSubmit } from '$lib/task-editor-form';
import type { Actions, PageServerLoad } from './$types';

/**
 * Editing a task, in a sheet over the list. The task carries its own space,
 * so this works whatever the context is (docs/contexts.md, "Items carry their
 * own space"): a 404 for a task in no space of the viewer's, a 403 for one
 * they may not edit — one set for them.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const found = await getTaskForViewer(locals.db, locals.user, params.taskId);
	if (!found) {
		error(404, 'Task not found');
	}
	if (!found.task.canManage) {
		error(403, 'Only whoever set this task can edit it.');
	}
	return {
		// The settings fill the form here; the content is filled in by the page
		// once it has opened `task.sealed`.
		task: found.task,
		space: found.space,
		taskForm: await superValidate(
			taskEditorFormValuesFromTask(found.task),
			zod4(taskEditorFormSchema),
			{ errors: false }
		)
	};
};

export const actions: Actions = {
	default: async ({ locals, params, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}
		const submitted = await readSealedTask(request);
		if (!(submitted && submitted.recordId === params.taskId)) {
			return malformedSealed('task');
		}
		const result = await updateTask(locals.db, locals.user, params.taskId, {
			...taskInputFromSealedSubmit(submitted),
			expectedRevision: submitted.expectedRevision ?? 0
		});
		if (!result.ok) {
			if (result.reason === 'not-found') {
				error(404, 'Task not found');
			}
			return sealedRefusal(result.reason, 'task');
		}
		return { saved: true };
	}
};
