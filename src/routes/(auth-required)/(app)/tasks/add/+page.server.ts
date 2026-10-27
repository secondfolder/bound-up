import { error, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { taskEditorFormSchema } from '$lib/schemas/taskEditorForm';
import { spaceIdSchema } from '$lib/schemas/taskForm';
import { malformedSealed, readSealedTask, sealedRefusal } from '$lib/server/sealed-submit';
import { createTask } from '$lib/server/tasks';
import { taskEditorFormValuesForCreate, taskInputFromSealedSubmit } from '$lib/task-editor-form';
import type { Actions, PageServerLoad } from './$types';

/**
 * Adding a task, in a sheet over the list. Where it goes is the list's
 * spaces the viewer may set tasks in (the layout's `list.spaces`), chosen on
 * the page under "For whom?" when there is more than one, and posted as
 * `spaceId`: the action never reads the context.
 */
export const load: PageServerLoad = async ({ locals, parent }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const { list } = await parent();
	// Nowhere to add one in this context — a partnership where only the
	// partner sets tasks — but a link or a bookmark can still bring someone:
	// back to the list rather than an error page. The action still refuses a
	// direct post.
	if (!list.spaces.some((space) => space.canManage)) {
		redirect(303, '/tasks');
	}
	return {
		taskForm: await superValidate(
			taskEditorFormValuesForCreate(locals.user.id),
			zod4(taskEditorFormSchema),
			{ errors: false }
		)
	};
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}
		const formData = await request.formData();
		const spaceId = spaceIdSchema.safeParse(formData.get('spaceId'));
		// The content arrives sealed; see `taskSealedSubmitSchema`.
		const submitted = await readSealedTask(formData);
		if (!(spaceId.success && submitted)) {
			return malformedSealed('task');
		}
		const result = await createTask(
			locals.db,
			locals.user,
			spaceId.data,
			submitted.recordId,
			taskInputFromSealedSubmit(submitted)
		);
		if (!result.ok) {
			return sealedRefusal(result.reason, 'task');
		}
		redirect(303, '/tasks');
	}
};
