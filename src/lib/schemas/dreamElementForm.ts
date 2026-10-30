import { z } from 'zod';
import { MAX_ELEMENT_CHARS } from '$lib/dream/elements';

/**
 * Changing an element on the setup page (docs/dreams.md, "Changing what was
 * made"): its name, the short name it is shown by, and each field's words.
 * Checked in the browser and sealed with the setup there, so the superform
 * is built from `defaults()` (AGENTS.md, "Forms").
 */
export const dreamElementFormSchema = z.object({
	name: z.string().trim().min(1, 'Give it a name').max(80),
	short: z.string().trim().max(40),
	fields: z
		.array(
			z.object({
				name: z.string().max(40),
				text: z.string().trim().max(MAX_ELEMENT_CHARS),
				shown: z.boolean()
			})
		)
		.max(24)
});

export type DreamElementForm = z.output<typeof dreamElementFormSchema>;
