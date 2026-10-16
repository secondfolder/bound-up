import { z } from 'zod';
import { recipientField } from '$lib/schemas/keyWrap';
import {
	isClientId,
	KEY_CHECK_PATTERN,
	MAX_VAULT_WRAP_LENGTH,
	VAULT_WRAP_PATTERN
} from '$lib/vault';

/**
 * The bodies of the vault endpoints. Every field is opaque or public: the
 * server checks shapes and who may write, and reads nothing else.
 */

const clientId = z.string().refine(isClientId, 'Must be a lowercase UUID');

export const vaultWrapField = z.object({
	userId: z.string().min(1).max(100),
	ciphertext: z.string().min(1).max(MAX_VAULT_WRAP_LENGTH).regex(VAULT_WRAP_PATTERN),
	forRecipient: recipientField
});

export const createVaultSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('self'),
		id: clientId,
		keyCheck: z.string().regex(KEY_CHECK_PATTERN),
		wraps: z.array(vaultWrapField).length(1)
	}),
	z.object({
		kind: z.literal('partnership'),
		id: clientId,
		partnershipId: z.string().min(1).max(100),
		keyCheck: z.string().regex(KEY_CHECK_PATTERN),
		wraps: z.array(vaultWrapField).length(2)
	})
]);

export type CreateVaultInput = z.output<typeof createVaultSchema>;
export type VaultWrapInput = z.output<typeof vaultWrapField>;

export const escrowShareSchema = z.object({ escrowId: clientId });

export const putEscrowSchema = z.object({
	id: clientId,
	partnershipId: z.string().min(1).max(100),
	ciphertext: z.string().min(1).max(MAX_VAULT_WRAP_LENGTH).regex(VAULT_WRAP_PATTERN)
});
