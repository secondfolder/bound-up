/**
 * Reading sealed records from a template.
 *
 * BROWSER ONLY: it opens records with `crypto/sealed.ts`.
 *
 * Before this, every screen that showed encrypted content wrote the same
 * `$effect` by hand: wait for the keyring, loop over the records, decrypt each
 * into a `$state` record keyed by id, and guard against the effect being torn
 * down halfway. This is that, once:
 *
 *     const vault = $derived(partnershipVault(partnershipId));
 *     const task = $derived(sealedReader.read(taskKind, row, vault));
 *
 * `read` answers at once with what it has, and starts opening anything it has
 * not seen; the answer updates when that lands:
 *
 * - `undefined` — still working, or the vault is not open yet. A placeholder.
 * - `null` — it will not open here: a wrong vault, tampering, an unknown
 *   version, a payload that fails its schema. "Cannot show this".
 * - the payload, at the kind's latest version.
 *
 * That is the rule AGENTS.md sets for anything encrypted — a keyring that is
 * not `unlocked` renders a placeholder, never content — and it holds here by
 * construction, because there is no vault before the keyring is unlocked.
 *
 * Results are cached by kind, vault, record, version *and* ciphertext, so an
 * edit (a new ciphertext) is opened afresh and an unchanged record is opened
 * once per page load however many components show it.
 */

import { SvelteMap } from 'svelte/reactivity';
import { openRecord } from './crypto/sealed';
import type { OpenVault } from './crypto/vault';
import type { SealedKind } from './sealed';

export type SealedRow = { recordId: string; ciphertext: string; payloadVersion: number };

export class SealedReader {
	readonly #results = new SvelteMap<string, unknown>();
	readonly #pending = new Set<string>();
	/** Bumped by `clear`, so an open that lands after a sign-out is dropped. */
	#generation = 0;

	read<Latest>(
		kind: SealedKind<Latest>,
		row: SealedRow,
		vault: OpenVault | null | undefined
	): Latest | null | undefined {
		if (vault === undefined) {
			return undefined;
		}
		if (vault === null) {
			return null;
		}
		// NUL as the separator: none of the parts can contain one.
		const key = [kind.name, vault.id, row.recordId, row.payloadVersion, row.ciphertext].join('\0');
		if (this.#results.has(key)) {
			return this.#results.get(key) as Latest | null;
		}
		if (!this.#pending.has(key)) {
			this.#pending.add(key);
			const generation = this.#generation;
			void openRecord(kind, { ...row, vault })
				.catch((error: unknown) => {
					// `openRecord` returns null for everything a record can be; a throw
					// is a bug, and is shown as unreadable rather than as a spinner
					// that never stops.
					console.error(`could not open a ${kind.name}`, error);
					return null;
				})
				.then((value) => {
					if (generation === this.#generation) {
						this.#results.set(key, value);
					}
				})
				.finally(() => {
					this.#pending.delete(key);
				});
		}
		return undefined;
	}

	/** Forgets everything opened — on sign-out, or a different account in the same tab. */
	clear(): void {
		this.#generation += 1;
		this.#results.clear();
		this.#pending.clear();
	}
}

/** The one reader the app uses, so a record shown twice is opened once. */
export const sealedReader = new SealedReader();
