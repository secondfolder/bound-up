/**
 * Talking to the Daydreams endpoints from the browser.
 *
 * BROWSER ONLY — it seals with `crypto/sealed.ts`, through `sealed-forms.ts`.
 *
 * Two kinds of request. Saving a turn seals it in the user's own vault first,
 * like every other thing a user writes. Asking for a reply is the exception
 * docs/daydreams.md is about: it sends the setup and the recent conversation
 * as text, because the model has to read them.
 */

import type { DaydreamSetup, DaydreamTurnRole } from '../daydream';
import { describeRequestFailure, SERVER_FAILURE, tryFetch } from '../request-failure.svelte';
import { sealForSubmit } from '../sealed-forms';
import { daydreamTurnKind } from '../sealed-kinds/daydreams';
import type { DaydreamTurnView } from '../types';
import type { ContextTurn } from './context';
import { readReplyStream } from './stream';

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

export type ReplyOutcome =
	| { ok: true; text: string }
	/** `partial` is what had arrived before it failed, for the page to leave on screen or drop. */
	| { ok: false; error: string; partial: string };

const INCOMPLETE = 'The reply stopped partway through. Try again.';
const EMPTY = 'The reply came back empty. Try again.';

/**
 * Asks for the character's next reply and streams it in through `onText`,
 * which is given the whole reply so far each time. Rejects only on an abort:
 * the user pressed Stop, and nothing needs saying.
 */
export async function writeReply(
	daydreamId: string,
	request: { mode: 'opening' | 'reply'; setup: DaydreamSetup; turns: ContextTurn[] },
	options: { signal: AbortSignal; onText: (soFar: string) => void }
): Promise<ReplyOutcome> {
	const response = await tryFetch(`/api/daydreams/${encodeURIComponent(daydreamId)}/reply`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
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
			options.onText(text);
		});
	} catch (problem) {
		if (problem instanceof DOMException && problem.name === 'AbortError') {
			throw problem;
		}
		// The connection dropped mid-reply.
		return { ok: false, error: INCOMPLETE, partial: text };
	}
	if (outcome.kind === 'error') {
		return { ok: false, error: INCOMPLETE, partial: text };
	}
	const finished = text.trim();
	return finished ? { ok: true, text: finished } : { ok: false, error: EMPTY, partial: '' };
}

export type SaveOutcome = { ok: true; turn: DaydreamTurnView } | { ok: false; error: string };

/** Seals a turn in the user's own vault, under a fresh id. */
async function sealTurn(recordId: string, text: string) {
	return await sealForSubmit(daydreamTurnKind, {
		scope: { kind: 'self' },
		recordId,
		payload: { text },
		describe: () => 'That is too long to keep. Try something shorter.'
	});
}

/**
 * Saves a new turn at the end of the conversation.
 *
 * `id` is the caller's, and kept across retries of the same turn, so a save
 * whose answer was lost cannot add the turn twice: the second is refused as
 * a taken id.
 */
export async function saveTurn(
	daydreamId: string,
	turn: { id: string; role: DaydreamTurnRole; text: string }
): Promise<SaveOutcome> {
	const sealed = await sealTurn(turn.id, turn.text);
	if (!sealed.ok) {
		return { ok: false, error: sealed.error };
	}
	const { vaultId, ciphertext, payloadVersion } = sealed.fields;
	const response = await tryFetch(`/api/daydreams/${encodeURIComponent(daydreamId)}/turns`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			id: turn.id,
			role: turn.role,
			vaultId,
			ciphertext,
			payloadVersion: Number(payloadVersion)
		})
	});
	if (!response?.ok) {
		return { ok: false, error: await describeFailure(response) };
	}
	const saved = (await response.json()) as { position: number; revision: number };
	return {
		ok: true,
		turn: {
			id: turn.id,
			role: turn.role,
			position: saved.position,
			revision: saved.revision,
			sealed: { recordId: turn.id, vaultId, ciphertext, payloadVersion: Number(payloadVersion) }
		}
	};
}

/** Replaces the newest character turn with a retried reply. */
export async function replaceTurn(
	daydreamId: string,
	turn: DaydreamTurnView,
	text: string
): Promise<SaveOutcome> {
	// Sealed to the turn's own id again: the id is part of what it is sealed to.
	const sealed = await sealTurn(turn.id, text);
	if (!sealed.ok) {
		return { ok: false, error: sealed.error };
	}
	const { vaultId, ciphertext, payloadVersion } = sealed.fields;
	const response = await tryFetch(`/api/daydreams/${encodeURIComponent(daydreamId)}/turns`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			turnId: turn.id,
			expectedRevision: turn.revision,
			vaultId,
			ciphertext,
			payloadVersion: Number(payloadVersion)
		})
	});
	if (!response?.ok) {
		return { ok: false, error: await describeFailure(response) };
	}
	const saved = (await response.json()) as { revision: number };
	return {
		ok: true,
		turn: {
			...turn,
			revision: saved.revision,
			sealed: { recordId: turn.id, vaultId, ciphertext, payloadVersion: Number(payloadVersion) }
		}
	};
}
