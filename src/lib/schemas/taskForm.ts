import { z } from 'zod';

/**
 * Completing a task: the only task form that is not the editor. The editor's
 * schemas are in `taskEditorForm.ts`.
 */

const taskIdSchema = z.string().uuid('Malformed task id');
const partnershipIdSchema = z.string().uuid('Malformed partnership id');

export const taskCompleteSchema = z.object({ taskId: taskIdSchema });

export const partnerTaskCompleteSchema = taskCompleteSchema.extend({
	partnershipId: partnershipIdSchema
});

/** Takes back a completion; the id is what the complete action answered with. */
export const taskUndoSchema = z.object({
	completionId: z.string().uuid('Malformed completion id')
});

export const partnerTaskUndoSchema = taskUndoSchema.extend({
	partnershipId: partnershipIdSchema
});
