import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import {
	FORMAT_FILES,
	type PlaygroundEntry,
	playgroundProblem,
	playgroundRunSchema,
	playgroundTask
} from '$lib/image-playground';
import { runwareBaseUrl } from '$lib/server/daydream/image-config';
import { playgroundHistory, requirePlayground } from '$lib/server/image-playground';
import { providerCredential } from '$lib/server-settings';
import type { RequestHandler } from './$types';

/**
 * The picture playground's runs (docs/debug-mode.md, "Picture playground"):
 * POST draws one model's pictures for one run, GET lists the history, and
 * DELETE `?run=` forgets one comparison. The page sends one POST per model,
 * at once, so each column fills as its model finishes.
 */

/** What Runware answers, as far as this reads it. */
const runwareAnswerSchema = z.object({
	data: z
		.array(
			z.object({
				imageBase64Data: z.string().min(1),
				seed: z.number().optional(),
				cost: z.number().optional(),
				NSFWContent: z.boolean().optional()
			})
		)
		.min(1)
});

const runwareErrorSchema = z.object({
	errors: z.array(z.object({ message: z.string() })).min(1)
});

export const GET: RequestHandler = async ({ locals }) => {
	await requirePlayground(locals);
	const history = await playgroundHistory();
	return json({ kept: history !== null, entries: history ? await history.listEntries() : [] });
};

export const POST: RequestHandler = async ({ locals, platform, request }) => {
	await requirePlayground(locals);
	const parsed = playgroundRunSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, `Those settings could not be drawn: ${z.prettifyError(parsed.error)}`);
	}
	const run = parsed.data;
	const problem = playgroundProblem(run);
	if (problem) {
		error(422, problem);
	}
	const apiKey = providerCredential(locals.settings, 'runware');
	if (!apiKey) {
		return json(
			{ message: 'Save a Runware API key under Admin → Server settings → Model providers first.' },
			{ status: 409 }
		);
	}

	const id = crypto.randomUUID();
	const task = playgroundTask(run, id);
	const started = Date.now();
	let upstream: Response;
	try {
		upstream = await fetch(runwareBaseUrl(platform), {
			method: 'POST',
			headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
			body: JSON.stringify([task]),
			signal: request.signal
		});
	} catch {
		error(502, 'Runware could not be reached just now. Try again in a moment.');
	}
	const answer: unknown = await upstream.json().catch(() => null);
	const ms = Date.now() - started;
	if (!upstream.ok) {
		// An admin's own prompt, going back to them: Runware's reason is the
		// point of a tool for trying settings (a scheduler a model refuses, a
		// size it cannot draw). Not logged, since it can quote the prompt.
		const said = runwareErrorSchema.safeParse(answer);
		return json(
			{
				message: said.success
					? `Runware said: ${said.data.errors.map((each) => each.message).join(' ')}`
					: `Runware answered ${upstream.status}.`
			},
			{ status: 502 }
		);
	}
	const drawn = runwareAnswerSchema.safeParse(answer);
	if (!drawn.success) {
		return json({ message: 'Runware answered with no picture.' }, { status: 502 });
	}

	const { extension, contentType } = FORMAT_FILES[run.outputFormat];
	const pictures = drawn.data.data.map((picture) => ({
		// `atob` rather than `Buffer`, which Workers has only with Node compatibility.
		bytes: Uint8Array.from(atob(picture.imageBase64Data), (char) => char.charCodeAt(0)),
		base64: picture.imageBase64Data,
		extension,
		seed: picture.seed ?? null,
		cost: picture.cost ?? null,
		nsfw: picture.NSFWContent ?? null
	}));
	const entry = { id, runId: run.runId, at: new Date(started).toISOString(), run, task, ms };
	const history = await playgroundHistory();
	if (history) {
		return json(await history.saveEntry(entry, pictures));
	}
	// Nowhere to keep it: the pictures go back whole, and last as long as the page.
	return json({
		...entry,
		images: pictures.map((picture) => ({
			src: `data:${contentType};base64,${picture.base64}`,
			seed: picture.seed,
			cost: picture.cost,
			nsfw: picture.nsfw
		}))
	} satisfies PlaygroundEntry);
};

export const DELETE: RequestHandler = async ({ locals, url }) => {
	await requirePlayground(locals);
	const runId = z.uuid().safeParse(url.searchParams.get('run'));
	if (!runId.success) {
		error(400, 'Say which run to forget.');
	}
	await (await playgroundHistory())?.deleteRun(runId.data);
	return new Response(null, { status: 204 });
};
