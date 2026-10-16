import { error } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { taskEditorFormSchema } from '$lib/schemas/taskEditorForm';
import { malformedSealed, readSealedTask, sealedRefusal } from '$lib/server/sealed-submit';
import { getPartnershipTaskForUser, updatePartnershipTask } from '$lib/server/tasks';
import { taskEditorFormValuesFromTask, taskInputFromSealedSubmit } from '$lib/task-editor-form';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const data = await getPartnershipTaskForUser(
		locals.db,
		params.id,
		locals.user.id,
		locals.user.timezone,
		params.taskId
	);
	if (!data) {
		error(404, 'Task not found');
	}
	if (!(data.partner.canManageTasks && data.task.createdByMe)) {
		error(403, 'Only the partner who created a task can edit it.');
	}
	return {
		partner: data.partner,
		// As on the self task editor: the page fills in sealed content once open.
		task: data.task,
		taskForm: await superValidate(
			taskEditorFormValuesFromTask(data.task),
			zod4(taskEditorFormSchema),
			{
				errors: false
			}
		)
	};
};

export const actions: Actions = {
	default: async ({ locals, params, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}
		const current = await getPartnershipTaskForUser(
			locals.db,
			params.id,
			locals.user.id,
			locals.user.timezone,
			params.taskId
		);
		if (!current) {
			error(404, 'Task not found');
		}
		if (!(current.partner.canManageTasks && current.task.createdByMe)) {
			error(403, 'Only the partner who created a task can edit it.');
		}

		const submitted = await readSealedTask(request);
		if (!(submitted && submitted.recordId === params.taskId)) {
			return malformedSealed('task');
		}
		const result = await updatePartnershipTask(
			locals.db,
			params.id,
			locals.user.id,
			locals.user.timezone,
			params.taskId,
			{ ...taskInputFromSealedSubmit(submitted), expectedRevision: submitted.expectedRevision ?? 0 }
		);
		if (!result.ok) {
			if (result.reason === 'not-a-member') {
				error(404, 'Partner not found');
			}
			if (result.reason === 'not-found') {
				error(404, 'Task not found');
			}
			return sealedRefusal(result.reason, 'task');
		}

		return { saved: true };
	}
};
