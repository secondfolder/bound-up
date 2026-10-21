/**
 * Sealing a partnership's names before they are posted.
 *
 * BROWSER ONLY — it seals with `crypto/sealed.ts`.
 *
 * Names are end-to-end encrypted (docs/partners.md, "Names are sealed"): an
 * invite's under its invite key, and an accepted partnership's in its vault.
 * The forms that collect them validate here, seal, and post the sealed record
 * in place of the text, as task and reward forms do (`sealed-forms.ts`).
 */

import {
	generateInviteKey,
	inviteVault,
	inviteWriteGrant,
	keyFromFragment,
	recallInviteKey,
	rememberInviteKey,
	unwrapInviteKey,
	wrapInviteKey
} from './crypto/invite';
import { keyStore } from './crypto/keystore';
import { writePin } from './crypto/pins';
import { openRecord, sealRecord } from './crypto/sealed';
import { writeGrantFor } from './crypto/trust.svelte';
import { heldVaultIdentity, partnershipVault, vaultsSettled } from './crypto/vaults.svelte';
import type { StoredNames } from './partnership';
import {
	type PartnershipInvite,
	partnershipInviteKind,
	partnershipNamesKind
} from './sealed-kinds/partnerships';

const NOT_READY = 'This page is still getting ready. Try again in a moment.';
const UNAVAILABLE = 'This could not be saved from this device. Reload the page and try again.';
const KEYS_CHANGED =
	"Your partner's keys have changed. Check them on your messages page before saving here.";

/** An invite, sealed, as the invite endpoints take it. */
export type SealedInviteFields = {
	inviteCiphertext: string;
	invitePayloadVersion: string;
	inviteKeyWrap: string;
};

type Outcome<T> = ({ ok: true } & T) | { ok: false; error: string };

/** The inviter's own recipient: what the invite carries to the invitee, out of band. */
async function inviterIdentity(): Promise<{
	recipient: string;
	identity: CryptoKey | string;
} | null> {
	await vaultsSettled();
	return heldVaultIdentity();
}

async function sealInviteUnder(
	partnershipId: string,
	raw: Uint8Array<ArrayBuffer>,
	names: StoredNames,
	inviterRecipient: string
): Promise<{ ciphertext: string; payloadVersion: number }> {
	const vault = await inviteVault(partnershipId, raw);
	return await sealRecord(partnershipInviteKind, {
		recordId: partnershipId,
		payload: { ...names, inviterRecipient },
		vault,
		grant: inviteWriteGrant(vault)
	});
}

/**
 * A new invite under a new invite key: the key goes in the link's fragment,
 * a wrap of it to the inviter's own recipient goes to the server, and so does
 * the invite sealed under it. Also how an invite is re-issued (`rotate`): the
 * old link fails on both halves.
 */
export async function sealInvite(
	partnershipId: string,
	names: StoredNames
): Promise<Outcome<{ key: Uint8Array<ArrayBuffer>; fields: SealedInviteFields }>> {
	const held = await inviterIdentity();
	if (!held) {
		return { ok: false, error: NOT_READY };
	}
	const key = generateInviteKey();
	const sealed = await sealInviteUnder(partnershipId, key, names, held.recipient);
	return {
		ok: true,
		key,
		fields: {
			inviteCiphertext: sealed.ciphertext,
			invitePayloadVersion: String(sealed.payloadVersion),
			inviteKeyWrap: await wrapInviteKey(partnershipId, key, held)
		}
	};
}

/**
 * The invite sealed again under the key it already has: the accepter's edits,
 * before there is a vault. The inviter's recipient is carried over unchanged.
 */
export async function resealInvite(
	partnershipId: string,
	key: Uint8Array<ArrayBuffer>,
	names: StoredNames,
	inviterRecipient: string
): Promise<{ inviteCiphertext: string; invitePayloadVersion: string }> {
	const sealed = await sealInviteUnder(partnershipId, key, names, inviterRecipient);
	return {
		inviteCiphertext: sealed.ciphertext,
		invitePayloadVersion: String(sealed.payloadVersion)
	};
}

/** The invite key behind the inviter's own wrap, to show or re-copy a pending link. */
export async function inviterInviteKey(
	partnershipId: string,
	keyWrap: string
): Promise<Uint8Array<ArrayBuffer> | null> {
	const held = await inviterIdentity();
	return held ? await unwrapInviteKey(partnershipId, keyWrap, held) : null;
}

/** An accepted partnership's names, sealed in its vault, for the edit form. */
export async function sealPartnershipNames(
	partnershipId: string,
	names: StoredNames
): Promise<Outcome<{ fields: { vaultId: string; ciphertext: string; payloadVersion: number } }>> {
	await vaultsSettled();
	const vault = partnershipVault(partnershipId);
	if (!vault) {
		return { ok: false, error: vault === undefined ? NOT_READY : UNAVAILABLE };
	}
	const grant = writeGrantFor(partnershipId, vault.id);
	if (!grant) {
		return { ok: false, error: KEYS_CHANGED };
	}
	const sealed = await sealRecord(partnershipNamesKind, {
		recordId: partnershipId,
		payload: names,
		vault,
		grant
	});
	return { ok: true, fields: { vaultId: vault.id, ...sealed } };
}

/**
 * Opens an invite on its landing page: with the key from the link's fragment,
 * or the one this device kept from it (`rememberInviteKey`) after a round
 * trip through signing in. A key that came in the fragment is kept for that
 * trip. Null when there is no key, or it is not this invite's: a link with its
 * fragment cut off, most likely.
 */
export async function openInviteLink(
	invite: { partnershipId: string; ciphertext: string; payloadVersion: number },
	hash: string
): Promise<{ invite: PartnershipInvite; key: Uint8Array<ArrayBuffer> } | null> {
	const fromLink = keyFromFragment(hash);
	const key = fromLink ?? recallInviteKey(invite.partnershipId);
	if (!key) {
		return null;
	}
	const vault = await inviteVault(invite.partnershipId, key);
	const opened = await openRecord(partnershipInviteKind, {
		recordId: invite.partnershipId,
		ciphertext: invite.ciphertext,
		payloadVersion: invite.payloadVersion,
		vault
	});
	if (!opened) {
		return null;
	}
	if (fromLink) {
		rememberInviteKey(invite.partnershipId, key);
	}
	return { invite: opened, key };
}

/**
 * Pins the inviter's key as verified on this device, from the copy inside the
 * invite — which came from the inviter's own device by way of the link, never
 * from the server. False when the server serves a different key: whoever
 * swapped it is exactly what pinning exists to catch, so the page refuses to
 * go on. See docs/encryption.md, "Trust".
 */
export async function pinInviterFromInvite(input: {
	userId: string;
	partnershipId: string;
	fromInvite: string;
	served: string | null;
}): Promise<boolean> {
	if (input.served !== input.fromInvite) {
		return false;
	}
	await writePin(await keyStore(), input.userId, input.partnershipId, input.fromInvite, {
		verified: true
	});
	return true;
}
