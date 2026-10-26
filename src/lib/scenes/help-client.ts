/**
 * Asking the model for help with a scene, from the browser. Only ever called
 * from a button someone pressed. See docs/scenes.md, "Help from the model".
 */

import { describeRequestFailure, tryFetch } from '../request-failure.svelte';
import { parseHelpAnswer, type SceneHelpAnswer, type SceneHelpRequest } from './model-help';

export type HelpResult = { ok: true; answer: SceneHelpAnswer } | { ok: false; error: string };

export async function askForHelp(request: SceneHelpRequest): Promise<HelpResult> {
	const response = await tryFetch('/api/scenes/help', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(request)
	});
	if (!response?.ok) {
		const message = await response
			?.json()
			.then((body: { message?: unknown }) =>
				typeof body.message === 'string' ? body.message : null
			)
			.catch(() => null);
		return { ok: false, error: message ?? describeRequestFailure(response) };
	}
	// Checked again here, against the same shapes: the browser trusts its own
	// reading of an answer, not the server's word that it fits.
	const answer = parseHelpAnswer(request.task, await response.text());
	return answer
		? { ok: true, answer }
		: { ok: false, error: 'The model’s answer didn’t make sense. Try again.' };
}

/** Agreeing to what help from the model sends. */
export async function acceptHelp(): Promise<boolean> {
	const response = await tryFetch('/api/scenes/help/consent', { method: 'POST' });
	return response?.ok === true;
}
