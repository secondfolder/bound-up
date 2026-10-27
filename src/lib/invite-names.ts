/**
 * Moves each accepted partnership's names out of its invite and into its
 * vault, in the background, once per partnership per page load.
 *
 * BROWSER ONLY — it seals with `crypto/sealed.ts`.
 *
 * An invite is sealed under a key that travels in the link, because there is
 * no partnership vault until someone accepts it, and accepting needs no keys
 * (docs/partners.md, "Names are sealed"). So the names stay under the invite
 * key past acceptance, until the device of a member who holds `control` has
 * the vault open: this opens them from the invite, seals them into the vault,
 * and the server clears the invite in the same write. Only that member, since
 * moving the names is writing them; the server hands anyone else nothing.
 */

import { inviteVault, recallInviteKey, unwrapInviteKey } from './crypto/invite';
import { openRecord, sealRecord } from './crypto/sealed';
import { writeGrantFor } from './crypto/trust.svelte';
import type { OpenVault } from './crypto/vault';
import { currentVaults, heldVaultIdentity } from './crypto/vaults.svelte';
import type { WriteGrant } from './crypto/write-grant';
import type { PartnerNamesSource, StoredNames } from './partnership';
import { partnershipInviteKind, partnershipNamesKind } from './sealed-kinds/partnerships';

/** A navigation cutting a request short: not worth a line in the console. */
class MoveInterrupted extends Error {}

async function quietFetch(input: string, init?: RequestInit): Promise<Response> {
	try {
		return await fetch(input, init);
	} catch (error) {
		throw new MoveInterrupted('A request moving names got no response', { cause: error });
	}
}

/**
 * The names from the invite, or null when this device cannot open it — the
 * invitee on a device that never saw the link, say. The other member's
 * device, or a later load, will move them.
 */
async function readInviteNames(source: PartnerNamesSource): Promise<StoredNames | null> {
	const { invite, partnershipId } = source;
	if (!invite) {
		return null;
	}
	const held = heldVaultIdentity();
	const key = invite.keyWrap
		? held && (await unwrapInviteKey(partnershipId, invite.keyWrap, held))
		: recallInviteKey(partnershipId);
	if (!key) {
		return null;
	}
	const opened = await openRecord(partnershipInviteKind, {
		recordId: partnershipId,
		ciphertext: invite.ciphertext,
		payloadVersion: invite.payloadVersion,
		vault: await inviteVault(partnershipId, key)
	});
	if (!opened) {
		return null;
	}
	const { inviterRecipient: _, ...names } = opened;
	return names;
}

async function moveNames(
	partnershipId: string,
	writable: { vault: OpenVault; grant: WriteGrant }
): Promise<void> {
	const path = `/api/spaces/${partnershipId}/names`;
	const response = await quietFetch(path);
	if (!response.ok) {
		throw new Error(`Could not read the names to move (${response.status})`);
	}
	const { names: source } = (await response.json()) as { names: PartnerNamesSource | null };
	const names = source ? await readInviteNames(source) : null;
	if (!names) {
		return;
	}
	const sealed = await sealRecord(partnershipNamesKind, {
		recordId: partnershipId,
		payload: names,
		...writable
	});
	const posted = await quietFetch(path, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ vaultId: writable.vault.id, ...sealed })
	});
	if (!posted.ok) {
		throw new Error(`Could not store the names (${posted.status})`);
	}
	// The key from the link has nothing left to open now, but it is not
	// forgotten here: a page whose load read the invite just before this
	// landed still needs it, and showed the names as unreadable when it had
	// gone. `openedNames` forgets it once a load serves the names from the
	// vault.
}

const started = new Set<string>();

/**
 * Starts moving the names of every partnership this device can write into.
 * Called by `EncryptionGate` once vaults are open; a partnership whose keys
 * the trust check has been warned about is left alone, as it is for a send.
 */
export function moveInviteNamesIntoVaults(): void {
	const vaults = currentVaults();
	if (vaults.status !== 'ready') {
		return;
	}
	for (const [partnershipId, vault] of Object.entries(vaults.partnerships)) {
		const key = `${partnershipId}:${vault.id}`;
		const grant = writeGrantFor(partnershipId, vault.id);
		if (started.has(key) || !grant) {
			continue;
		}
		started.add(key);
		// Housekeeping nobody is waiting on (docs/request-failures.md): a failure
		// is logged and the next page load tries again.
		void moveNames(partnershipId, { vault, grant }).catch((error: unknown) => {
			started.delete(key);
			if (!(error instanceof MoveInterrupted)) {
				console.error('could not move partnership names into the vault', error);
			}
		});
	}
}
