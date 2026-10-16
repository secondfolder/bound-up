import { error } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { taskEditorFormSchema } from '$lib/schemas/taskEditorForm';
import { malformedSealed, readSealedTask, sealedRefusal } from '$lib/server/sealed-submit';
import { getSelfTaskForUser, updateSelfTask } from '$lib/server/tasks';
import { taskEditorFormValuesFromTask, taskInputFromSealedSubmit } from '$lib/task-editor-form';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const task = await getSelfTaskForUser(
		locals.db,
		locals.user.id,
		locals.user.timezone,
		params.taskId
	);
	if (!task) {
		error(404, 'Task not found');
	}
	return {
		// The settings fill the form here; a sealed task's content is filled in
		// by the page once it has opened `task.sealed`.
		task,
		taskForm: await superValidate(taskEditorFormValuesFromTask(task), zod4(taskEditorFormSchema), {
			errors: false
		})
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
		const result = await updateSelfTask(
			locals.db,
			locals.user.id,
			locals.user.timezone,
			params.taskId,
			{
				...taskInputFromSealedSubmit(submitted),
				expectedRevision: submitted.expectedRevision ?? 0
			}
		);
		if (!result.ok) {
			if (result.reason === 'not-found') {
				error(404, 'Task not found');
			}
			return sealedRefusal(result.reason, 'task');
		}
		return { saved: true };
	}
};
