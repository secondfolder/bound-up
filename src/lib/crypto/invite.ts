/**
 * The invite key: what an invite's names are sealed under before there is a
 * partnership vault to hold them.
 *
 * BROWSER ONLY — see the note at the top of `kdf.ts`.
 *
 * A random 256-bit key, made by the inviter's device and used exactly like a
 * vault key — the invite is an ordinary sealed record (`partnershipInviteKind`)
 * in a one-off "vault" of its own. It reaches the invitee only in the invite
 * link's fragment (`#k=…`), which a browser never sends to a server, so the
 * server, its logs and a link preview all see the token and nothing that
 * opens the names. The inviter's own devices get it back from a wrap to the
 * inviter's recipient, stored with the invite. See docs/partners.md, "Names
 * are sealed".
 */

import { fromBase64Url, toBase64Url } from '../encryption';
import {
	generateVaultKey,
	type OpenVault,
	unwrapOwnKey,
	vaultFromKey,
	wrapSelfVaultKey
} from './vault';
import { issueWriteGrant, type WriteGrant } from './write-grant';

const LEADING_HASH = /^#/;

/** The id the invite's one-off vault goes by: part of what it is sealed to. */
function inviteVaultId(partnershipId: string): string {
	return `invite:${partnershipId}`;
}

export function generateInviteKey(): Uint8Array<ArrayBuffer> {
	return generateVaultKey();
}

/** The invite key opened as a vault, to seal and open the invite record with. */
export async function inviteVault(
	partnershipId: string,
	raw: Uint8Array<ArrayBuffer>
): Promise<OpenVault> {
	return await vaultFromKey(raw, {
		id: inviteVaultId(partnershipId),
		kind: 'partnership',
		partnershipId
	});
}

/**
 * Permission to seal into an invite's vault. No trust check applies: the key
 * was made on this device or came from the link itself, and nobody else's
 * recipient is involved in using it.
 */
export function inviteWriteGrant(vault: OpenVault): WriteGrant {
	return issueWriteGrant(vault.id);
}

/**
 * The key wrapped to the inviter's own recipient, so their devices can reopen
 * it. With the same MAC as the self vault's wrap: the inviter's device builds
 * the link's `#k=` from whatever this opens to, and seals edited names under
 * it, so a key the server made up and wrapped to them would leak both.
 */
export async function wrapInviteKey(
	partnershipId: string,
	raw: Uint8Array<ArrayBuffer>,
	held: { recipient: string; identity: CryptoKey | string }
): Promise<string> {
	return await wrapSelfVaultKey({
		vaultId: inviteVaultId(partnershipId),
		raw,
		identity: held.identity,
		recipient: held.recipient
	});
}

/**
 * The key inside a wrap made by `wrapInviteKey`, or null when this identity
 * did not make it. A wrap from before the MAC still opens while
 * `ACCEPT_LEGACY_SELF_WRAPS` says so; an invite is short-lived, so nothing
 * upgrades it.
 */
export async function unwrapInviteKey(
	partnershipId: string,
	ciphertext: string,
	held: { recipient: string; identity: CryptoKey | string }
): Promise<Uint8Array<ArrayBuffer> | null> {
	const opened = await unwrapOwnKey({
		ciphertext,
		identity: held.identity,
		recipient: held.recipient,
		vaultId: inviteVaultId(partnershipId)
	});
	return opened?.raw ?? null;
}

function keyFrom(encoded: string): Uint8Array<ArrayBuffer> | null {
	try {
		const raw = fromBase64Url(encoded);
		return raw.length === 32 ? raw : null;
	} catch {
		return null;
	}
}

/** The fragment an invite link carries: `#k=` and the key. */
export function inviteFragment(raw: Uint8Array): string {
	return `#k=${toBase64Url(raw)}`;
}

/** The key in a link's fragment, or null when it has none or a malformed one. */
export function keyFromFragment(hash: string): Uint8Array<ArrayBuffer> | null {
	const encoded = new URLSearchParams(hash.replace(LEADING_HASH, '')).get('k');
	return encoded ? keyFrom(encoded) : null;
}

const STORAGE_PREFIX = 'bound-up:invite-key:';

/**
 * Keeps the key from a link on this device, for the invitee.
 *
 * The fragment does not survive the way to an account: signing in or up
 * redirects through the server, and confirming an email address opens a new
 * tab from a link of its own. So the key is put down here as soon as the
 * invite page sees it, and read back by that page after the round trip and by
 * the app until the names have moved into the vault (`forgetInviteKey`). Local
 * rather than session storage because the email link opens that new tab.
 */
export function rememberInviteKey(partnershipId: string, raw: Uint8Array): void {
	try {
		localStorage.setItem(`${STORAGE_PREFIX}${partnershipId}`, toBase64Url(raw));
	} catch {
		// Storage refused (a private window, a full quota): the link still works
		// in this tab, which is the common case.
	}
}

export function recallInviteKey(partnershipId: string): Uint8Array<ArrayBuffer> | null {
	try {
		const encoded = localStorage.getItem(`${STORAGE_PREFIX}${partnershipId}`);
		return encoded ? keyFrom(encoded) : null;
	} catch {
		return null;
	}
}

export function forgetInviteKey(partnershipId: string): void {
	try {
		localStorage.removeItem(`${STORAGE_PREFIX}${partnershipId}`);
	} catch {
		// Nothing to do: it was never there, or storage is unavailable.
	}
}
