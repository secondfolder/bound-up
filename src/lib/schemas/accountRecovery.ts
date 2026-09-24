import { z } from 'zod';
import { parseKeyWrapParams } from '$lib/encryption';
import { authSecretField, recipientField, wrapBlobField, wrapParamsField } from './keyWrap';

/**
 * The bodies of the three partner-assisted sign-in endpoints.
 *
 * JSON rather than form actions: the requester's page drives the whole
 * exchange from the browser — it generates keys, polls, and signs in — and a
 * 303 from a form action would take the page, and the token in its memory,
 * away. See docs/account-recovery.md.
 */

/** 32 random bytes, base64url. Exact, so a malformed one is refused up front. */
const tokenField = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Malformed token');

export const startRecoverySchema = z.object({
	email: z.email().max(254),
	recipient: recipientField,
	// Only a password wrap: that is what the requester gets back in with, and
	// every other kind would need a credential they do not yet have.
	wrapParams: wrapParamsField.refine(
		(raw) => parseKeyWrapParams(raw)?.type === 'password',
		'Must be a password wrap'
	),
	wrapBlob: wrapBlobField
});

export const recoveryStatusSchema = z.object({ token: tokenField });

export const completeRecoverySchema = z.object({ token: tokenField, authSecret: authSecretField });
