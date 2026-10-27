/**
 * A signed-in person's own kink list: one sealed record in their vault
 * (`kinkListKind`), saved through `api/spaces/[spaceId]/kink-list` with their
 * solo space's id.
 *
 * BROWSER ONLY at run time: it seals with `crypto/sealed.ts`, and is only ever
 * opened after hydration, once the vaults are worked out.
 */

import { openRecord, openRecordDiagnosed } from '../crypto/sealed';
import { selfVault, vaultById, vaultsSettled } from '../crypto/vaults.svelte';
import { describeRequestFailure, tryFetch } from '../request-failure.svelte';
import type { SealedReadFailure } from '../sealed';
import { sealForSubmit } from '../sealed-forms';
import { kinkListKind } from '../sealed-kinds/kink-list';
import type { KinkListView } from '../types';
import { emptyList, type ListPayload, mergeLists } from './answers';
import { kinkListPath } from './api';
import { KinkListStore, type SaveState } from './store.svelte';

/** What a page says when the saved list will not open here. */
export const ACCOUNT_LIST_UNREADABLE = "Your kink list can't be opened on this device.";
const MAX_SAVE_ATTEMPTS = 3;

type Saved = { id: string; revision: number | null };

export class AccountKinkList extends KinkListStore {
	readonly kind = 'account';
	#saved: Saved;
	readonly #view: KinkListView | null;
	/** The person's solo space, which every save and fetch of their own list names. */
	readonly #spaceId: string;

	/**
	 * Called after each save with what was saved, so the copies shared with
	 * partners can follow it (`partner-sync.ts`).
	 */
	afterSave: ((list: ListPayload, revision: number) => void) | null = null;

	/**
	 * Why the saved list would not open, when `state` is `unreadable`: logged,
	 * and shown in debug mode. Never anything from inside the list.
	 */
	failure = $state.raw<SealedReadFailure | null>(null);

	/**
	 * Set by `startOver`: the next save asks the server to keep the list it
	 * replaces as a version, whatever its age, so the copy that would not
	 * open is still there once whatever broke it is fixed.
	 */
	#keepReplaced = false;

	/** The revision of the list as last saved, or null before the first save. */
	get revision(): number | null {
		return this.#saved.revision;
	}

	/**
	 * `spaceId` is the person's solo space; `view` is the page's load data: the
	 * saved list, or null before the first save.
	 */
	constructor(spaceId: string, view: KinkListView | null) {
		super();
		this.#spaceId = spaceId;
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
		const opened = await openOwnListDiagnosed(this.#view.sealed);
		if (opened.ok) {
			this.list = opened.value;
			this.state = 'ready';
			return;
		}
		const { ok: _ok, ...failure } = opened;
		this.failure = failure;
		this.state = 'unreadable';
		// The one place the reason is known: the server cannot read the list,
		// so it cannot say what is wrong with it. Paths, codes and types only.
		console.error('[kink-list] Your own list could not be opened on this device', {
			listId: this.#view.id,
			revision: this.#view.revision,
			payloadVersion: this.#view.sealed.payloadVersion,
			...failure
		});
	}

	/**
	 * The last resort for a list that will not open: an empty list in its
	 * place. The one it replaces is kept as a version on the server
	 * (`keepVersion`), so starting over loses nothing that a later fix could
	 * not bring back.
	 */
	async startOver(): Promise<void> {
		if (this.state !== 'unreadable') {
			return;
		}
		this.#keepReplaced = true;
		this.failure = null;
		this.state = 'ready';
		this.change(emptyList());
		await this.flush();
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
			const response = await tryFetch(kinkListPath(this.#spaceId), {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: this.#saved.id,
					vaultId: sealed.fields.vaultId,
					ciphertext: sealed.fields.ciphertext,
					payloadVersion: Number(sealed.fields.payloadVersion),
					expectedRevision: this.#saved.revision,
					keepVersion: this.#keepReplaced
				})
			});
			if (response?.ok) {
				const { revision } = (await response.json()) as { revision: number };
				this.#saved = { ...this.#saved, revision };
				this.#keepReplaced = false;
				this.afterSave?.(current, revision);
				return { status: 'saved' };
			}
			if (response?.status !== 409) {
				return { status: 'failed', error: describeRequestFailure(response) };
			}
			// Another device saved first. Take its list, keep whichever answer
			// changed last for each kink, and try again on top of it.
			const latest = await fetchLatest(this.#spaceId);
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

/** Opens your own list, or a version of it, sealed; null for one this device cannot open. */
export async function openOwnList(sealed: KinkListView['sealed']): Promise<ListPayload | null> {
	await vaultsSettled();
	const vault = vaultById(sealed.vaultId) ?? selfVault();
	if (!vault) {
		return null;
	}
	return await openRecord(kinkListKind, { ...sealed, vault });
}

async function openOwnListDiagnosed(sealed: KinkListView['sealed']) {
	await vaultsSettled();
	const vault = vaultById(sealed.vaultId) ?? selfVault();
	if (!vault) {
		return { ok: false, reason: 'no-vault' } as const;
	}
	return await openRecordDiagnosed(kinkListKind, { ...sealed, vault });
}

async function fetchLatest(
	spaceId: string
): Promise<{ view: KinkListView; list: ListPayload } | null> {
	const response = await tryFetch(kinkListPath(spaceId));
	if (!response?.ok) {
		return null;
	}
	const { list: view } = (await response.json()) as { list: KinkListView | null };
	if (!view) {
		return null;
	}
	const list = await openOwnList(view.sealed);
	return list ? { view, list } : null;
}
