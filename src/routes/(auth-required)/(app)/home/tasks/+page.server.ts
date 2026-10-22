import { error, fail } from '@sveltejs/kit';
import {
	partnerTaskCompleteSchema,
	partnerTaskUndoSchema,
	taskCompleteSchema,
	taskUndoSchema
} from '$lib/schemas/taskForm';
import {
	completePartnershipTask,
	completeSelfTask,
	UNDO_REFUSALS,
	undoPartnershipTaskCompletion,
	undoSelfTaskCompletion
} from '$lib/server/tasks';
import type { Actions } from './$types';

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
	selfCompleteTask: async ({ locals, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}
		const formData = await request.formData();
		const parsed = taskCompleteSchema.safeParse({ taskId: stringField(formData, 'taskId') });
		if (!parsed.success) {
			const flat = parsed.error.flatten();
			return fail(400, { error: firstError(flat.fieldErrors, flat.formErrors) });
		}

		const result = await completeSelfTask(
			locals.db,
			locals.user.id,
			locals.user.timezone,
			parsed.data.taskId
		);
		if (!result.ok) {
			if (result.reason === 'not-found') {
				error(404, 'Task not found');
			}
			return fail(400, {
				error:
					result.reason === 'inactive'
						? 'That task is inactive right now.'
						: 'That task is not ready to complete yet.'
			});
		}

		return {
			message: 'Task completed.',
			completionId: result.completionId,
			taskId: parsed.data.taskId
		};
	},

	partnerCompleteTask: async ({ locals, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}
		const formData = await request.formData();
		const parsed = partnerTaskCompleteSchema.safeParse({
			partnershipId: stringField(formData, 'partnershipId'),
			taskId: stringField(formData, 'taskId')
		});
		if (!parsed.success) {
			const flat = parsed.error.flatten();
			return fail(400, { error: firstError(flat.fieldErrors, flat.formErrors) });
		}

		const result = await completePartnershipTask(locals.db, {
			partnershipId: parsed.data.partnershipId,
			taskId: parsed.data.taskId,
			userId: locals.user.id,
			viewerTimezone: locals.user.timezone
		});
		if (!result.ok) {
			if (result.reason === 'not-a-member' || result.reason === 'not-found') {
				error(404, 'Task not found');
			}
			if (result.reason === 'not-allowed' || result.reason === 'own-task') {
				return fail(403, {
					error: 'You cannot complete that task from this side of the partnership.'
				});
			}
			return fail(400, {
				error:
					result.reason === 'inactive'
						? 'That task is inactive right now.'
						: 'That task is not ready to complete yet.'
			});
		}

		// The partnership goes back with the id: undoing it posts both.
		return {
			message: 'Task completed.',
			completionId: result.completionId,
			taskId: parsed.data.taskId,
			partnershipId: parsed.data.partnershipId
		};
	},

	selfUndoCompletion: async ({ locals, request }) => {
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
		const result = await undoSelfTaskCompletion(
			locals.db,
			locals.user.id,
			parsed.data.completionId
		);
		if (!result.ok) {
			return fail(result.reason === 'not-found' || result.reason === 'not-yours' ? 404 : 400, {
				error: UNDO_REFUSALS[result.reason]
			});
		}
		// Nothing to say: the task coming back in its place says it.
		return { undone: true };
	},

	partnerUndoCompletion: async ({ locals, request }) => {
		if (!locals.user) {
			error(401, 'Not signed in');
		}
		const formData = await request.formData();
		const parsed = partnerTaskUndoSchema.safeParse({
			partnershipId: stringField(formData, 'partnershipId'),
			completionId: stringField(formData, 'completionId')
		});
		if (!parsed.success) {
			const flat = parsed.error.flatten();
			return fail(400, { error: firstError(flat.fieldErrors, flat.formErrors) });
		}
		const result = await undoPartnershipTaskCompletion(locals.db, {
			partnershipId: parsed.data.partnershipId,
			completionId: parsed.data.completionId,
			userId: locals.user.id,
			viewerTimezone: locals.user.timezone
		});
		if (!result.ok) {
			if (result.reason === 'not-a-member') {
				error(404, 'Partner not found');
			}
			return fail(result.reason === 'not-found' || result.reason === 'not-yours' ? 404 : 400, {
				error: UNDO_REFUSALS[result.reason]
			});
		}
		// Nothing to say: the task coming back in its place says it.
		return { undone: true };
	}
};
