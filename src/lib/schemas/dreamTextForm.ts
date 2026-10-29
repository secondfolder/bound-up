import { z } from 'zod';

/**
 * The new engine's text boxes (the brief, "change it", the story's input):
 * one field, checked in the browser and sealed or sent from there, so the
 * superform is built from `defaults()` rather than a load (AGENTS.md,
 * "Forms").
 */
export function dreamTextFormSchema(max: number) {
	return z.object({ text: z.string().trim().min(1, 'Write something first').max(max) });
}

export type DreamTextForm = z.output<ReturnType<typeof dreamTextFormSchema>>;
