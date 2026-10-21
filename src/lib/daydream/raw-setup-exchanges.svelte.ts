/**
 * How a daydream was set up, for the top of debug mode's raw log
 * (docs/debug-mode.md, "Setup exchanges"): the suggestion requests that wrote
 * its draft, kept with the create. Read once, the first time the raw log
 * opens, and opened here.
 */

import { openRecord } from '../crypto/sealed';
import { vaultById, vaultsSettled } from '../crypto/vaults.svelte';
import {
	type DaydreamSetupExchangeContent,
	daydreamSetupExchangeKind
} from '../sealed-kinds/daydreams';
import { readSetupExchanges } from './client';

export type OpenedSetupExchange = {
	id: string;
	createdAt: Date;
	/** Null for one this device cannot open. */
	content: DaydreamSetupExchangeContent | null;
};

/** Every setup exchange the daydream keeps, opened, oldest first; or why they could not be read. */
export async function openSetupExchanges(
	daydreamId: string
): Promise<{ ok: true; exchanges: OpenedSetupExchange[] } | { ok: false; error: string }> {
	const result = await readSetupExchanges(daydreamId);
	if (!result.ok) {
		return result;
	}
	await vaultsSettled();
	const exchanges = await Promise.all(
		result.exchanges.map(async (view) => {
			const vault = vaultById(view.sealed.vaultId);
			return {
				id: view.id,
				createdAt: view.createdAt,
				content: vault
					? await openRecord(daydreamSetupExchangeKind, { ...view.sealed, vault })
					: null
			};
		})
	);
	return { ok: true, exchanges };
}

export class RawSetupExchanges {
	readonly #daydreamId: string;
	/** Undefined until they have been read. */
	exchanges: OpenedSetupExchange[] | undefined = $state(undefined);
	/** Why the read failed, for the log to say. */
	problem: string | null = $state(null);
	#read: Promise<void> | null = null;

	constructor(daydreamId: string) {
		this.#daydreamId = daydreamId;
	}

	/** Reads them, the first time only: they never change once the daydream is made. */
	load(): void {
		this.#read ??= openSetupExchanges(this.#daydreamId).then((result) => {
			if (result.ok) {
				this.exchanges = result.exchanges;
			} else {
				this.problem = result.error;
				this.exchanges = [];
			}
		});
	}
}
