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
 * - **The self vault** is opened, or created if the account has none. Its
 *   wrap carries a MAC only this user's identity can make, so it is the one
 *   vault no trust check is needed for; one from before the MAC is replaced
 *   as it is opened (`upgradeSelfWrap`).
 * - **Each partnership vault** is opened, or created — wrapped to both
 *   members — if the partnership has none.
 * - **A partner whose wrap is missing or stale** (made for a key they no
 *   longer have, after a partner-assisted sign-in) is wrapped for again.
 *
 * Creating or wrapping for a partner hands the vault key to whatever
 * recipient the server says they have, so both wait on the trust check: a key
 * this device has been warned about gets nothing until the user accepts it.
 * The user's own key needs no trust at all, because the device holds it: what
 * the server says it is is checked against the identity, never pinned on
 * first use.
 * Opening needs no such check — reading cannot leak anything — so a vault is
 * opened even while writes into it are held back.
 *
 * The network and the trust check are passed in, so this runs in node tests
 * with real cryptography and no browser. `vaults.svelte.ts` is the app's
 * wiring of it.
 */

import type { VaultListingView, VaultWrapView } from '../types';
import { decryptBytes, encryptBytesTo, openUnderShare, sealUnderShare } from './escrow';
import {
	deriveVaultKeys,
	generateVaultKey,
	type OpenVault,
	openVaultWrap,
	unwrapSelfVaultKey,
	unwrapVaultKey,
	vaultFromKey,
	wrapSelfVaultKey,
	wrapVaultKey
} from './vault';

/**
 * A vault about to be made. Which space it is for is `create`'s first
 * argument: the request names its space in the path, as every scoped write
 * does (docs/spaces.md). `kind` is what the vault is, for the device's own
 * bookkeeping; the server works it out from the space.
 */
export type VaultCreation = {
	kind: 'self' | 'partnership';
	id: string;
	keyCheck: string;
	wraps: { userId: string; ciphertext: string; forRecipient: string }[];
};

/**
 * The network, passed in. Every call names the space it acts in: the own
 * vault's is the listing's `soloSpaceId`, and a partnership's vault is in the
 * shared space whose id is the partnership's (docs/spaces.md, "Ids are the
 * partnership's").
 */
export type EnsureVaultsDeps = {
	userId: string;
	identity: { recipient: string; identity: CryptoKey | string };
	list: () => Promise<VaultListingView>;
	/** `created`, or `exists` when another device won the race. */
	create: (spaceId: string, vault: VaultCreation) => Promise<'created' | 'exists'>;
	putWrap: (
		spaceId: string,
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
	/**
	 * The user's own vault held in escrow by their partners. See `escrow.ts`.
	 * Each names the user's solo space, which is where their own vault is.
	 */
	escrow: {
		/** The server's share for a new escrow id. */
		issueShare: (soloSpaceId: string, escrowId: string) => Promise<string>;
		/** Held in `heldInSpaceId`: the shared space of the partner holding it. */
		put: (
			soloSpaceId: string,
			escrow: { id: string; heldInSpaceId: string; ciphertext: string }
		) => Promise<void>;
		/** After a partner-assisted sign-in: the relays partners passed on, with the server's share of each. */
		release: (
			soloSpaceId: string
		) => Promise<{ escrowId: string; ciphertext: string; share: string }[]>;
		/** Replaces nothing: drops every escrow, so they are made again under new shares. */
		deleteAll: (soloSpaceId: string) => Promise<void>;
		/** Deletes an own vault nothing can bring back. False while something still might. */
		deleteLostSelfVault: (soloSpaceId: string) => Promise<boolean>;
	};
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

	const { soloSpaceId } = listing;
	let lostRace = false;
	const opened: OpenedVaults = { self: null, partnerships: {} };
	/**
	 * The own vault's raw key, once this pass has opened, made or recovered it,
	 * for making escrows below without opening the wrap again. Zeroed at the
	 * end.
	 */
	let selfRaw: Uint8Array<ArrayBuffer> | null = null;
	/** Partnerships already holding the own vault in escrow. */
	let escrowed = new Set(listing.self?.escrowPartnershipIds ?? []);

	// ── the self vault ──
	let createSelf = !listing.self;
	if (listing.self) {
		if (usable(listing.self.wrap, identity.recipient)) {
			// Checked against a MAC only this identity can make, so a self vault
			// the server made up does not open (`unwrapSelfVaultKey`).
			const unwrapped = await unwrapSelfVaultKey({
				ciphertext: listing.self.wrap.ciphertext,
				identity: identity.identity,
				recipient: identity.recipient,
				vault: listing.self
			});
			if (unwrapped) {
				opened.self = await vaultFromKey(unwrapped.raw, listing.self);
				selfRaw = unwrapped.raw;
				if (unwrapped.legacy) {
					await upgradeSelfWrap(deps, soloSpaceId, listing.self.id, unwrapped.raw);
				}
			} else {
				deps.report('the self vault has a wrap for this key that does not open');
			}
		} else {
			// No wrap for this key: a partner-assisted sign-in replaced it. The
			// escrow is the only way back (`recoverSelfVault`); when nothing can
			// ever bring the vault back, it is replaced with a new one.
			const recovered = await recoverSelfVault(deps, soloSpaceId, listing.self);
			if (recovered) {
				opened.self = await vaultFromKey(recovered, listing.self);
				selfRaw = recovered;
				// Every share of the old escrows has now been released, so they
				// are made again below, under new ids and so new shares.
				await deps.escrow.deleteAll(soloSpaceId);
				escrowed = new Set();
			} else if (mayCreate && (await deps.escrow.deleteLostSelfVault(soloSpaceId))) {
				createSelf = true;
			}
		}
	}
	if (createSelf && mayCreate) {
		const raw = generateVaultKey();
		const { keyCheck } = await deriveVaultKeys(raw);
		const id = newId();
		const result = await deps.create(soloSpaceId, {
			kind: 'self',
			id,
			keyCheck,
			wraps: [
				{
					userId,
					ciphertext: await wrapSelfVaultKey({
						vaultId: id,
						raw,
						identity: identity.identity,
						recipient: identity.recipient
					}),
					forRecipient: identity.recipient
				}
			]
		});
		if (result === 'created') {
			opened.self = await vaultFromKey(raw, { id, kind: 'self', partnershipId: null });
			selfRaw = raw;
			escrowed = new Set();
		} else {
			lostRace = true;
			raw.fill(0);
		}
	}

	// ── partnership vaults ──
	for (const entry of listing.partnerships) {
		const { partnershipId, partnerId, recipients } = entry;
		// The server says what this user's own key is per partnership as well as
		// at the top of the listing, and a server that served a key of its own
		// here would be handed the vault key: every wrap and escrow below is
		// made to these recipients. The device knows its own key for certain, so
		// a mismatch is never trusted on first use — nothing is written for the
		// partnership until the two agree. Opening is still safe.
		const mineIsOurs = recipients.mine === identity.recipient;
		if (!mineIsOurs) {
			deps.report(`partnership ${partnershipId} was served a key for this user that is not theirs`);
		}
		const allowed =
			(await deps.trustAllows(partnershipId, {
				mine: recipients.mine,
				theirs: recipients.theirs,
				vaultCheck: entry.vault?.keyCheck ?? null
			})) && mineIsOurs;

		// The own vault, held in escrow with this partner — handing them half of
		// it, so it waits on the trust check like anything else for them.
		if (allowed && opened.self && !escrowed.has(partnershipId)) {
			const raw = selfRaw;
			if (raw) {
				const escrowId = newId();
				const share = await deps.escrow.issueShare(soloSpaceId, escrowId);
				const inner = await sealUnderShare({ raw, share, vault: opened.self });
				await deps.escrow.put(soloSpaceId, {
					id: escrowId,
					// The partnership's shared space has the partnership's id.
					heldInSpaceId: partnershipId,
					ciphertext: await encryptBytesTo(inner, recipients.theirs)
				});
				escrowed.add(partnershipId);
			}
		}

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
					await deps.putWrap(partnershipId, vault.id, {
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
		// A partnership's shared space has the partnership's id.
		const result = await deps.create(partnershipId, {
			kind: 'partnership',
			id,
			keyCheck,
			// The device's own key, not `recipients.mine` — equal by now, but this
			// is the wrap that decides who holds the vault, so it names the key the
			// device actually has.
			wraps: [
				await wrapFor(identity.recipient, userId),
				await wrapFor(recipients.theirs, partnerId)
			]
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

	selfRaw?.fill(0);
	return { opened, lostRace };
}

/**
 * The own vault's key, from a relay a partner passed on during a
 * partner-assisted sign-in and the server's share of its escrow — written
 * back as a wrap for the key this device holds now. Null when no relay opens.
 */
async function recoverSelfVault(
	deps: EnsureVaultsDeps,
	soloSpaceId: string,
	self: { id: string; keyCheck: string }
): Promise<Uint8Array<ArrayBuffer> | null> {
	for (const relay of await deps.escrow.release(soloSpaceId)) {
		const inner = await decryptBytes(relay.ciphertext, deps.identity.identity);
		if (!inner) {
			continue;
		}
		const raw = await openUnderShare({ inner, share: relay.share, vault: self });
		if (!raw) {
			deps.report('an escrow relay for the own vault did not open');
			continue;
		}
		await deps.putWrap(soloSpaceId, self.id, {
			userId: deps.userId,
			ciphertext: await wrapSelfVaultKey({
				vaultId: self.id,
				raw,
				identity: deps.identity.identity,
				recipient: deps.identity.recipient
			}),
			forRecipient: deps.identity.recipient
		});
		return raw;
	}
	return null;
}

/**
 * Replaces a self vault's wrap from before the MAC with one that has it, so
 * the account stops depending on `ACCEPT_LEGACY_SELF_WRAPS`. Reported rather
 * than thrown when the write fails: the vault is open either way, and the
 * next page load tries again.
 */
async function upgradeSelfWrap(
	deps: EnsureVaultsDeps,
	soloSpaceId: string,
	vaultId: string,
	raw: Uint8Array<ArrayBuffer>
): Promise<void> {
	try {
		await deps.putWrap(soloSpaceId, vaultId, {
			userId: deps.userId,
			ciphertext: await wrapSelfVaultKey({
				vaultId,
				raw,
				identity: deps.identity.identity,
				recipient: deps.identity.recipient
			}),
			forRecipient: deps.identity.recipient
		});
	} catch (error) {
		deps.report(`could not upgrade the self vault's wrap: ${String(error)}`);
	}
}
