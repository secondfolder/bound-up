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

/**
 * `POST /api/spaces/[spaceId]/vault`. The space is the path's, so the body
 * names no scope: a solo space's vault has one wrap, a shared space's one per
 * member, and `createVault` checks the wraps against the space's members.
 */
export const createVaultSchema = z.object({
	id: clientId,
	keyCheck: z.string().regex(KEY_CHECK_PATTERN),
	// One per member, so two at most today; the members check holds it exact.
	wraps: z.array(vaultWrapField).min(1).max(2)
});

/**
 * `PUT /api/spaces/[spaceId]/vault/wraps`: one member's wrap, for the vault
 * the device opened. The vault is named rather than taken to be "the space's
 * vault", because a wrap is that one vault's key: a space that one day has a
 * new vault must not be handed a wrap made for the old one.
 */
export const putVaultWrapSchema = vaultWrapField.extend({ vaultId: clientId });

export type CreateVaultInput = z.output<typeof createVaultSchema>;
export type VaultWrapInput = z.output<typeof vaultWrapField>;
export type PutVaultWrapInput = z.output<typeof putVaultWrapSchema>;

export const escrowShareSchema = z.object({ escrowId: clientId });

/**
 * `PUT /api/spaces/[spaceId]/vault/escrows`, named by the user's solo space:
 * their own vault, held in escrow in `heldInSpaceId`, the shared space of the
 * partner holding it.
 */
export const putEscrowSchema = z.object({
	id: clientId,
	heldInSpaceId: z.string().min(1).max(100),
	ciphertext: z.string().min(1).max(MAX_VAULT_WRAP_LENGTH).regex(VAULT_WRAP_PATTERN)
});
