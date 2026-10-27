/**
 * Giving a partner who lost every way in their shared history back.
 *
 * BROWSER ONLY — this opens the partnership vault, so it needs the unlocked
 * identity.
 *
 * Runs on the device of the partner who did **not** lose their key. Everything
 * the two of them share is sealed in the partnership vault, so restoring it is
 * one wrap: the vault key, wrapped for the requester's new key. Two parts:
 *
 * 1. **The vault is wrapped for the requested key** and posted, which closes
 *    the request and approves the sign-in.
 * 2. **The requester's own vault**, if they held it in escrow with this
 *    partner, has this partner's half passed on with it: their layer opened,
 *    and the inside — still sealed under the server's share — re-encrypted to
 *    the requested key. The server releases its share to the account only once
 *    the sign-in completes. See docs/encryption.md, "Escrow".
 *
 * Two things about this are deliberate and worth not undoing:
 *
 * - **Attachments are never touched.** Each file is encrypted under its own
 *   key, carried inside its message body, so access to every file in the
 *   object store comes back with the vault, for free.
 * - **The requester's recipient comes from the request row, not from
 *   `user_keys`.** It is the value snapshotted when the request was raised and
 *   confirmed against the code the partner read out loud. Wrapping for
 *   whatever the server currently claims is that user's key would hand the
 *   whole vault to a server that had just swapped it, and the out-of-band
 *   comparison would have been for nothing.
 */

import { decryptBytes, encryptBytesTo } from '../crypto/escrow';
import { unlockedIdentity } from '../crypto/session.svelte';
import { writeGrantFor } from '../crypto/trust.svelte';
import { partnershipVault, wrapPartnershipVaultFor } from '../crypto/vaults.svelte';
import { tryFetch } from '../request-failure.svelte';

export type RestoreOutcome = { ok: true } | { ok: false; message: string };

export async function runHistoryRestore(
	partnershipId: string,
	request: { id: string; requestedRecipient: string }
): Promise<RestoreOutcome> {
	const unlocked = unlockedIdentity();
	const vault = partnershipVault(partnershipId);
	const grant = vault ? writeGrantFor(partnershipId, vault.id) : null;
	if (!(unlocked && vault && grant)) {
		return { ok: false, message: 'Still getting ready. Try again in a moment.' };
	}

	try {
		const vaultWrap = await wrapPartnershipVaultFor(partnershipId, request.requestedRecipient);
		if (!vaultWrap) {
			return { ok: false, message: 'This device cannot open what you share. Try another device.' };
		}
		const escrowRelay = await relayEscrow(partnershipId, request, unlocked.identity);
		const response = await fetch(`/api/spaces/${partnershipId}/restore`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ requestId: request.id, vaultWrap, escrowRelay })
		});
		if (!response.ok) {
			throw new Error(`Could not save the restore (${response.status})`);
		}
		return { ok: true };
	} catch (error) {
		console.error(error);
		return {
			ok: false,
			message: 'Something went wrong part-way through. Anything already done is saved.'
		};
	}
}

/**
 * This partner's half of the requester's own-vault escrow, passed on to the
 * requested key — or undefined when they hold none, or it will not open here.
 * The inside stays sealed under the server's share throughout.
 */
async function relayEscrow(
	partnershipId: string,
	request: { id: string; requestedRecipient: string },
	identity: CryptoKey | string
): Promise<{ escrowId: string; ciphertext: string } | undefined> {
	const response = await fetch(
		`/api/spaces/${partnershipId}/restore?${new URLSearchParams({ requestId: request.id })}`
	);
	if (!response.ok) {
		throw new Error(`Could not read the escrow (${response.status})`);
	}
	const { escrow } = (await response.json()) as {
		escrow: { id: string; ciphertext: string } | null;
	};
	if (!escrow) {
		return undefined;
	}
	const inner = await decryptBytes(escrow.ciphertext, identity);
	if (!inner) {
		return undefined;
	}
	return {
		escrowId: escrow.id,
		ciphertext: await encryptBytesTo(inner, request.requestedRecipient)
	};
}

/** Says no, so the requester is told rather than left waiting. */
export async function declineHistoryRestore(
	partnershipId: string,
	requestId: string
): Promise<boolean> {
	const response = await tryFetch(`/api/spaces/${partnershipId}/restore`, {
		method: 'DELETE',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ requestId })
	});
	return response?.ok === true;
}
