/**
 * The vaults this device has open, for the screens that read and write sealed
 * records.
 *
 * BROWSER ONLY — see the note at the top of `kdf.ts`.
 *
 * Module-level `$state`, like the keyring in `session.svelte.ts`: one signed-in
 * user, one set of vaults, and every screen needs the same ones. Filled by
 * `initialiseVaults`, which `EncryptionGate` calls once the identity is
 * unlocked; emptied whenever the keyring is.
 *
 * Opening and creating are `ensureVaults`'s job (`ensure-vaults.ts`); this is
 * the network and trust wiring around it, and the reactive view of the result.
 */

import { sealedReader } from '../sealed-cache.svelte';
import type { VaultListingView } from '../types';
import {
	type EnsureVaultsDeps,
	ensureVaults,
	type OpenedVaults,
	StaleIdentityError
} from './ensure-vaults';
import { refreshTrust, trustAllowsSending } from './trust.svelte';
import { type OpenVault, unwrapVaultKey, wrapVaultKey } from './vault';

export type VaultsState =
	/** Not started: the keyring is not unlocked yet. */
	| { status: 'idle' }
	| { status: 'loading' }
	| ({ status: 'ready' } & OpenedVaults)
	/** The listing could not be fetched. Screens render their placeholder. */
	| { status: 'failed' };

let state = $state<VaultsState>({ status: 'idle' });

let runningFor: string | null = null;
let running: Promise<VaultsState> | null = null;
/** The identity the open vaults came from, for re-opening a wrap to share it. */
let heldIdentity: { recipient: string; identity: CryptoKey | string } | null = null;

/** Reactive: reading this in a template tracks it. */
export function currentVaults(): VaultsState {
	return state;
}

/**
 * One partnership's vault: `undefined` while vaults are still being worked
 * out, null when this device cannot open it, the vault otherwise. The three
 * states a screen renders as placeholder, "cannot show", and content.
 */
export function partnershipVault(partnershipId: string): OpenVault | null | undefined {
	if (state.status === 'idle' || state.status === 'loading') {
		return undefined;
	}
	if (state.status === 'failed') {
		return null;
	}
	return state.partnerships[partnershipId] ?? null;
}

/** The user's own vault, in the same three states as `partnershipVault`. */
export function selfVault(): OpenVault | null | undefined {
	if (state.status === 'idle' || state.status === 'loading') {
		return undefined;
	}
	return state.status === 'ready' ? state.self : null;
}

/** A request that never got an answer: offline, or cut short by a navigation. */
class VaultNetworkError extends Error {}

async function request(path: string, init?: RequestInit): Promise<Response> {
	try {
		return await fetch(path, {
			...init,
			headers: init?.body ? { 'content-type': 'application/json' } : undefined
		});
	} catch (error) {
		// `fetch` rejects only when there was no response at all. Told apart from
		// a real failure because a page navigating away aborts this routinely,
		// and that is not worth a line in anyone's console.
		throw new VaultNetworkError('A vault request got no response', { cause: error });
	}
}

/**
 * Opens every vault this user can reach, creating what is missing.
 *
 * Runs once per user per page load; a second call while one is in flight joins
 * it. `refresh` runs it again, for when something changed underneath — a
 * partnership accepted while the app was open.
 */
export async function initialiseVaults(
	userId: string,
	identity: { recipient: string; identity: CryptoKey | string },
	options: { refresh?: boolean } = {}
): Promise<VaultsState> {
	if (runningFor === userId && running !== null) {
		return await running;
	}
	if (!options.refresh && state.status === 'ready') {
		return state;
	}

	const deps: EnsureVaultsDeps = {
		userId,
		identity,
		async list() {
			const response = await request('/api/vaults');
			if (!response.ok) {
				throw new Error(`Could not load vaults (${response.status})`);
			}
			return (await response.json()) as VaultListingView;
		},
		async create(vault) {
			const response = await request('/api/vaults', {
				method: 'POST',
				body: JSON.stringify(vault)
			});
			if (response.status === 409) {
				return 'exists';
			}
			if (!response.ok) {
				throw new Error(`Could not create a vault (${response.status})`);
			}
			return 'created';
		},
		async putWrap(vaultId, wrap) {
			const response = await request(`/api/vaults/${vaultId}/wraps`, {
				method: 'PUT',
				body: JSON.stringify(wrap)
			});
			// 409: the partner's own device got there first. Nothing to do.
			if (!response.ok && response.status !== 409) {
				throw new Error(`Could not share a vault with a partner (${response.status})`);
			}
		},
		escrow: {
			async issueShare(escrowId) {
				const response = await request('/api/vaults/self/escrow-share', {
					method: 'POST',
					body: JSON.stringify({ escrowId })
				});
				if (!response.ok) {
					throw new Error(`Could not start an escrow (${response.status})`);
				}
				return ((await response.json()) as { share: string }).share;
			},
			async put(escrow) {
				const response = await request('/api/vaults/self/escrows', {
					method: 'PUT',
					body: JSON.stringify(escrow)
				});
				if (!response.ok) {
					throw new Error(`Could not store an escrow (${response.status})`);
				}
			},
			async release() {
				const response = await request('/api/vaults/self/escrow-release', { method: 'POST' });
				if (!response.ok) {
					throw new Error(`Could not ask for the escrow back (${response.status})`);
				}
				return (
					(await response.json()) as {
						relays: { escrowId: string; ciphertext: string; share: string }[];
					}
				).relays;
			},
			async deleteAll() {
				const response = await request('/api/vaults/self/escrows', { method: 'DELETE' });
				if (!response.ok) {
					throw new Error(`Could not replace escrows (${response.status})`);
				}
			},
			async deleteLostSelfVault() {
				const response = await request('/api/vaults/self', { method: 'DELETE' });
				return response.ok;
			}
		},
		async trustAllows(partnershipId, served) {
			return trustAllowsSending(await refreshTrust(userId, partnershipId, served));
		},
		report(message) {
			console.error(`vaults: ${message}`);
		}
	};

	if (state.status !== 'ready') {
		state = { status: 'loading' };
	}
	heldIdentity = identity;
	runningFor = userId;
	running = ensureVaults(deps)
		.then((opened): VaultsState => {
			// A sign-out while this was in flight: leave the cleared state alone.
			if (runningFor !== userId) {
				return state;
			}
			state = { status: 'ready', ...opened };
			return state;
		})
		.catch((error: unknown): VaultsState => {
			// Background work nobody is waiting on (docs/request-failures.md), so
			// no app-wide notice: the screens that need a vault show their
			// placeholder, and the next page load tries again. Logged only when it
			// is a real failure: no connection is the notice's job elsewhere, and a
			// stale identity is the keyring's, which is sending the device to sign
			// in again as this runs.
			if (!(error instanceof VaultNetworkError || error instanceof StaleIdentityError)) {
				console.error('could not open vaults', error);
			}
			if (runningFor === userId && state.status !== 'ready') {
				state = { status: 'failed' };
			}
			return state;
		})
		.finally(() => {
			if (runningFor === userId) {
				runningFor = null;
				running = null;
			}
		});
	return await running;
}

/** Forgets every open vault — on sign-out, or a different account in the same tab. */
/**
 * A partnership's vault key, wrapped for `recipient` — the key a partner is
 * about to have after a partner-assisted sign-in.
 *
 * Opens this device's own wrap again rather than keeping the key around (see
 * `crypto/vault.ts`), so it fetches the listing for the wrap. Null when this
 * device holds no usable wrap for the partnership's vault.
 */
export async function wrapPartnershipVaultFor(
	partnershipId: string,
	recipient: string
): Promise<string | null> {
	const identity = heldIdentity;
	if (!identity) {
		return null;
	}
	const response = await fetch('/api/vaults');
	if (!response.ok) {
		throw new Error(`Could not load vaults (${response.status})`);
	}
	const listing = (await response.json()) as VaultListingView;
	const vault = listing.partnerships.find((entry) => entry.partnershipId === partnershipId)?.vault;
	if (!vault?.wrap) {
		return null;
	}
	const raw = await unwrapVaultKey({
		ciphertext: vault.wrap.ciphertext,
		identity: identity.identity,
		vault
	});
	if (!raw) {
		return null;
	}
	try {
		return await wrapVaultKey({ vaultId: vault.id, raw, recipient });
	} finally {
		raw.fill(0);
	}
}

export function resetVaults(): void {
	// Everything opened with these vaults goes with them: the next account in
	// this tab must not be shown the last one's records from the cache.
	sealedReader.clear();
	heldIdentity = null;
	state = { status: 'idle' };
	runningFor = null;
	running = null;
}
