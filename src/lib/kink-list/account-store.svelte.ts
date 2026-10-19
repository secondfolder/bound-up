/**
 * A signed-in person's own kink list: one sealed record in their vault
 * (`kinkListKind`), saved through `api/kink-lists/self`.
 *
 * BROWSER ONLY at run time: it seals with `crypto/sealed.ts`, and is only ever
 * opened after hydration, once the vaults are worked out.
 */

import { openRecord } from '../crypto/sealed';
import { selfVault, vaultById, vaultsSettled } from '../crypto/vaults.svelte';
import { describeRequestFailure, tryFetch } from '../request-failure.svelte';
import { sealForSubmit } from '../sealed-forms';
import { kinkListKind } from '../sealed-kinds/kink-list';
import type { KinkListView } from '../types';
import { emptyList, type ListPayload, mergeLists } from './answers';
import { KinkListStore, type SaveState } from './store.svelte';

/** What a page says when the saved list will not open here. */
export const ACCOUNT_LIST_UNREADABLE = "Your kink list can't be opened on this device.";
const MAX_SAVE_ATTEMPTS = 3;

type Saved = { id: string; revision: number | null };

export class AccountKinkList extends KinkListStore {
	readonly kind = 'account';
	#saved: Saved;
	readonly #view: KinkListView | null;

	/** `view` is the page's load data: the saved list, or null before the first save. */
	constructor(view: KinkListView | null) {
		super();
		this.#view = view;
		this.#saved = { id: view?.id ?? crypto.randomUUID(), revision: view?.revision ?? null };
	}

	/** Opens the saved list in this device's vault. Resolves once `state` is settled. */
	async open(): Promise<void> {
		if (!this.#view) {
			this.list = emptyList();
			this.state = 'ready';
			return;
		}
		const opened = await openSealedList(this.#view);
		if (opened) {
			this.list = opened;
			this.state = 'ready';
		} else {
			this.state = 'unreadable';
		}
	}

	/** Folds another copy of a list into this one: a device's list joining the account. */
	adopt(other: ListPayload): void {
		this.change(mergeLists(this.list, other));
	}

	protected async persist(list: ListPayload): Promise<SaveState> {
		let current = list;
		for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt += 1) {
			const sealed = await sealForSubmit(kinkListKind, {
				scope: { kind: 'self' },
				recordId: this.#saved.id,
				payload: current,
				describe: () => 'Something in your list could not be saved. Reload and try again.'
			});
			if (!sealed.ok) {
				return { status: 'failed', error: sealed.error };
			}
			const response = await tryFetch('/api/kink-lists/self', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: this.#saved.id,
					vaultId: sealed.fields.vaultId,
					ciphertext: sealed.fields.ciphertext,
					payloadVersion: Number(sealed.fields.payloadVersion),
					expectedRevision: this.#saved.revision
				})
			});
			if (response?.ok) {
				const { revision } = (await response.json()) as { revision: number };
				this.#saved = { ...this.#saved, revision };
				return { status: 'saved' };
			}
			if (response?.status !== 409) {
				return { status: 'failed', error: describeRequestFailure(response) };
			}
			// Another device saved first. Take its list, keep whichever answer
			// changed last for each kink, and try again on top of it.
			const latest = await fetchLatest();
			if (!latest) {
				return { status: 'failed', error: describeRequestFailure(null) };
			}
			this.#saved = { id: latest.view.id, revision: latest.view.revision };
			current = mergeLists(latest.list, current);
			// What is on screen gets the other device's answers too.
			this.list = mergeLists(current, this.list);
		}
		return { status: 'failed', error: 'Your list kept changing elsewhere. Try again.' };
	}
}

async function openSealedList(view: KinkListView): Promise<ListPayload | null> {
	await vaultsSettled();
	const vault = vaultById(view.sealed.vaultId) ?? selfVault();
	if (!vault) {
		return null;
	}
	return await openRecord(kinkListKind, { ...view.sealed, vault });
}

async function fetchLatest(): Promise<{ view: KinkListView; list: ListPayload } | null> {
	const response = await tryFetch('/api/kink-lists/self');
	if (!response?.ok) {
		return null;
	}
	const { list: view } = (await response.json()) as { list: KinkListView | null };
	if (!view) {
		return null;
	}
	const list = await openSealedList(view);
	return list ? { view, list } : null;
}
