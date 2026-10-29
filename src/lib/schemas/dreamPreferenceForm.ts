import { z } from 'zod';
import { MAX_PREFERENCE_CHARS } from '$lib/sealed-kinds/dreams';

/**
 * Adding a preference on the preferences page (docs/dreams.md,
 * "Preferences"). Checked in the browser and sealed there, so the superform
 * is built from `defaults()` (AGENTS.md, "Forms").
 */
export const dreamPreferenceFormSchema = z.object({
	text: z.string().trim().min(1, 'Write something first').max(MAX_PREFERENCE_CHARS),
	firmness: z.enum(['hard', 'default', 'leaning']),
	appliesTo: z.string().trim().max(120)
});

export type DreamPreferenceForm = z.output<typeof dreamPreferenceFormSchema>;
