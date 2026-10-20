/**
 * Talking to the Daydreams endpoints from the browser.
 *
 * BROWSER ONLY — it seals with `crypto/sealed.ts`, through `sealed-forms.ts`.
 *
 * Two kinds of request. Saving anything — a turn, a mark, a setup, a library
 * character or idea — seals it in the user's own vault first, like every
 * other thing a user writes. Asking for a passage or a suggestion is the
 * exception docs/daydreams.md is about: it sends text the model has to read.
 */

import { z } from 'zod';
import type { DaydreamSetup, DaydreamTurnRole, DialValue, PictureStyle } from '../daydream';
import { describeRequestFailure, SERVER_FAILURE, tryFetch } from '../request-failure.svelte';
import type { SealedKind } from '../sealed';
import { sealForSubmit } from '../sealed-forms';
import {
	type DaydreamMarkContent,
	type DaydreamTurnContent,
	type Direction,
	daydreamCharacterKind,
	daydreamIdeaKind,
	daydreamMarkKind,
	daydreamSetupKind,
	daydreamTurnKind,
	type PassageMeta,
	type Reading
} from '../sealed-kinds/daydreams';
import type { DaydreamTurnView, SealedRefView } from '../types';
import type { ContextTurn } from './context';
import { PICTURE_REQUEST_HEADER, type PictureRequest } from './image-prompt';
import { parseReply, type ReplySoFar, visibleReply } from './reply-format';
import { readSent, type SentRecord } from './sent-record';
import { readReplyStream } from './stream';

const base = (daydreamId: string) => `/api/daydreams/${encodeURIComponent(daydreamId)}`;
const JSON_HEADERS = { 'content-type': 'application/json' };

/** What a failed request says, in words for the page. */
async function describeFailure(response: Response | null): Promise<string> {
	return (await readFailure(response)).error;
}

/**
 * Why a request failed, in words for a person, and any `detail` the endpoint
 * added for an account holding debug mode (the suggest endpoint's provider
 * failures; docs/debug-mode.md).
 */
async function readFailure(response: Response | null): Promise<{ error: string; detail?: string }> {
	if (!response) {
		return { error: describeRequestFailure(null) };
	}
	// SvelteKit's `error()` answers carry a `message`, and the endpoints word
	// theirs for a person — the 502 and 503 included. An unexpected 500's says
	// "Internal Error", which tells nobody anything.
	if (response.status === 500) {
		return { error: SERVER_FAILURE };
	}
	const body = (await response.json().catch(() => null)) as {
		message?: unknown;
		detail?: unknown;
	} | null;
	return {
		error: typeof body?.message === 'string' ? body.message : describeRequestFailure(response),
		...(typeof body?.detail === 'string' ? { detail: body.detail } : {})
	};
}

type Outcome<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// ── passages ─────────────────────────────────────────────────────────────────

export type ReplyRequestBody = {
	mode: 'opening' | 'reply' | 'rewrite';
	setup: DaydreamSetup;
	turns: ContextTurn[];
	currentDirections: Direction[];
	rewrite?: { targetText: string; quote?: string; instruction?: string };
	/** Debug mode: have the endpoint say what it sent the model (`sent-record.ts`). */
	record?: boolean;
};

export type ReplyOutcome =
	| {
			ok: true;
			passage: string;
			meta: PassageMeta | null;
			expansion: string | null;
			/** How the reply said, before anything else, it read the user's turn. */
			reading: Reading | null;
			/** The reply exactly as it arrived, for debug mode's raw log. */
			raw: string;
	  }
	/** `partial` is what had arrived before it failed, for the page to leave on screen or drop. */
	| { ok: false; error: string; partial: string; raw: string };

const INCOMPLETE = 'The reply stopped partway through. Try again.';
const EMPTY = 'The reply came back empty. Try again.';

/** One message as the model reads it, as `server/daydream/prompt.ts` builds it. */
export type PromptMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * What the model would be sent for `request`, rebuilt by the server without
 * sending it: debug mode's "Show prompt". See `api/daydreams/[id]/prompt`.
 */
export async function readPrompt(
	daydreamId: string,
	request: ReplyRequestBody
): Promise<Outcome<{ messages: PromptMessage[] }>> {
	const sent = await send(`${base(daydreamId)}/prompt`, 'POST', request);
	if (!sent.ok) {
		return sent;
	}
	const { messages } = (await sent.response.json()) as { messages: PromptMessage[] };
	return { ok: true, messages };
}

/**
 * Asks for the next passage and streams it in through `onText`, which is
 * given the reply so far each time: the user's turn written out, if the
 * model is writing one, and the passage — never any of the blocks' tags or
 * the metadata (`visibleReply`) — and, second, the reply exactly as it has
 * arrived, for debug mode's raw log. Rejects only on an abort: the user
 * pressed Stop, and nothing needs saying.
 */
export async function writeReply(
	daydreamId: string,
	request: ReplyRequestBody,
	options: {
		signal: AbortSignal;
		onText: (soFar: ReplySoFar, raw: string) => void;
		/** Given what the endpoint sent the model, before the reply, when `record` asked for it. */
		onSent?: (record: SentRecord) => void;
		/** Given every event from the provider, for debug mode's raw log (`ReplyReceipt`). */
		onEvent?: (event: unknown) => void;
	}
): Promise<ReplyOutcome> {
	const response = await tryFetch(`${base(daydreamId)}/reply`, {
		method: 'POST',
		headers: JSON_HEADERS,
		body: JSON.stringify(request),
		signal: options.signal
	});
	if (!(response?.ok && response.body)) {
		return { ok: false, error: await describeFailure(response), partial: '', raw: '' };
	}

	let text = '';
	let outcome: Awaited<ReturnType<typeof readReplyStream>>;
	try {
		outcome = await readReplyStream(
			response.body,
			(piece) => {
				text += piece;
				options.onText(visibleReply(text), text);
			},
			(value) => {
				const record = readSent(value);
				if (record) {
					options.onSent?.(record);
				}
			},
			options.onEvent
		);
	} catch (problem) {
		if (problem instanceof DOMException && problem.name === 'AbortError') {
			throw problem;
		}
		// The connection dropped mid-reply.
		return { ok: false, error: INCOMPLETE, partial: visibleReply(text).passage, raw: text };
	}
	if (outcome.kind === 'error') {
		return { ok: false, error: INCOMPLETE, partial: visibleReply(text).passage, raw: text };
	}
	const { passage, meta, expansion, reading } = parseReply(text);
	return passage
		? { ok: true, passage, meta, expansion, reading, raw: text }
		: { ok: false, error: EMPTY, partial: '', raw: text };
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

// ── pictures ─────────────────────────────────────────────────────────────────

/** Why a picture could not be made: refused for what it showed, or any other failure. */
export type PictureFailure = { ok: false; refused: boolean; error: string };

/**
 * Asks for a passage's picture (docs/daydreams.md, "Pictures"): the
 * description the model wrote, and the daydream's style and heat. Answers
 * the picture itself, in the clear, for the page to show and then encrypt.
 */
export async function requestPicture(
	daydreamId: string,
	request: { prompt: string; style: PictureStyle; heat: DialValue | null },
	signal?: AbortSignal
): Promise<{ ok: true; picture: Blob; sent: PictureRequest | null } | PictureFailure> {
	const response = await tryFetch(`${base(daydreamId)}/image`, {
		method: 'POST',
		headers: JSON_HEADERS,
		body: JSON.stringify(request),
		...(signal ? { signal } : {})
	});
	if (!response?.ok) {
		return { ok: false, refused: response?.status === 422, error: await describeFailure(response) };
	}
	return {
		ok: true,
		picture: await response.blob(),
		sent: readPictureRequest(response.headers.get(PICTURE_REQUEST_HEADER))
	};
}

const estimateSchema = z.object({ estimateMs: z.number().positive().nullable() });

/**
 * How long a picture in this style usually takes on this server, or null if
 * none has been made or the answer did not come. Silent when it fails: the
 * ring falls back to a guess, and the picture itself is unaffected.
 */
export async function estimatePicture(
	daydreamId: string,
	style: PictureStyle
): Promise<number | null> {
	const response = await tryFetch(`${base(daydreamId)}/image?style=${encodeURIComponent(style)}`);
	if (!response?.ok) {
		return null;
	}
	const parsed = estimateSchema.safeParse(await response.json().catch(() => null));
	return parsed.success ? parsed.data.estimateMs : null;
}

const pictureRequestSchema = z.object({
	model: z.string(),
	positivePrompt: z.string(),
	negativePrompt: z.string()
});

/** What the picture endpoint says the image model was asked, if it says it in a form this reads. */
function readPictureRequest(header: string | null): PictureRequest | null {
	if (!header) {
		return null;
	}
	try {
		const parsed = pictureRequestSchema.safeParse(JSON.parse(decodeURIComponent(header)));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

/** Stores a picture, already encrypted, under the id the page chose for it. */
export async function uploadPicture(
	daydreamId: string,
	imageId: string,
	ciphertext: Blob
): Promise<Outcome> {
	const response = await tryFetch(`${base(daydreamId)}/images/${imageId}`, {
		method: 'PUT',
		headers: { 'content-type': 'application/octet-stream' },
		body: ciphertext
	});
	return response?.ok ? { ok: true } : { ok: false, error: await describeFailure(response) };
}

/** A stored picture, still encrypted. */
export async function downloadPicture(
	daydreamId: string,
	imageId: string
): Promise<Outcome<{ ciphertext: ArrayBuffer }>> {
	const response = await tryFetch(`${base(daydreamId)}/images/${imageId}`);
	if (!response?.ok) {
		return { ok: false, error: await describeFailure(response) };
	}
	return { ok: true, ciphertext: await response.arrayBuffer() };
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

export type LibraryKind = 'characters' | 'ideas';

/**
 * Seals and saves a library character or idea: a new one when
 * `expectedRevision` is null, an edit otherwise. Answers the revision it now
 * has, which is what a daydream's copy records.
 */
export async function saveLibraryItem(
	kind: LibraryKind,
	item: { id: string; content: unknown; expectedRevision: number | null }
): Promise<Outcome<{ revision: number; sealed: SealedRefView }>> {
	const sealedKind = kind === 'characters' ? daydreamCharacterKind : daydreamIdeaKind;
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
export async function requestSuggestion(
	body: unknown
): Promise<{ ok: true; value: unknown } | { ok: false; error: string; detail?: string }> {
	const response = await tryFetch('/api/daydreams/suggest', {
		method: 'POST',
		headers: JSON_HEADERS,
		body: JSON.stringify(body)
	});
	if (!response?.ok) {
		return { ok: false, ...(await readFailure(response)) };
	}
	return { ok: true, value: await response.json().catch(() => null) };
}
