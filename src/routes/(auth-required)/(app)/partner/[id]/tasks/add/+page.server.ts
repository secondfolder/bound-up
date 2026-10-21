import { error, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { taskEditorFormSchema } from '$lib/schemas/taskEditorForm';
import { malformedSealed, readSealedTask, sealedRefusal } from '$lib/server/sealed-submit';
import { createPartnershipTask, getPartnershipTasksPage } from '$lib/server/tasks';
import { taskEditorFormValuesForCreate, taskInputFromSealedSubmit } from '$lib/task-editor-form';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const page = await getPartnershipTasksPage(
		locals.db,
		params.id,
		locals.user.id,
		locals.user.timezone
	);
	if (!page) {
		error(404, 'Partner not found');
	}
	// The side without control has nothing to do here, but a link or a
	// bookmark can still bring them: back to the list rather than an error
	// page. The action below still refuses a direct post with a 403.
	if (!page.partner.canManageTasks) {
		redirect(303, `/partner/${params.id}/tasks`);
	}
	return {
		...page,
		taskForm: await superValidate(
			taskEditorFormValuesForCreate(page.partner.counterpartUserId),
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
		const page = await getPartnershipTasksPage(
			locals.db,
			params.id,
			locals.user.id,
			locals.user.timezone
		);
		if (!page) {
			error(404, 'Partner not found');
		}
		if (!page.partner.canManageTasks) {
			error(403, 'Only the controlling side can add tasks here.');
		}

		const submitted = await readSealedTask(request);
		if (!submitted) {
			return malformedSealed('task');
		}
		const result = await createPartnershipTask(
			locals.db,
			params.id,
			locals.user.id,
			locals.user.timezone,
			submitted.recordId,
			taskInputFromSealedSubmit(submitted)
		);
		if (!result.ok) {
			return sealedRefusal(result.reason, 'task');
		}

		redirect(303, `/partner/${params.id}/tasks`);
	}
};
