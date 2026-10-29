import { error, json } from '@sveltejs/kit';
import { encodeEvent } from '$lib/dream/events';
import { speakRequestSchema } from '$lib/dream/requests';
import { speechBytes } from '$lib/dream/speech';
import { fishVoiceFor, readVoiceConfig } from '$lib/server/daydream/voice-config';
import { hasAcceptedDisclosure } from '$lib/server/daydreams';
import { FISH_MODEL, streamSpeech } from '$lib/server/dream/fish';
import { dreamsGuard } from '$lib/server/dream-api';
import { spendVoice } from '$lib/server/dream-voice';
import { requireFeature } from '$lib/server/features';
import { SSE_HEADERS } from '$lib/server/realtime';
import type { RequestHandler } from './$types';

/**
 * Reads one utterance aloud (docs/dreams.md, "Read aloud"), relayed from
 * Fish Audio as the engine's events: the clip in pieces, and the timings of
 * its words. The key stays on the server; nothing is stored but how much
 * was read today, which the daily cap counts.
 *
 * **Where the server handles what a user is reading in plaintext**, as the
 * other dream routes do: the browser sends the visible words, which this
 * forwards and never stores, logs or inspects.
 */
export const POST: RequestHandler = async ({ locals, platform, request }) => {
	const userId = await dreamsGuard(locals);
	await requireFeature(locals.db, userId, 'dreamVoice');
	const parsed = speakRequestSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be read aloud. Reload and try again.');
	}
	const config = readVoiceConfig(locals.settings, platform);
	if (!config) {
		error(503, 'Reading aloud is not set up on this server.');
	}
	const voice = fishVoiceFor(config, parsed.data.voice);
	if (!voice) {
		error(400, 'That voice is not one this server has. Reload and try again.');
	}
	if (!(await hasAcceptedDisclosure(locals.db, userId))) {
		error(409, 'Read and accept how Daydreams works first.');
	}
	const { text } = parsed.data;
	const spent = await spendVoice(locals.db, userId, speechBytes(text), config.dailyCap, new Date());
	if (!spent.allowed) {
		return json(
			{ message: 'That is all the reading aloud for today. It starts again at midnight UTC.' },
			{ status: 429 }
		);
	}

	const encoder = new TextEncoder();
	let cancelled = false;
	const body = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (event: Parameters<typeof encodeEvent>[0]) => {
				if (!cancelled) {
					controller.enqueue(encoder.encode(encodeEvent(event)));
				}
			};
			try {
				await streamSpeech(
					{
						baseUrl: config.baseUrl,
						apiKey: config.apiKey,
						text,
						voice,
						signal: request.signal
					},
					(chunk) => {
						send({ type: 'audio', data: chunk.audio });
						if (chunk.words) {
							send({ type: 'words', ...chunk.words });
						}
					}
				);
				send({ type: 'done', ended: 'complete', model: FISH_MODEL, provider: 'Fish Audio' });
			} catch {
				if (!(request.signal.aborted || cancelled)) {
					// Not the error: it could carry the text back.
					console.error('[dreams] reading aloud failed');
					send({
						type: 'failed',
						message: 'That could not be read aloud just now. Try again in a moment.'
					});
				}
			}
			if (!cancelled) {
				controller.close();
			}
		},
		cancel() {
			cancelled = true;
		}
	});
	return new Response(body, { headers: SSE_HEADERS });
};
