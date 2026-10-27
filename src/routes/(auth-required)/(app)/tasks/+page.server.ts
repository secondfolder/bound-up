import { error, fail } from '@sveltejs/kit';
import { taskCompleteSchema, taskUndoSchema } from '$lib/schemas/taskForm';
import { malformedSealed, readSealedTaskContent, sealedRefusal } from '$lib/server/sealed-submit';
import {
	completeTask,
	UNDO_REFUSALS,
	undoTaskCompletion,
	updateTaskContent
} from '$lib/server/tasks';
import type { Actions } from './$types';

/**
 * The list's actions. Each names the task or completion it acts on, which
 * carries its own space, and the server checks the viewer's place in that
 * space — never the context, which another tab can change at any moment
 * (docs/contexts.md, "Writes name their space").
 */

function stringField(formData: FormData, key: string): string | undefined {
	const value = formData.get(key);
	return typeof value === 'string' ? value : undefined;
}

function firstError(
	fieldErrors: Record<string, string[] | undefined>,
	formErrors: string[]
): string {
	for (const errorList of Object.values(fieldErrors)) {
		if (errorList?.[0]) {
			return errorList[0];
		}
	}
	return formErrors[0] ?? 'Please check the form and try again.';
}

export const actions: Actions = {
	complete: async ({ locals, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}
		const formData = await request.formData();
		const parsed = taskCompleteSchema.safeParse({ taskId: stringField(formData, 'taskId') });
		if (!parsed.success) {
			const flat = parsed.error.flatten();
			return fail(400, { error: firstError(flat.fieldErrors, flat.formErrors) });
		}

		const result = await completeTask(locals.db, locals.user, parsed.data.taskId);
		if (!result.ok) {
			if (result.reason === 'not-found') {
				error(404, 'Task not found');
			}
			if (result.reason === 'not-allowed') {
				return fail(403, { error: 'That task is not yours to complete.' });
			}
			return fail(400, {
				error:
					result.reason === 'inactive'
						? 'That task is inactive right now.'
						: 'That task is not ready to complete yet.'
			});
		}

		// The completion's id goes back so the list can offer to undo it.
		return {
			message: 'Task completed.',
			completionId: result.completionId,
			taskId: parsed.data.taskId
		};
	},

	undo: async ({ locals, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}
		const formData = await request.formData();
		const parsed = taskUndoSchema.safeParse({
			completionId: stringField(formData, 'completionId')
		});
		if (!parsed.success) {
			const flat = parsed.error.flatten();
			return fail(400, { error: firstError(flat.fieldErrors, flat.formErrors) });
		}
		const result = await undoTaskCompletion(locals.db, locals.user, parsed.data.completionId);
		if (!result.ok) {
			return fail(result.reason === 'not-found' || result.reason === 'not-yours' ? 404 : 400, {
				error: UNDO_REFUSALS[result.reason]
			});
		}
		// Nothing to say: the task coming back in its place says it.
		return { undone: true };
	},

	/**
	 * A task's description with a to-do item ticked or unticked: its sealed
	 * content alone, from the task's sheet, under the permission to edit it
	 * (docs/rich-text.md, "To-do lists"). The settings are not posted, so the
	 * schedule is left as it is.
	 */
	content: async ({ locals, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}
		const submitted = await readSealedTaskContent(request);
		if (!submitted) {
			return malformedSealed('task');
		}
		const result = await updateTaskContent(locals.db, locals.user, submitted.recordId, {
			content: submitted.content,
			expectedRevision: submitted.expectedRevision
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
