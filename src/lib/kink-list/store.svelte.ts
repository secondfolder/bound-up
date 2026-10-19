/**
 * Where a kink list lives while a page is open, and how it is saved.
 *
 * The screens are written once, against `KinkListStore`, and handed one of two:
 *
 * - **`AccountKinkList`** (`account-store.svelte.ts`) — signed in. The list
 *   is one sealed record in the person's own vault, saved through
 *   `api/kink-lists/self`.
 * - **`DeviceKinkList`** (`device-store.svelte.ts`) — signed out. The same
 *   payload in `localStorage`, for someone without an account
 *   (docs/kink-list.md, "Without an account").
 *
 * Both validate with `listPayloadSchema`, and every change stamps the kink it
 * touched with the time, so two copies always merge per kink (`mergeLists`).
 */

import {
	type Answer,
	type CustomKink,
	emptyList,
	type Filters,
	filtersOf,
	type ItemKey,
	type ListPayload,
	newCustomKey,
	normaliseAnswer,
	normaliseAnswers,
	type TriageValue
} from './answers';

export type StoreState = 'loading' | 'ready' | 'unreadable';

/** What a kink row offers in a partner's view (`partner-store.svelte.ts`). */
export type PartnerControls = {
	/** The partner's name, for "Just for Ada". */
	name: string;
	isOverridden: (key: ItemKey) => boolean;
	/** Whether your own list has an answer of its own for the kink. */
	hasOwn: (key: ItemKey) => boolean;
	isHeld: (key: ItemKey) => boolean;
	/** Drops this partner's answer, so your own list's shows again. */
	reset: (key: ItemKey) => void;
	/** Makes this partner's answer your own list's too. */
	copyToOwn: (key: ItemKey) => void;
	setHeld: (key: ItemKey, held: boolean) => void;
};
export type SaveState = { status: 'saved' | 'saving' | 'failed'; error?: string };

const SAVE_DELAY_MS = 600;

export abstract class KinkListStore {
	/** The list as it is now, unsaved changes included. Replaced whole on every change. */
	list = $state.raw<ListPayload>(emptyList());
	state = $state<StoreState>('loading');
	save = $state<SaveState>({ status: 'saved' });
	/** Whether the store holds changes not yet saved. */
	unsaved = $state(false);

	/** Who sees this list as theirs: a signed-in account, or just this device. */
	abstract readonly kind: 'account' | 'device';

	/** Set on a partner's view of the list: what a kink row needs for overrides and holding back. */
	partnerControls: PartnerControls | null = null;

	/**
	 * What the screens filter by. Your own list's settings; a partner's view
	 * has a side of its own, from who is in control (`partner-store.svelte.ts`).
	 */
	get filters(): Filters {
		return filtersOf(this.list);
	}

	/** Whether `filters.side` was worked out from the partnership, rather than chosen. */
	readonly sideFromControl: boolean = false;

	protected abstract persist(list: ListPayload): Promise<SaveState>;

	#timer: ReturnType<typeof setTimeout> | null = null;
	#saving: Promise<void> | null = null;

	protected change(next: ListPayload): void {
		if (this.state !== 'ready') {
			// Writing over a list this device could not open would replace
			// whatever is in it with only what was changed here.
			return;
		}
		this.list = next;
		this.unsaved = true;
		this.#schedule();
	}

	#schedule(): void {
		if (this.#timer) {
			clearTimeout(this.#timer);
		}
		this.#timer = setTimeout(() => {
			this.#timer = null;
			void this.flush();
		}, SAVE_DELAY_MS);
	}

	/** Saves now, waiting for any save already under way. Safe to call at any time. */
	async flush(): Promise<void> {
		if (this.#timer) {
			clearTimeout(this.#timer);
			this.#timer = null;
		}
		while (this.#saving !== null) {
			await this.#saving;
		}
		if (!this.unsaved) {
			return;
		}
		const snapshot = this.list;
		this.save = { status: 'saving' };
		this.#saving = (async () => {
			const outcome = await this.persist(snapshot);
			this.save = outcome;
			// Changes made while that save was in flight are still unsaved.
			if (outcome.status === 'saved' && this.list === snapshot) {
				this.unsaved = false;
			}
		})();
		try {
			await this.#saving;
		} finally {
			this.#saving = null;
		}
		if (this.unsaved && this.save.status === 'saved') {
			this.#schedule();
		}
	}

	// ── changes ──────────────────────────────────────────────────────────────

	/**
	 * Changes one kink's answer. `update` gets the current answer and returns
	 * the new one; the time is stamped here. Returning `{}` clears it, which
	 * is kept as an empty answer so the clearing merges too.
	 */
	setAnswer(key: ItemKey, update: (current: Answer | undefined) => Omit<Answer, 'at'>): void {
		const next = normaliseAnswer(key, { ...update(this.list.answers[key]), at: Date.now() });
		this.change({ ...this.list, answers: { ...this.list.answers, [key]: next } });
	}

	/** Replaces the list with what `update` makes of it: an import, applied by `applyImport`. */
	transform(update: (list: ListPayload) => ListPayload): void {
		const next = update(this.list);
		this.change({ ...next, answers: normaliseAnswers(next.answers) });
	}

	setTriage(categoryId: string, value: TriageValue): void {
		this.change({
			...this.list,
			triage: { ...this.list.triage, [categoryId]: { value, at: Date.now() } }
		});
	}

	/** Changes what the list shows: how intense, how common, and which side. */
	setFilters(change: Partial<Filters>): void {
		this.change({ ...this.list, settings: { ...this.list.settings, ...change, at: Date.now() } });
	}

	setSkipped(key: ItemKey, skipped: boolean): void {
		this.change({
			...this.list,
			skipped: { ...this.list.skipped, [key]: { skipped, at: Date.now() } }
		});
	}

	/** Adds a kink of the person's own to a category, and answers its key. */
	addCustom(kink: Omit<CustomKink, 'at' | 'removed'>): `custom:${string}` {
		const key = newCustomKey();
		this.change({
			...this.list,
			custom: { ...this.list.custom, [key]: { ...kink, at: Date.now() } }
		});
		return key;
	}

	removeCustom(key: `custom:${string}`): void {
		const current = this.list.custom[key];
		if (!current) {
			return;
		}
		this.change({
			...this.list,
			custom: { ...this.list.custom, [key]: { ...current, removed: true, at: Date.now() } }
		});
	}

	/** The custom kinks still in the list, for one category or all of them. */
	customKinks(categoryId?: string): [`custom:${string}`, CustomKink][] {
		return (Object.entries(this.list.custom) as [`custom:${string}`, CustomKink][]).filter(
			([, kink]) => !kink.removed && (categoryId === undefined || kink.categoryId === categoryId)
		);
	}
}
