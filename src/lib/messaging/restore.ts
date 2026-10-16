/**
 * Giving a partner who lost every way in their shared history back.
 *
 * BROWSER ONLY — this opens the partnership vault, so it needs the unlocked
 * identity.
 *
 * Runs on the device of the partner who did **not** lose their key. Everything
 * the two of them share is sealed in the partnership vault, so restoring it is
 * one wrap: the vault key, wrapped for the requester's new key. Two steps:
 *
 * 1. **Anything still in the original scheme is sealed into the vault first**
 *    (`vault-migration.ts`), the same migration every device runs in the
 *    background. Those rows are encrypted to both partners' old recipients,
 *    and the requester's old key is gone, so the vault is the only way they
 *    will read them again. This device can open them: it is one of the two
 *    recipients on every one.
 * 2. **The vault is wrapped for the requested key** and posted, which closes
 *    the request and approves the sign-in.
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

import { unlockedIdentity } from '../crypto/session.svelte';
import { writeGrantFor } from '../crypto/trust.svelte';
import { partnershipVault, wrapPartnershipVaultFor } from '../crypto/vaults.svelte';
import { tryFetch } from '../request-failure.svelte';
import { migratePartnershipToVault } from './vault-migration';

export type RestoreProgress = {
	/** Rows moved into the vault on the way. */
	done: number;
};

export type RestoreOutcome = ({ ok: true } & RestoreProgress) | { ok: false; message: string };

export async function runHistoryRestore(
	partnershipId: string,
	request: { id: string; requestedRecipient: string },
	onProgress?: (progress: RestoreProgress) => void
): Promise<RestoreOutcome> {
	const unlocked = unlockedIdentity();
	const vault = partnershipVault(partnershipId);
	const grant = vault ? writeGrantFor(partnershipId, vault.id) : null;
	if (!(unlocked && vault && grant)) {
		return { ok: false, message: 'Still getting ready. Try again in a moment.' };
	}

	try {
		const done = await migratePartnershipToVault(partnershipId, unlocked.identity, {
			vault,
			grant
		});
		onProgress?.({ done });

		const vaultWrap = await wrapPartnershipVaultFor(partnershipId, request.requestedRecipient);
		if (!vaultWrap) {
			return { ok: false, message: 'This device cannot open what you share. Try another device.' };
		}
		const response = await fetch(`/api/partnerships/${partnershipId}/restore`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ requestId: request.id, vaultWrap })
		});
		if (!response.ok) {
			throw new Error(`Could not save the restore (${response.status})`);
		}
		return { ok: true, done };
	} catch (error) {
		console.error(error);
		return {
			ok: false,
			message: 'Something went wrong part-way through. Anything already done is saved.'
		};
	}
}

/** Says no, so the requester is told rather than left waiting. */
export async function declineHistoryRestore(
	partnershipId: string,
	requestId: string
): Promise<boolean> {
	const response = await tryFetch(`/api/partnerships/${partnershipId}/restore`, {
		method: 'DELETE',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ requestId })
	});
	return response?.ok === true;
}
