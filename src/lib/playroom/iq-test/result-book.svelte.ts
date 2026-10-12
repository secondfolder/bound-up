import { resolve } from '$app/paths';
import { reportRequestFailure, tryFetch } from '$lib/request-failure.svelte';
import type { IqTestResultView } from '$lib/types';
import {
	addToDeviceHistory,
	clearDeviceHistory,
	deviceHistory,
	removeFromDeviceHistory,
	setDeviceShareToken
} from './device';

/** Where a finished result is with being kept: not yet, under way, done, or failed. */
export type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

/**
 * A taker's past results, and keeping a new one: to the account when signed
 * in, and otherwise on the device, with a signed link of its own so it can
 * still be shared (see `iq-test-share.ts`). Either way the result then has a
 * page of its own, which `record` and `retry` answer with: the account row's
 * id, or the device result's token.
 */
export class ResultBook {
	results = $state<IqTestResultView[]>([]);
	saveState = $state<SaveState>('idle');
	/** The result being deleted from the account, while the request is out. */
	deleting = $state<string | null>(null);
	/** A result not yet saved or linked, kept for the retry. */
	#unsaved: { result: IqTestResultView; seed: number } | null = null;
	readonly #signedIn: () => boolean;

	/** `signedIn` is asked each time, rather than read once, as the page's own may change. */
	constructor(signedIn: () => boolean, results: IqTestResultView[]) {
		this.#signedIn = signedIn;
		this.results = results;
	}

	/** On the device's own history, for a signed-out visitor: read once storage can be. */
	readDevice() {
		if (!this.#signedIn()) {
			this.results = deviceHistory();
		}
	}

	/** Whether a signed-out result opened by its token is this device's own. */
	kept(shareToken: string): boolean {
		return this.results.some((entry) => entry.shareToken === shareToken);
	}

	/** Keep a finished result. Answers with the id its page is at, or null if it failed. */
	record(result: IqTestResultView, seed: number): Promise<string | null> {
		if (!this.#signedIn()) {
			this.results = addToDeviceHistory(result);
		}
		return this.#keep(result, seed);
	}

	/** Try again to keep the result that failed last. */
	retry(): Promise<string | null> {
		if (!this.#unsaved) {
			return Promise.resolve(null);
		}
		const { result, seed } = this.#unsaved;
		return this.#keep(result, seed);
	}

	/** Back to nothing to keep: a new run, or a result from someone else's link. */
	reset() {
		this.saveState = 'idle';
	}

	#keep(result: IqTestResultView, seed: number): Promise<string | null> {
		return this.#signedIn()
			? this.#saveToAccount(result, seed)
			: this.#linkFromDevice(result, seed);
	}

	async #saveToAccount(result: IqTestResultView, seed: number): Promise<string | null> {
		this.#unsaved = { result, seed };
		this.saveState = 'saving';
		const response = await tryFetch('/api/playroom/iq-test/results', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: bodyOf(result, seed)
		});
		if (!response?.ok) {
			this.saveState = 'failed';
			return null;
		}
		const saved = (await response.json()) as Omit<IqTestResultView, 'createdAt'> & {
			createdAt: string;
		};
		this.results = [{ ...saved, createdAt: new Date(saved.createdAt) }, ...this.results];
		this.#unsaved = null;
		this.saveState = 'saved';
		return saved.id;
	}

	async #linkFromDevice(result: IqTestResultView, seed: number): Promise<string | null> {
		this.#unsaved = { result, seed };
		this.saveState = 'saving';
		const response = await tryFetch('/api/playroom/iq-test/results/share', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: bodyOf(result, seed)
		});
		if (!response?.ok) {
			this.saveState = 'failed';
			return null;
		}
		const { token } = (await response.json()) as { token: string };
		this.results = setDeviceShareToken(result.id, token);
		this.#unsaved = null;
		this.saveState = 'saved';
		return token;
	}

	async remove(result: IqTestResultView) {
		if (!this.#signedIn()) {
			this.results = removeFromDeviceHistory(result.id);
			return;
		}
		this.deleting = result.id;
		const response = await tryFetch(`/api/playroom/iq-test/results/${result.id}`, {
			method: 'DELETE'
		});
		this.deleting = null;
		if (response?.ok) {
			this.results = this.results.filter((entry) => entry.id !== result.id);
		} else {
			reportRequestFailure(response, "Couldn't delete that result. Please try again.");
		}
	}

	/** Clear the device's history: signed out only, as an account's are deleted one by one. */
	clear() {
		clearDeviceHistory();
		this.results = [];
	}

	/** Where a past result's own page is: an account's by id, a device's by its token. */
	hrefFor = (result: IqTestResultView): string | null => {
		const id = this.#signedIn() ? result.id : result.shareToken;
		return id ? resolve('/(standalone)/playroom/iq-test/[[id]]', { id }) : null;
	};
}

/** What is posted for a result: everything but what the server or the link gives it. */
function bodyOf(result: IqTestResultView, seed: number): string {
	const { id: _id, createdAt: _createdAt, shareToken: _shareToken, ...rest } = result;
	return JSON.stringify({ ...rest, seed });
}
