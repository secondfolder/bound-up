import { z } from 'zod';
import { authSecretField, identityFields } from './keyWrap';

/**
 * Changing the password from Security.
 *
 * The auth secrets are always derived in the browser, and the same submit
 * carries the replacement wrap, so the identity stays readable under the new
 * password. Required rather than optional: every account has message keys, so
 * a change without a wrap would leave the key sealed to a password that no
 * longer exists.
 */
export const changePasswordSchema = z.object({
	currentAuthSecret: authSecretField,
	newAuthSecret: authSecretField,
	wrapParams: identityFields.wrapParams,
	wrapBlob: identityFields.wrapBlob
});

export type ChangePasswordSchema = typeof changePasswordSchema;
