/**
 * Talking to the Daydreams endpoints from the browser.
 *
 * BROWSER ONLY — it seals with `crypto/sealed.ts`, through `sealed-forms.ts`.
 *
 * Two kinds of request. Saving anything — a turn, a mark, a setup, a library
 * character or scene — seals it in the user's own vault first, like every
 * other thing a user writes. Asking for a passage or a suggestion is the
 * exception docs/daydreams.md is about: it sends text the model has to read.
 */

import type { DaydreamSetup, DaydreamTurnRole } from '../daydream';
import { describeRequestFailure, SERVER_FAILURE, tryFetch } from '../request-failure.svelte';
import type { SealedKind } from '../sealed';
import { sealForSubmit } from '../sealed-forms';
import {
	type DaydreamMarkContent,
	type DaydreamTurnContent,
	type Direction,
	daydreamCharacterKind,
	daydreamMarkKind,
	daydreamSceneKind,
	daydreamSetupKind,
	daydreamTurnKind,
	type PassageMeta,
	type Reading
} from '../sealed-kinds/daydreams';
import type { DaydreamTurnView, SealedRefView } from '../types';
import type { ContextTurn } from './context';
import { parseReply, type ReplySoFar, visibleReply } from './reply-format';
import { readReplyStream } from './stream';

const base = (daydreamId: string) => `/api/daydreams/${encodeURIComponent(daydreamId)}`;
const JSON_HEADERS = { 'content-type': 'application/json' };

/** What a failed request says, in words for the page. */
async function describeFailure(response: Response | null): Promise<string> {
	if (!response) {
		return describeRequestFailure(null);
	}
	// SvelteKit's `error()` answers carry a `message`, and the endpoints word
	// theirs for a person — the 502 and 503 included. An unexpected 500's says
	// "Internal Error", which tells nobody anything.
	if (response.status === 500) {
		return SERVER_FAILURE;
	}
	const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
	return typeof body?.message === 'string' ? body.message : describeRequestFailure(response);
}

type Outcome<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// ── passages ─────────────────────────────────────────────────────────────────

export type ReplyRequestBody = {
	mode: 'opening' | 'reply' | 'rewrite';
	setup: DaydreamSetup;
	turns: ContextTurn[];
	currentDirections: Direction[];
	rewrite?: { targetText: string; quote?: string; instruction?: string };
};

export type ReplyOutcome =
	| {
			ok: true;
			passage: string;
			meta: PassageMeta | null;
			expansion: string | null;
			/** How the reply said, before anything else, it read the user's turn. */
			reading: Reading | null;
	  }
	/** `partial` is what had arrived before it failed, for the page to leave on screen or drop. */
	| { ok: false; error: string; partial: string };

const INCOMPLETE = 'The reply stopped partway through. Try again.';
const EMPTY = 'The reply came back empty. Try again.';

/**
 * Asks for the next passage and streams it in through `onText`, which is
 * given the reply so far each time: the user's turn written out, if the
 * model is writing one, and the passage — never any of the blocks' tags or
 * the metadata (`visibleReply`). Rejects only on an abort: the user pressed
 * Stop, and nothing needs saying.
 */
export async function writeReply(
	daydreamId: string,
	request: ReplyRequestBody,
	options: { signal: AbortSignal; onText: (soFar: ReplySoFar) => void }
): Promise<ReplyOutcome> {
	const response = await tryFetch(`${base(daydreamId)}/reply`, {
		method: 'POST',
		headers: JSON_HEADERS,
		body: JSON.stringify(request),
		signal: options.signal
	});
	if (!(response?.ok && response.body)) {
		return { ok: false, error: await describeFailure(response), partial: '' };
	}

	let text = '';
	let outcome: Awaited<ReturnType<typeof readReplyStream>>;
	try {
		outcome = await readReplyStream(response.body, (piece) => {
			text += piece;
			options.onText(visibleReply(text));
		});
	} catch (problem) {
		if (problem instanceof DOMException && problem.name === 'AbortError') {
			throw problem;
		}
		// The connection dropped mid-reply.
		return { ok: false, error: INCOMPLETE, partial: visibleReply(text).passage };
	}
	if (outcome.kind === 'error') {
		return { ok: false, error: INCOMPLETE, partial: visibleReply(text).passage };
	}
	const { passage, meta, expansion, reading } = parseReply(text);
	return passage
		? { ok: true, passage, meta, expansion, reading }
		: { ok: false, error: EMPTY, partial: '' };
}

// ── sealing ──────────────────────────────────────────────────────────────────

const TOO_LONG = 'That is too long to keep. Try something shorter.';

async function seal<Latest>(kind: SealedKind<Latest>, recordId: string, payload: unknown) {
	return await sealForSubmit(kind, {
		scope: { kind: 'self' },
		recordId,
		payload,
		describe: () => TOO_LONG
	});
}

function sealedRef(
	recordId: string,
	fields: { vaultId: string; ciphertext: string; payloadVersion: string }
): SealedRefView {
	return {
		recordId,
		vaultId: fields.vaultId,
		ciphertext: fields.ciphertext,
		payloadVersion: Number(fields.payloadVersion)
	};
}

/** The sealed fields as an endpoint takes them, with the version as a number. */
function sealedBody(fields: { vaultId: string; ciphertext: string; payloadVersion: string }) {
	return {
		vaultId: fields.vaultId,
		ciphertext: fields.ciphertext,
		payloadVersion: Number(fields.payloadVersion)
	};
}

async function send(
	url: string,
	method: string,
	body?: unknown
): Promise<Outcome<{ response: Response }>> {
	const response = await tryFetch(url, {
		method,
		...(body === undefined ? {} : { headers: JSON_HEADERS, body: JSON.stringify(body) })
	});
	if (!response?.ok) {
		return { ok: false, error: await describeFailure(response) };
	}
	return { ok: true, response };
}

// ── turns ────────────────────────────────────────────────────────────────────

/**
 * Seals a turn and saves it after `parentId` (null for a root).
 *
 * `id` is the caller's, and kept across retries of the same turn, so a save
 * whose answer was lost cannot add the turn twice: the second is refused as
 * a taken id.
 */
export async function saveTurn(
	daydreamId: string,
	turn: {
		id: string;
		parentId: string | null;
		role: DaydreamTurnRole;
		content: DaydreamTurnContent;
	}
): Promise<Outcome<{ turn: DaydreamTurnView }>> {
	const sealed = await seal(daydreamTurnKind, turn.id, turn.content);
	if (!sealed.ok) {
		return { ok: false, error: sealed.error };
	}
	const sent = await send(`${base(daydreamId)}/turns`, 'POST', {
		id: turn.id,
		parentId: turn.parentId,
		role: turn.role,
		...sealedBody(sealed.fields)
	});
	if (!sent.ok) {
		return sent;
	}
	const { position } = (await sent.response.json()) as { position: number };
	return {
		ok: true,
		turn: {
			id: turn.id,
			parentId: turn.parentId,
			role: turn.role,
			position,
			createdAt: new Date(),
			sealed: sealedRef(turn.id, sealed.fields)
		}
	};
}

/** Other branches' turns, sealed, by id: at most 100 at a time. */
export async function readTurns(
	daydreamId: string,
	ids: readonly string[]
): Promise<Outcome<{ turns: DaydreamTurnView[] }>> {
	const sent = await send(`${base(daydreamId)}/turns/read`, 'POST', { ids: ids.slice(0, 100) });
	if (!sent.ok) {
		return sent;
	}
	const { turns } = (await sent.response.json()) as {
		turns: (Omit<DaydreamTurnView, 'createdAt'> & { createdAt: string })[];
	};
	return {
		ok: true,
		turns: turns.map((turn) => ({ ...turn, createdAt: new Date(turn.createdAt) }))
	};
}

/** Records which turn the user is on, so the next visit opens there. */
export async function setActiveTurn(daydreamId: string, turnId: string): Promise<Outcome> {
	return await send(`${base(daydreamId)}/active`, 'PUT', { turnId });
}

// ── the setup, from the story page ───────────────────────────────────────────

/** Seals and saves the setup at the revision it was opened at, answering the new revision. */
export async function saveSetup(
	daydreamId: string,
	setup: DaydreamSetup,
	expectedRevision: number
): Promise<Outcome<{ revision: number }>> {
	const sealed = await seal(daydreamSetupKind, daydreamId, setup);
	if (!sealed.ok) {
		return { ok: false, error: sealed.error };
	}
	const sent = await send(`${base(daydreamId)}/setup`, 'PUT', {
		...sealedBody(sealed.fields),
		expectedRevision
	});
	if (!sent.ok) {
		return sent;
	}
	const { revision } = (await sent.response.json()) as { revision: number };
	return { ok: true, revision };
}

// ── marks ────────────────────────────────────────────────────────────────────

export async function createMark(
	daydreamId: string,
	mark: { id: string; turnId: string; content: DaydreamMarkContent }
): Promise<Outcome<{ sealed: SealedRefView }>> {
	const sealed = await seal(daydreamMarkKind, mark.id, mark.content);
	if (!sealed.ok) {
		return { ok: false, error: sealed.error };
	}
	const sent = await send(`${base(daydreamId)}/marks`, 'POST', {
		id: mark.id,
		turnId: mark.turnId,
		...sealedBody(sealed.fields)
	});
	return sent.ok ? { ok: true, sealed: sealedRef(mark.id, sealed.fields) } : sent;
}

export async function deleteMark(daydreamId: string, markId: string): Promise<Outcome> {
	return await send(`${base(daydreamId)}/marks?id=${encodeURIComponent(markId)}`, 'DELETE');
}

// ── the libraries ────────────────────────────────────────────────────────────

export type LibraryKind = 'characters' | 'scenes';

/**
 * Seals and saves a library character or scene: a new one when
 * `expectedRevision` is null, an edit otherwise. Answers the revision it now
 * has, which is what a daydream's copy records.
 */
export async function saveLibraryItem(
	kind: LibraryKind,
	item: { id: string; content: unknown; expectedRevision: number | null }
): Promise<Outcome<{ revision: number; sealed: SealedRefView }>> {
	const sealedKind = kind === 'characters' ? daydreamCharacterKind : daydreamSceneKind;
	const sealed = await seal(sealedKind as SealedKind<unknown>, item.id, item.content);
	if (!sealed.ok) {
		return { ok: false, error: sealed.error };
	}
	const sent =
		item.expectedRevision === null
			? await send(`/api/daydreams/${kind}`, 'POST', { id: item.id, ...sealedBody(sealed.fields) })
			: await send(`/api/daydreams/${kind}/${encodeURIComponent(item.id)}`, 'PUT', {
					...sealedBody(sealed.fields),
					expectedRevision: item.expectedRevision
				});
	if (!sent.ok) {
		return sent;
	}
	const { revision } = (await sent.response.json()) as { revision: number };
	return { ok: true, revision, sealed: sealedRef(item.id, sealed.fields) };
}

export async function deleteLibraryItem(kind: LibraryKind, id: string): Promise<Outcome> {
	return await send(`/api/daydreams/${kind}/${encodeURIComponent(id)}`, 'DELETE');
}

// ── suggestions ──────────────────────────────────────────────────────────────

/**
 * Asks the model for suggestions, answering the provider's response body
 * as-is for `suggestions.ts` to check. See `api/daydreams/suggest`.
 */
export async function requestSuggestion(body: unknown): Promise<Outcome<{ value: unknown }>> {
	const sent = await send('/api/daydreams/suggest', 'POST', body);
	if (!sent.ok) {
		return sent;
	}
	return { ok: true, value: await sent.response.json().catch(() => null) };
}
