/**
 * Your kink list as one partner sees it, and the copy of it sealed into your
 * partnership's vault. See docs/kink-list.md, "Partners".
 *
 * BROWSER ONLY at run time: it seals with `crypto/sealed.ts`.
 *
 * The screens use it like any other store. What it does differently:
 *
 * - `list` is the **effective** list: your own, with this partner's
 *   overrides in place.
 * - An answer changed here is an **override**, unless your own list has no
 *   answer for that kink yet — then it goes on your own list, and this view
 *   follows it (`answerTarget`).
 * - Everything else (custom kinks, triage, settings) is your own list's, and
 *   is changed there.
 * - It saves the partner copy, with `resolved` worked out again from your
 *   own list each time; your own list saves itself.
 */

import { openRecord } from '../crypto/sealed';
import { vaultById, vaultsSettled } from '../crypto/vaults.svelte';
import { describeRequestFailure, tryFetch } from '../request-failure.svelte';
import { sealForSubmit } from '../sealed-forms';
import { kinkListPartnerKind } from '../sealed-kinds/kink-list';
import type { KinkListView } from '../types';
import type { AccountKinkList } from './account-store.svelte';
import {
	type Answer,
	type CustomKink,
	hasContent,
	type ItemKey,
	type ListPayload,
	type TriageValue
} from './answers';
import {
	answerTarget,
	effectiveList,
	emptyPartnerPayload,
	isHeld,
	isOverridden,
	mergePartnerPayloads,
	type PartnerPayload,
	resolvedFor
} from './partner';
import { KinkListStore, type SaveState } from './store.svelte';

const MAX_SAVE_ATTEMPTS = 3;

/** Opens a partner copy sealed in a partnership's vault, or null for one this device cannot. */
export async function openPartnerCopy(view: KinkListView): Promise<PartnerPayload | null> {
	await vaultsSettled();
	const vault = vaultById(view.sealed.vaultId);
	if (!vault) {
		return null;
	}
	return await openRecord(kinkListPartnerKind, { ...view.sealed, vault });
}

export class PartnerKinkList extends KinkListStore {
	readonly kind = 'account';
	/** The copy for this partner, as it stands here. */
	partner = $state.raw<PartnerPayload>(emptyPartnerPayload());
	/** Whether this partner has been given a copy at all. Nothing is sealed for them until they have. */
	shared = $state(false);

	readonly solo: AccountKinkList;
	readonly partnershipId: string;
	#saved: { id: string; revision: number | null };
	readonly #view: KinkListView | null;

	/** `name` is read each time: a partner's name is sealed, and may still be opening. */
	constructor(
		solo: AccountKinkList,
		partnershipId: string,
		view: KinkListView | null,
		name: () => string
	) {
		super();
		this.solo = solo;
		this.partnershipId = partnershipId;
		this.#view = view;
		this.#saved = { id: view?.id ?? crypto.randomUUID(), revision: view?.revision ?? null };
		this.shared = view !== null;
		this.partnerControls = {
			get name() {
				return name();
			},
			isOverridden: (key) => isOverridden(this.partner, key),
			hasOwn: (key) => hasContent(this.solo.list.answers[key]),
			isHeld: (key) => isHeld(this.partner, key),
			reset: (key) => this.#setOverride(key, undefined),
			copyToOwn: (key) => this.#copyToOwn(key),
			setHeld: (key, held) =>
				this.#update({
					...this.partner,
					heldBack: { ...this.partner.heldBack, [key]: { held, at: Date.now() } }
				})
		};
	}

	/** Opens the copy, once your own list is open. Resolves once `state` is settled. */
	async open(): Promise<void> {
		if (this.#view) {
			const opened = await openPartnerCopy(this.#view);
			if (!opened) {
				this.state = 'unreadable';
				return;
			}
			this.partner = opened;
		}
		this.list = effectiveList(this.solo.list, this.partner);
		this.state = this.solo.state === 'ready' ? 'ready' : this.solo.state;
	}

	/** Brings what is on screen up to date with your own list, after it changed. */
	refresh(): void {
		this.list = effectiveList(this.solo.list, this.partner);
	}

	#update(partner: PartnerPayload): void {
		this.partner = partner;
		this.change(effectiveList(this.solo.list, partner));
	}

	/** After a change to your own list: what is shown follows, and the copy is sealed again. */
	#followOwn(): void {
		this.change(effectiveList(this.solo.list, this.partner));
	}

	#setOverride(key: ItemKey, answer: Omit<Answer, 'at'> | undefined): void {
		this.#update({
			...this.partner,
			overrides: { ...this.partner.overrides, [key]: { ...answer, at: Date.now() } }
		});
	}

	#copyToOwn(key: ItemKey): void {
		const override = this.partner.overrides[key];
		if (!override) {
			return;
		}
		const { at: _at, ...answer } = override;
		this.solo.setAnswer(key, () => answer);
		this.#setOverride(key, undefined);
	}

	// ── changes ──────────────────────────────────────────────────────────────

	override setAnswer(
		key: ItemKey,
		update: (current: Answer | undefined) => Omit<Answer, 'at'>
	): void {
		if (answerTarget(this.solo.list, key) === 'own') {
			this.solo.setAnswer(key, update);
			this.#followOwn();
			return;
		}
		this.#setOverride(key, update(this.list.answers[key]));
	}

	override transform(update: (list: ListPayload) => ListPayload): void {
		this.solo.transform(update);
		this.#followOwn();
	}

	override setTriage(categoryId: string, value: TriageValue): void {
		this.solo.setTriage(categoryId, value);
		this.#followOwn();
	}

	override setMaxIntensity(maxIntensity: number): void {
		this.solo.setMaxIntensity(maxIntensity);
		this.#followOwn();
	}

	override setSkipped(key: ItemKey, skipped: boolean): void {
		this.solo.setSkipped(key, skipped);
		this.#followOwn();
	}

	override addCustom(kink: Omit<CustomKink, 'at' | 'removed'>): `custom:${string}` {
		const key = this.solo.addCustom(kink);
		this.#followOwn();
		return key;
	}

	override removeCustom(key: `custom:${string}`): void {
		this.solo.removeCustom(key);
		this.#followOwn();
	}

	setBlind(on: boolean): void {
		this.#update({ ...this.partner, blind: { on, at: Date.now() } });
	}

	/** Gives this partner a copy of the list. */
	async share(): Promise<void> {
		this.shared = true;
		this.#followOwn();
		await this.flush();
	}

	// ── saving ───────────────────────────────────────────────────────────────

	protected async persist(): Promise<SaveState> {
		if (!this.shared) {
			// Nothing sealed for a partner until they are given a copy. Your own
			// list saves itself.
			return { status: 'saved' };
		}
		let { partner } = this;
		for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt += 1) {
			const payload: PartnerPayload = {
				...partner,
				resolved: resolvedFor(this.solo.list, partner),
				soloRevision: this.solo.revision
			};
			const sealed = await sealForSubmit(kinkListPartnerKind, {
				scope: { kind: 'partnership', partnershipId: this.partnershipId },
				recordId: this.#saved.id,
				payload,
				describe: () => 'Your list for your partner could not be saved. Reload and try again.'
			});
			if (!sealed.ok) {
				return { status: 'failed', error: sealed.error };
			}
			const response = await tryFetch(`/api/kink-lists/${encodeURIComponent(this.partnershipId)}`, {
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
			// Saved from another device first: merge its overrides with these, per kink.
			const latest = await this.#fetchOwnCopy();
			if (!latest) {
				return { status: 'failed', error: describeRequestFailure(null) };
			}
			this.#saved = { id: latest.view.id, revision: latest.view.revision };
			partner = mergePartnerPayloads(latest.partner, partner);
			this.partner = mergePartnerPayloads(partner, this.partner);
			this.refresh();
		}
		return { status: 'failed', error: 'Your list kept changing elsewhere. Try again.' };
	}

	async #fetchOwnCopy(): Promise<{ view: KinkListView; partner: PartnerPayload } | null> {
		const response = await tryFetch(`/api/kink-lists/${encodeURIComponent(this.partnershipId)}`);
		if (!response?.ok) {
			return null;
		}
		const { list: view } = (await response.json()) as { list: KinkListView | null };
		const partner = view ? await openPartnerCopy(view) : null;
		return view && partner ? { view, partner } : null;
	}
}
