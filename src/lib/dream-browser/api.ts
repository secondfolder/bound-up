/**
 * The new engine's requests, from the browser (docs/dreams.md): saving and
 * reading sealed records through `/api/dreams/…`, and asking the model
 * through its streaming endpoints.
 *
 * BROWSER ONLY: it seals and opens with `crypto/sealed.ts`, in the user's
 * own vault. Every failure is thrown as a `DreamRequestError` worded for
 * the person waiting, so the page can say it inline or in the app-wide
 * notice (AGENTS.md, "Every request the browser sends shows feedback").
 */

import { openRecord, sealRecord } from '$lib/crypto/sealed';
import { vaultById, vaultsSettled } from '$lib/crypto/vaults.svelte';
import { type DreamEvent, type Ended, readEvents } from '$lib/dream/events';
import type { BuildRequest, FillRequest, PassageRequest, ReadRequest } from '$lib/dream/requests';
import type {
	DreamListItemView,
	DreamPreferencesView,
	DreamTurnRole,
	DreamView
} from '$lib/dream/views';
import { NETWORK_FAILURE, SERVER_FAILURE, tryFetch } from '$lib/request-failure.svelte';
import type { SealedKind } from '$lib/sealed';
import { writableVault } from '$lib/sealed-forms';
import {
	type DreamDetail,
	type DreamPreferences,
	type DreamSetup,
	type DreamSummary,
	type DreamTurn,
	dreamDetailKind,
	dreamPreferencesKind,
	dreamSetupKind,
	dreamSummaryKind,
	dreamTurnKind
} from '$lib/sealed-kinds/dreams';
import type { SealedRefView } from '$lib/types';

export class DreamRequestError extends Error {
	readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.status = status;
	}
}

async function send(url: string, init?: RequestInit): Promise<Response> {
	const response = await tryFetch(url, init);
	if (!response) {
		throw new DreamRequestError(NETWORK_FAILURE, 0);
	}
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as { message?: string } | null;
		throw new DreamRequestError(body?.message ?? SERVER_FAILURE, response.status);
	}
	return response;
}

function sendJson(url: string, method: string, body: unknown): Promise<Response> {
	return send(url, {
		method,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

/** Seals a payload in the user's own vault, ready to post. */
async function seal<T>(kind: SealedKind<T>, recordId: string, payload: T) {
	const writable = await writableVault({ kind: 'self' });
	if (typeof writable === 'string') {
		throw new DreamRequestError(writable, 0);
	}
	const sealed = await sealRecord(kind, { recordId, payload, ...writable });
	return { vaultId: writable.vault.id, ...sealed };
}

/** How long to wait for the vaults to start opening before reading a record as unopenable. */
const VAULT_WAIT_MS = 15_000;

/**
 * The vault a record names, once vaults are worked out. A page's `onMount`
 * runs before the app shell's, which is what starts opening them, so on a
 * fresh load `vaultsSettled` can answer before anything has begun; this
 * waits for the vault to stop being unknown. Seen after a reload, where the
 * setup read as "can't be shown on this device".
 */
async function vaultFor(vaultId: string) {
	const until = Date.now() + VAULT_WAIT_MS;
	for (;;) {
		await vaultsSettled();
		const vault = vaultById(vaultId);
		if (vault !== undefined || Date.now() > until) {
			return vault ?? null;
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}

/** Opens a record, or null when it will not open on this device. */
export async function open<T>(kind: SealedKind<T>, ref: SealedRefView): Promise<T | null> {
	const vault = await vaultFor(ref.vaultId);
	return vault ? await openRecord(kind, { ...ref, vault }) : null;
}

export const openSetup = (ref: SealedRefView) => open(dreamSetupKind, ref);
export const openTurn = (ref: SealedRefView) => open(dreamTurnKind, ref);
export const openDetail = (ref: SealedRefView) => open(dreamDetailKind, ref);
export const openSummary = (ref: SealedRefView) => open(dreamSummaryKind, ref);

// ── storage ──────────────────────────────────────────────────────────────────

export async function createDream(id: string, setup: DreamSetup): Promise<void> {
	await sendJson('/api/dreams', 'POST', { id, setup: await seal(dreamSetupKind, id, setup) });
}

/** Saves the setup over `revision`, and answers the new one. */
export async function saveSetup(id: string, setup: DreamSetup, revision: number): Promise<number> {
	const response = await sendJson(`/api/dreams/${id}`, 'PUT', {
		setup: await seal(dreamSetupKind, id, setup),
		expectedRevision: revision
	});
	return ((await response.json()) as { revision: number }).revision;
}

export async function deleteDream(id: string): Promise<void> {
	await send(`/api/dreams/${id}`, { method: 'DELETE' });
}

export async function readDream(id: string): Promise<DreamView> {
	return (await (await send(`/api/dreams/${id}`)).json()) as DreamView;
}

export async function appendTurn(
	dreamId: string,
	turn: { id: string; parentId: string | null; role: DreamTurnRole; content: DreamTurn }
): Promise<void> {
	await sendJson(`/api/dreams/${dreamId}/turns`, 'POST', {
		id: turn.id,
		parentId: turn.parentId,
		role: turn.role,
		content: await seal(dreamTurnKind, turn.id, turn.content)
	});
}

export async function setActiveTurn(dreamId: string, turnId: string): Promise<void> {
	await sendJson(`/api/dreams/${dreamId}/active`, 'PUT', { turnId });
}

export async function readBranch(
	dreamId: string,
	turnId: string
): Promise<Pick<DreamView, 'path' | 'details' | 'summaries'>> {
	const response = await send(`/api/dreams/${dreamId}/branch?turn=${encodeURIComponent(turnId)}`);
	return (await response.json()) as Pick<DreamView, 'path' | 'details' | 'summaries'>;
}

export async function saveDetail(
	dreamId: string,
	note: { id: string; turnId: string; detail: DreamDetail }
): Promise<void> {
	await sendJson(`/api/dreams/${dreamId}/notes`, 'POST', {
		kind: 'detail',
		id: note.id,
		turnId: note.turnId,
		content: await seal(dreamDetailKind, note.id, note.detail)
	});
}

export async function saveSummary(
	dreamId: string,
	note: { id: string; turnId: string; summary: DreamSummary }
): Promise<void> {
	await sendJson(`/api/dreams/${dreamId}/notes`, 'POST', {
		kind: 'summary',
		id: note.id,
		turnId: note.turnId,
		content: await seal(dreamSummaryKind, note.id, note.summary)
	});
}

export async function readPreferences(): Promise<{
	revision: number | null;
	preferences: DreamPreferences;
}> {
	const response = await send('/api/dreams/preferences');
	const { preferences } = (await response.json()) as { preferences: DreamPreferencesView };
	if (!preferences) {
		return { revision: null, preferences: { preferences: [] } };
	}
	const opened = await open(dreamPreferencesKind, preferences.sealed);
	return { revision: preferences.revision, preferences: opened ?? { preferences: [] } };
}

/** Saves the user's preferences; `revision` null creates them. Answers the new revision. */
export async function savePreferences(
	userId: string,
	preferences: DreamPreferences,
	revision: number | null
): Promise<number> {
	const response = await sendJson('/api/dreams/preferences', 'PUT', {
		content: await seal(dreamPreferencesKind, userId, preferences),
		expectedRevision: revision
	});
	return ((await response.json()) as { revision: number }).revision;
}

export async function acceptDisclosure(): Promise<void> {
	await send('/api/dreams/disclosure', { method: 'POST' });
}

// ── the model ────────────────────────────────────────────────────────────────

export type StreamResult = {
	text: string;
	ended: Ended;
	model: string;
	provider: string;
};

type StreamPaths = { read: ReadRequest; build: BuildRequest; passage: PassageRequest };

/**
 * Asks for a streamed reply. `onText` gets the reply so far each time it
 * grows; a `restart` (refused, so another provider is writing it) starts it
 * again from nothing. Resolves with how it ended; a stream that fails part
 * way resolves `failed` with the words that came, and one that fails before
 * any throws.
 */
export async function streamReply<Path extends keyof StreamPaths>(
	path: Path,
	body: StreamPaths[Path],
	options: {
		signal?: AbortSignal;
		onText?: (text: string) => void;
		/** A page read for the brief, as it is read. */
		onFetch?: (fetched: { url: string; ok: boolean; allowed: boolean }) => void;
	} = {}
): Promise<StreamResult> {
	const response = await send(`/api/dreams/${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
		signal: options.signal
	});
	if (!response.body) {
		throw new DreamRequestError(SERVER_FAILURE, response.status);
	}
	let text = '';
	let last: DreamEvent | null = null;
	try {
		for await (const event of readEvents(response.body)) {
			last = event;
			if (event.type === 'text') {
				text += event.text;
				options.onText?.(text);
			} else if (event.type === 'fetch') {
				options.onFetch?.(event);
			} else if (event.type === 'restart') {
				text = '';
				options.onText?.(text);
			}
		}
	} catch (cause) {
		if (options.signal?.aborted) {
			throw cause;
		}
		last = { type: 'failed', message: NETWORK_FAILURE };
	}
	if (last?.type === 'done') {
		return { text, ended: last.ended, model: last.model, provider: last.provider };
	}
	if (text) {
		return { text, ended: 'failed', model: '', provider: '' };
	}
	throw new DreamRequestError(last?.type === 'failed' ? last.message : SERVER_FAILURE, 502);
}

async function askWhole(path: string, body: unknown, signal?: AbortSignal): Promise<string> {
	const response = await send(path, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
		signal
	});
	return ((await response.json()) as { text: string }).text;
}

/** One of the small calls: the model's whole reply. */
export function fill(body: FillRequest, signal?: AbortSignal): Promise<string> {
	return askWhole('/api/dreams/fill', body, signal);
}

/** Where the story could go next, as `<direction>` tags with likelihoods. */
export function listDirections(body: PassageRequest, signal?: AbortSignal): Promise<string> {
	return askWhole('/api/dreams/directions', body, signal);
}

export async function listDreams(): Promise<DreamListItemView[]> {
	const response = await send('/api/dreams');
	return ((await response.json()) as { dreams: DreamListItemView[] }).dreams;
}

/** Real names drawn for a character's description (`drawNames`). */
export async function drawNames(
	description: string,
	exclude: readonly string[]
): Promise<{ background: string | null; given: string[]; family: string[] }> {
	const response = await sendJson('/api/dreams/names', 'POST', { description, exclude });
	return (await response.json()) as {
		background: string | null;
		given: string[];
		family: string[];
	};
}
