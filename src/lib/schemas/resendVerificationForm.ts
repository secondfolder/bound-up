import { z } from 'zod';

/** Asking for another verification link, from the check-email page. */
export const resendVerificationFormSchema = z.object({
	email: z.email()
});

export type ResendVerificationFormSchema = typeof resendVerificationFormSchema;
