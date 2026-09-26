import { z } from 'zod';
import { FEATURE_KEYS } from '../features';

/**
 * Which feature an admin is granting or revoking. The feature is carried by the
 * submit button that was pressed, one per row, so one form serves the whole
 * list; the action it posts to says which way.
 */
export const featureGrantFormSchema = z.object({
	feature: z.enum(FEATURE_KEYS)
});

export type FeatureGrantFormSchema = typeof featureGrantFormSchema;
