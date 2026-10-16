/**
 * Opening, and where needed making, every vault a user can reach.
 *
 * BROWSER ONLY — see the note at the top of `kdf.ts`.
 *
 * Runs once per page load, after sign-in has unlocked the identity. It is the
 * one path vaults are created on, which is what lets new accounts, new
 * partnerships and every partnership that predates vaults all be handled the
 * same way, with no migration of their own:
 *
 * - **The self vault** is opened, or created if the account has none.
 * - **Each partnership vault** is opened, or created — wrapped to both
 *   members — if the partnership has none.
 * - **A partner whose wrap is missing or stale** (made for a key they no
 *   longer have, after a partner-assisted sign-in) is wrapped for again.
 *
 * Creating or wrapping for a partner hands the vault key to whatever
 * recipient the server says they have, so both wait on the trust check: a key
 * this device has been warned about gets nothing until the user accepts it.
 * Opening needs no such check — reading cannot leak anything — so a vault is
 * opened even while writes into it are held back.
 *
 * The network and the trust check are passed in, so this runs in node tests
 * with real cryptography and no browser. `vaults.svelte.ts` is the app's
 * wiring of it.
 */

import type { VaultListingView, VaultWrapView } from '../types';
import {
	deriveVaultKeys,
	generateVaultKey,
	type OpenVault,
	openVaultWrap,
	unwrapVaultKey,
	vaultFromKey,
	wrapVaultKey
} from './vault';

export type VaultCreation =
	| {
			kind: 'self';
			id: string;
			keyCheck: string;
			wraps: { userId: string; ciphertext: string; forRecipient: string }[];
	  }
	| {
			kind: 'partnership';
			id: string;
			partnershipId: string;
			keyCheck: string;
			wraps: { userId: string; ciphertext: string; forRecipient: string }[];
	  };

export type EnsureVaultsDeps = {
	userId: string;
	identity: { recipient: string; identity: CryptoKey | string };
	list: () => Promise<VaultListingView>;
	/** `created`, or `exists` when another device won the race. */
	create: (vault: VaultCreation) => Promise<'created' | 'exists'>;
	putWrap: (
		vaultId: string,
		wrap: { userId: string; ciphertext: string; forRecipient: string }
	) => Promise<void>;
	/**
	 * Evaluates (and on first sight pins) one partnership's keys, and says
	 * whether writing for it is allowed. Called again after this creates a
	 * vault, so the new vault's key check is pinned straight away.
	 */
	trustAllows: (
		partnershipId: string,
		served: { mine: string; theirs: string; vaultCheck: string | null }
	) => Promise<boolean>;
	/** For a vault this device should be able to open and cannot: logged, not thrown. */
	report: (message: string) => void;
	newId?: () => string;
};

export type OpenedVaults = {
	self: OpenVault | null;
	/** By partnership id. Missing when the partnership's vault cannot be opened here. */
	partnerships: Record<string, OpenVault>;
};

/** A wrap this device can try: one made for the key it holds now. */
function usable(wrap: VaultWrapView | null, recipient: string): wrap is VaultWrapView {
	return wrap !== null && wrap.forRecipient === recipient;
}

/**
 * The device's identity is not the account's current one: a partner-assisted
 * sign-in elsewhere replaced it. Not a failure of this module — the keyring
 * notices the same thing and sends the device to sign in again — so callers
 * open nothing and say nothing.
 */
export class StaleIdentityError extends Error {
	constructor() {
		super("This device's key is not the account's current key");
		this.name = 'StaleIdentityError';
	}
}

export async function ensureVaults(deps: EnsureVaultsDeps): Promise<OpenedVaults> {
	const first = await pass(deps, true);
	if (!first.lostRace) {
		return first.opened;
	}
	// Another device created a vault this one was about to. Its wrap for us is
	// in the listing now; a second pass opens it and creates nothing.
	return (await pass(deps, false)).opened;
}

async function pass(
	deps: EnsureVaultsDeps,
	mayCreate: boolean
): Promise<{ opened: OpenedVaults; lostRace: boolean }> {
	const { identity, userId } = deps;
	const newId = deps.newId ?? (() => crypto.randomUUID());
	const listing = await deps.list();
	if (listing.recipient !== identity.recipient) {
		// The keyring catches this itself and sends the device to sign in again;
		// opening nothing here keeps the two from disagreeing in the meantime.
		throw new StaleIdentityError();
	}

	let lostRace = false;
	const opened: OpenedVaults = { self: null, partnerships: {} };

	// ── the self vault ──
	if (listing.self) {
		if (usable(listing.self.wrap, identity.recipient)) {
			opened.self = await openVaultWrap({
				ciphertext: listing.self.wrap.ciphertext,
				identity: identity.identity,
				vault: listing.self
			});
			if (!opened.self) {
				deps.report('the self vault has a wrap for this key that does not open');
			}
		}
		// A wrap for an old key: only the escrow can bring this back, and that is
		// the account-recovery flow's job, not this one's.
	} else if (mayCreate) {
		const raw = generateVaultKey();
		const { keyCheck } = await deriveVaultKeys(raw);
		const id = newId();
		const result = await deps.create({
			kind: 'self',
			id,
			keyCheck,
			wraps: [
				{
					userId,
					ciphertext: await wrapVaultKey({ vaultId: id, raw, recipient: identity.recipient }),
					forRecipient: identity.recipient
				}
			]
		});
		if (result === 'created') {
			opened.self = await vaultFromKey(raw, { id, kind: 'self', partnershipId: null });
		} else {
			lostRace = true;
		}
		raw.fill(0);
	}

	// ── partnership vaults ──
	for (const entry of listing.partnerships) {
		const { partnershipId, partnerId, recipients } = entry;
		const allowed = await deps.trustAllows(partnershipId, {
			mine: recipients.mine,
			theirs: recipients.theirs,
			vaultCheck: entry.vault?.keyCheck ?? null
		});

		if (entry.vault) {
			const { vault } = entry;
			if (!usable(vault.wrap, identity.recipient)) {
				// Waiting on the partner to wrap for this key. Their device does that
				// as soon as it trusts it.
				continue;
			}
			const open = await openVaultWrap({
				ciphertext: vault.wrap.ciphertext,
				identity: identity.identity,
				vault
			});
			if (!open) {
				deps.report(`the vault for partnership ${partnershipId} has a wrap that does not open`);
				continue;
			}
			opened.partnerships[partnershipId] = open;

			if (allowed && vault.partnerWrapFor !== recipients.theirs) {
				const raw = await unwrapVaultKey({
					ciphertext: vault.wrap.ciphertext,
					identity: identity.identity,
					vault
				});
				if (raw) {
					await deps.putWrap(vault.id, {
						userId: partnerId,
						ciphertext: await wrapVaultKey({
							vaultId: vault.id,
							raw,
							recipient: recipients.theirs
						}),
						forRecipient: recipients.theirs
					});
					raw.fill(0);
				}
			}
			continue;
		}

		if (!(mayCreate && allowed)) {
			continue;
		}
		const raw = generateVaultKey();
		const { keyCheck } = await deriveVaultKeys(raw);
		const id = newId();
		const wrapFor = async (recipient: string, memberId: string) => ({
			userId: memberId,
			ciphertext: await wrapVaultKey({ vaultId: id, raw, recipient }),
			forRecipient: recipient
		});
		const result = await deps.create({
			kind: 'partnership',
			id,
			partnershipId,
			keyCheck,
			wraps: [await wrapFor(recipients.mine, userId), await wrapFor(recipients.theirs, partnerId)]
		});
		if (result === 'created') {
			opened.partnerships[partnershipId] = await vaultFromKey(raw, {
				id,
				kind: 'partnership',
				partnershipId
			});
			// Pins the vault this device just made, so its first sighting is the
			// real one rather than whatever the server serves next.
			await deps.trustAllows(partnershipId, { ...recipients, vaultCheck: keyCheck });
		} else {
			lostRace = true;
		}
		raw.fill(0);
	}

	return { opened, lostRace };
}
