/**
 * A person's own scene designer settings in the browser: opened from the
 * page's load, changed as they press Fewer, More and "Not for us", and saved
 * a moment later through `api/scenes/preferences`.
 *
 * BROWSER ONLY at run time: it seals with `crypto/sealed.ts`, and is only
 * opened after hydration, once the vaults are worked out.
 */

import { openRecordDiagnosed } from '../crypto/sealed';
import { selfVault, vaultById, vaultsSettled } from '../crypto/vaults.svelte';
import { describeRequestFailure, tryFetch } from '../request-failure.svelte';
import { sealForSubmit } from '../sealed-forms';
import { scenePreferencesKind } from '../sealed-kinds/scenes';
import type { SealedRefView } from '../types';
import { DEFAULT_SCENE_PREFERENCES, mergePreferences, type ScenePreferences } from './preferences';

export type ScenePreferencesData = { revision: number; sealed: SealedRefView } | null;

const SAVE_DELAY_MS = 600;
const MAX_SAVE_ATTEMPTS = 3;

async function open(sealed: SealedRefView) {
	await vaultsSettled();
	const vault = vaultById(sealed.vaultId) ?? selfVault();
	if (!vault) {
		return { ok: false, reason: 'no-vault' } as const;
	}
	return await openRecordDiagnosed(scenePreferencesKind, { ...sealed, vault });
}

export class ScenePreferencesStore {
	preferences = $state.raw<ScenePreferences>(DEFAULT_SCENE_PREFERENCES);
	/** Why the last save failed, for the column to say; null when all is well. */
	saveError = $state<string | null>(null);

	#id: string;
	#revision: number | null;
	readonly #view: ScenePreferencesData;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#saving: Promise<void> | null = null;

	constructor(view: ScenePreferencesData) {
		this.#view = view;
		if (view) {
			this.#id = view.sealed.recordId;
			this.#revision = view.revision;
		} else {
			this.#id = crypto.randomUUID();
			this.#revision = null;
		}
	}

	async open(): Promise<void> {
		if (!this.#view) {
			return;
		}
		const opened = await open(this.#view.sealed);
		if (opened.ok) {
			this.preferences = opened.value;
			return;
		}
		// Settings, not writing: falling back to the defaults loses nothing
		// anyone typed, and the next change saves over what would not open.
		const { ok: _ok, ...failure } = opened;
		console.error('[scenes] Your prompt settings could not be opened on this device', {
			revision: this.#view.revision,
			payloadVersion: this.#view.sealed.payloadVersion,
			...failure
		});
	}

	change(next: ScenePreferences): void {
		this.preferences = next;
		this.saveError = null;
		if (this.#timer) {
			clearTimeout(this.#timer);
		}
		this.#timer = setTimeout(() => {
			this.#timer = null;
			void this.flush();
		}, SAVE_DELAY_MS);
	}

	/** Saves now, after any save already under way. */
	async flush(): Promise<void> {
		if (this.#timer) {
			clearTimeout(this.#timer);
			this.#timer = null;
		}
		await this.#saving;
		this.#saving = this.#persist(this.preferences);
		await this.#saving;
		this.#saving = null;
	}

	async #persist(preferences: ScenePreferences): Promise<void> {
		let current = preferences;
		for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt += 1) {
			const sealed = await sealForSubmit(scenePreferencesKind, {
				scope: { kind: 'self' },
				recordId: this.#id,
				payload: current,
				describe: () => 'Your prompt settings could not be saved. Reload and try again.'
			});
			if (!sealed.ok) {
				this.saveError = sealed.error;
				return;
			}
			const response = await tryFetch('/api/scenes/preferences', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: this.#id,
					vaultId: sealed.fields.vaultId,
					ciphertext: sealed.fields.ciphertext,
					payloadVersion: Number(sealed.fields.payloadVersion),
					expectedRevision: this.#revision
				})
			});
			if (response?.ok) {
				const { revision } = (await response.json()) as { revision: number };
				this.#revision = revision;
				return;
			}
			if (response?.status !== 409) {
				this.saveError = describeRequestFailure(response);
				return;
			}
			// Another device saved first: merge into what it saved and go again.
			const latest = await this.#fetchLatest();
			if (!latest) {
				this.saveError = describeRequestFailure(null);
				return;
			}
			current = mergePreferences(latest.preferences, current);
			this.preferences = current;
		}
		this.saveError = 'Your prompt settings kept changing elsewhere. Try again.';
	}

	async #fetchLatest(): Promise<{ preferences: ScenePreferences } | null> {
		const response = await tryFetch('/api/scenes/preferences');
		if (!response?.ok) {
			return null;
		}
		const { preferences: view } = (await response.json()) as {
			preferences: ScenePreferencesData;
		};
		if (!view) {
			return null;
		}
		this.#id = view.sealed.recordId;
		this.#revision = view.revision;
		const opened = await open(view.sealed);
		// One that will not open is replaced rather than merged into.
		return { preferences: opened.ok ? opened.value : DEFAULT_SCENE_PREFERENCES };
	}

	destroy(): void {
		if (this.#timer) {
			clearTimeout(this.#timer);
			this.#timer = null;
			void this.#persist(this.preferences);
		}
	}
}
