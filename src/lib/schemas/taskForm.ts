import { z } from 'zod';

/**
 * Completing a task, and taking a completion back: the only task forms that
 * are not the editor. The editor's schemas are in `taskEditorForm.ts`. Each
 * names its record, which carries its space; neither reads the context
 * (docs/contexts.md, "Writes name their space").
 */

export const taskCompleteSchema = z.object({ taskId: z.string().uuid('Malformed task id') });

/** Takes back a completion; the id is what the complete action answered with. */
export const taskUndoSchema = z.object({
	completionId: z.string().uuid('Malformed completion id')
});

/** The space a new task or reward goes to, which the form names (never the context). */
export const spaceIdSchema = z.string().uuid('Choose who it’s for');
