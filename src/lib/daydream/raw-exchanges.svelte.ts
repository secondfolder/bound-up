/**
 * The exchanges behind the turns debug mode's raw log is drawing
 * (docs/debug-mode.md, "Daydreams' raw log"): loaded only while it is open,
 * a few turns at a time, since each can be most of a megabyte, and opened
 * here. What this visit kept itself (`DaydreamStory.writtenExchanges`) is
 * shown without asking.
 */

import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { openRecord } from '../crypto/sealed';
import { vaultById, vaultsSettled } from '../crypto/vaults.svelte';
import { daydreamExchangeKind } from '../sealed-kinds/daydreams';
import type { DaydreamExchangeView } from '../types';
import { readExchanges } from './client';
import { MAX_READ_EXCHANGE_TURNS } from './exchange';
import type { DaydreamStory, OpenedExchange } from './story.svelte';

export class RawExchanges {
	readonly #story: DaydreamStory;
	readonly #loaded = new SvelteMap<string, OpenedExchange>();
	/** Turns asked about, whether or not they had one. */
	readonly #asked = new SvelteSet<string>();
	/** Turns whose read is still out. */
	readonly #pending = new SvelteSet<string>();
	/** Why the last read failed, for the log to say. */
	problem: string | null = $state(null);
	#queue: Promise<void> = Promise.resolve();

	constructor(story: DaydreamStory) {
		this.#story = story;
	}

	/** Every exchange known, kept this visit or loaded. */
	get #all(): OpenedExchange[] {
		const byId = new Map<string, OpenedExchange>(this.#loaded);
		for (const [id, kept] of this.#story.writtenExchanges) {
			byId.set(id, kept);
		}
		return [...byId.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
	}

	/**
	 * The exchange that wrote `turnId`; undefined while it is still being
	 * asked for, null when none was kept (a passage written without the
	 * grant, or before exchanges were).
	 */
	forTurn(turnId: string): OpenedExchange | null | undefined {
		const found = this.#all.findLast((exchange) => exchange.turnId === turnId);
		if (found) {
			return found;
		}
		return this.#pending.has(turnId) || !this.#asked.has(turnId) ? undefined : null;
	}

	/** Requests that answered `parentTurnId` (null: an opening) and wrote nothing: failed or stopped. */
	failedAfter(parentTurnId: string | null): OpenedExchange[] {
		return this.#all.filter(
			(exchange) => exchange.turnId === null && exchange.parentTurnId === parentTurnId
		);
	}

	/** Asks about these turns, once each, a few at a time. */
	load(turnIds: readonly string[]): void {
		const fresh = turnIds.filter((id) => !this.#asked.has(id));
		for (const id of fresh) {
			this.#asked.add(id);
			this.#pending.add(id);
		}
		for (let start = 0; start < fresh.length; start += MAX_READ_EXCHANGE_TURNS) {
			const chunk = fresh.slice(start, start + MAX_READ_EXCHANGE_TURNS);
			this.#queue = this.#queue.then(() => this.#read(chunk));
		}
	}

	async #read(turnIds: string[]): Promise<void> {
		try {
			const result = await readExchanges(this.#story.id, turnIds);
			if (!result.ok) {
				this.problem = result.error;
				return;
			}
			await vaultsSettled();
			for (const view of result.exchanges) {
				this.#loaded.set(view.id, await opened(view));
			}
		} finally {
			for (const id of turnIds) {
				this.#pending.delete(id);
			}
		}
	}
}

async function opened(view: DaydreamExchangeView): Promise<OpenedExchange> {
	const vault = vaultById(view.sealed.vaultId);
	const content = vault ? await openRecord(daydreamExchangeKind, { ...view.sealed, vault }) : null;
	return {
		id: view.id,
		turnId: view.turnId,
		parentTurnId: view.parentTurnId,
		createdAt: view.createdAt,
		content,
		saved: true
	};
}
