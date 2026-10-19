/**
 * A partnership's names, as a template shows them.
 *
 * BROWSER ONLY in effect, like `sealed-views.svelte.ts`: on the server nothing
 * opens, so every name renders as the placeholder, which is what SSR should
 * show for something the server cannot read.
 *
 * The server hands each screen a `PartnerNamesSource` rather than a name
 * (docs/partners.md, "Names are sealed"), and this opens it — from the
 * partnership's vault, from the invite before the names have moved there, or
 * straight from plaintext for a partnership older than sealing — and then
 * maps "theirs" and "yours" with `namesForViewer`, the one place that mapping
 * lives (AGENTS.md invariant 12).
 */

import { SvelteMap } from 'svelte/reactivity';
import { forgetInviteKey, inviteVault, recallInviteKey, unwrapInviteKey } from './crypto/invite';
import type { OpenVault } from './crypto/vault';
import { currentVaults, heldVaultIdentity, onVaultsReset, vaultById } from './crypto/vaults.svelte';
import {
	namesForViewer,
	type PartnerNamesSource,
	type StoredNames,
	type ViewerNames
} from './partnership';
import { sealedReader } from './sealed-cache.svelte';
import { partnershipInviteKind, partnershipNamesKind } from './sealed-kinds/partnerships';
import { type Opened, openedPart, shownText } from './sealed-views.svelte';

/** Each invite's one-off vault, by partnership: null when this device holds no key for it. */
const inviteVaults = new SvelteMap<string, OpenVault | null>();
const opening = new Set<string>();
let generation = 0;

onVaultsReset(() => {
	generation += 1;
	inviteVaults.clear();
	opening.clear();
});

async function openInviteVault(source: PartnerNamesSource): Promise<OpenVault | null> {
	const { partnershipId, invite } = source;
	if (!invite) {
		return null;
	}
	let raw: Uint8Array<ArrayBuffer> | null;
	if (invite.keyWrap) {
		// The inviter: the key is wrapped to them, and their identity opens it.
		const held = heldVaultIdentity();
		raw = held ? await unwrapInviteKey(partnershipId, invite.keyWrap, held.identity) : null;
	} else {
		// The invitee: the key came in the link, and this device kept it.
		raw = recallInviteKey(partnershipId);
	}
	return raw ? await inviteVault(partnershipId, raw) : null;
}

function inviteVaultFor(source: PartnerNamesSource): Opened<OpenVault> {
	const id = source.partnershipId;
	if (inviteVaults.has(id)) {
		return inviteVaults.get(id);
	}
	// The inviter's key opens with the identity the vaults came from, so wait
	// for those; reading the state here is also what re-runs this when they land.
	const vaults = currentVaults();
	if (vaults.status === 'idle' || vaults.status === 'loading') {
		return undefined;
	}
	if (!opening.has(id)) {
		opening.add(id);
		const started = generation;
		void openInviteVault(source)
			.catch(() => null)
			.then((vault) => {
				if (started === generation) {
					inviteVaults.set(id, vault);
				}
			})
			.finally(() => {
				opening.delete(id);
			});
	}
	return undefined;
}

const forgotten = new Set<string>();

/**
 * Forgets the invitee's key from the link, now that a load has served the
 * names from the vault and so cleared the invite it opened. Not when the
 * sealing pass moves them: a page whose load had read the invite a moment
 * before still needs the key, and without it showed the names as unreadable
 * until the next load. Once per partnership, as this runs on every render.
 */
function forgetInviteKeyOnce(partnershipId: string) {
	if (!forgotten.has(partnershipId)) {
		forgotten.add(partnershipId);
		forgetInviteKey(partnershipId);
	}
}

/** The four stored names and roles, in the three states every sealed read has. */
export function openedNames(source: PartnerNamesSource): Opened<StoredNames> {
	if (source.legacy) {
		return source.legacy;
	}
	const { sealed, invite, partnershipId } = source;
	if (sealed) {
		forgetInviteKeyOnce(partnershipId);
		return sealedReader.read(
			partnershipNamesKind,
			{
				recordId: partnershipId,
				ciphertext: sealed.ciphertext,
				payloadVersion: sealed.payloadVersion
			},
			vaultById(sealed.vaultId)
		);
	}
	if (invite) {
		const opened = sealedReader.read(
			partnershipInviteKind,
			{
				recordId: partnershipId,
				ciphertext: invite.ciphertext,
				payloadVersion: invite.payloadVersion
			},
			inviteVaultFor(source)
		);
		return openedPart(opened, ({ inviterRecipient: _, ...names }) => names);
	}
	return null;
}

/** The names as this viewer sees them: whose is whose, worked out. */
export function viewerNames(source: PartnerNamesSource): Opened<ViewerNames> {
	return openedPart(openedNames(source), (names) => namesForViewer(names, source.role));
}

/** What the viewer calls the other person, or a placeholder while it opens. */
export function partnerName(source: PartnerNamesSource): string {
	return shownText(openedPart(viewerNames(source), (names) => names.partnerName));
}
