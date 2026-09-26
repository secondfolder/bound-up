import { z } from 'zod';

/**
 * Making an account an admin, or an ordinary user again. The two roles are
 * the ones `src/lib/server/auth.ts` gives the admin plugin; any other value is
 * refused here before Better Auth sees it.
 */
export const adminRoleFormSchema = z.object({
	role: z.enum(['admin', 'user'])
});

export type AdminRoleFormSchema = typeof adminRoleFormSchema;
