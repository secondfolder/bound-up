/**
 * Permission, on this device, to write into one vault.
 *
 * BROWSER ONLY — see the note at the top of `kdf.ts`.
 *
 * Writing into a partnership vault is only safe while this device still trusts
 * the partnership's keys: a server that swapped the partner's recipient or the
 * vault itself is exactly what pinning exists to catch, and a write made
 * after the warning appeared would go to whoever did the swapping. Before
 * vaults, the composer checked `trustAllowsSending` and two other writes —
 * reactions and embed metadata — quietly did not.
 *
 * So `sealRecord` takes a grant rather than a boolean. A grant for a
 * partnership vault comes only from `writeGrantFor` in `trust.svelte.ts`,
 * which asks the trust check first, and a grant for the user's own vault from
 * `selfWriteGrant`, and for an invite's one-off vault from `inviteWriteGrant`
 * (`invite.ts`). A write that skipped the question has nothing to pass.
 *
 * The brand is a compile-time device: nothing stops code calling `issue`
 * directly, which is why it is not exported from anywhere else and why only
 * those three places do.
 */

declare const grantBrand: unique symbol;

export type WriteGrant = {
	readonly vaultId: string;
	readonly [grantBrand]: true;
};

/** For `trust.svelte.ts`, `selfWriteGrant` and `inviteWriteGrant` only. See the file comment. */
export function issueWriteGrant(vaultId: string): WriteGrant {
	return { vaultId } as WriteGrant;
}

/**
 * A grant for the user's own vault. No trust check applies: nothing about it
 * involves anyone else's key, and the self vault only opens from a wrap whose
 * MAC this user's identity made (`unwrapSelfVaultKey`), so it cannot be one
 * the server made up. The fingerprint alone would not show that: the server
 * can fingerprint a key of its own. (A wrap from before the MAC still opens
 * while `ACCEPT_LEGACY_SELF_WRAPS` is true; see docs/encryption.md.)
 */
export function selfWriteGrant(vault: { id: string; kind: 'self' | 'partnership' }): WriteGrant {
	if (vault.kind !== 'self') {
		throw new Error('A partnership vault needs a grant from the trust check');
	}
	return issueWriteGrant(vault.id);
}
