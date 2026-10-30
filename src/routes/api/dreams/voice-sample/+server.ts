import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { speechBytes } from '$lib/dream/speech';
import { VOICE_SAMPLE } from '$lib/dream/voices';
import { isAdmin } from '$lib/server/admin';
import { fishVoiceFor, readVoiceConfig } from '$lib/server/daydream/voice-config';
import { hasAcceptedDisclosure } from '$lib/server/daydreams';
import { streamSpeech } from '$lib/server/dream/fish';
import { spendVoice } from '$lib/server/dream-voice';
import { userHasFeature } from '$lib/server/features';
import type { RequestHandler } from './$types';

/**
 * A voice saying one sample line (`VOICE_SAMPLE`), to hear it before
 * choosing it (docs/dreams.md, "Voices"): the narrator presets on Admin →
 * Server settings, and the voices for a daydream's narrator and people. For
 * an admin, or anyone who may read aloud; theirs counts against the day's
 * reading like any other. The whole clip, not a stream: it is a few seconds.
 */
const sampleRequestSchema = z.object({ voice: z.string().trim().min(1).max(40) });

/**
 * Each voice's sample once it has been made, by the Fish voice it is in:
 * the line never changes, so neither does what it sounds like, and trying
 * the same voice twice should not cost twice. A few dozen small clips at
 * most, one per voice, for as long as the process (or isolate) lives.
 */
const samples = new Map<string, Uint8Array<ArrayBuffer>>();

export const POST: RequestHandler = async ({ locals, platform, request }) => {
	const { user } = locals;
	if (!user) {
		error(401, 'Not signed in');
	}
	const admin = isAdmin(user);
	if (!(admin || (await userHasFeature(locals.db, user.id, 'dreamVoice')))) {
		error(404, 'Not found');
	}
	const parsed = sampleRequestSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That voice could not be played. Reload and try again.');
	}
	const config = readVoiceConfig(locals.settings, platform);
	if (!config) {
		error(
			503,
			'Reading aloud is not set up on this server. Add a key for the voice provider first.'
		);
	}
	const voice = fishVoiceFor(config, parsed.data.voice);
	if (!voice) {
		error(400, 'That voice is not one this server has. Reload and try again.');
	}
	const kept = samples.get(voice);
	if (kept) {
		return clip(kept);
	}
	if (!admin) {
		if (!(await hasAcceptedDisclosure(locals.db, user.id))) {
			error(409, 'Read and accept how Daydreams works first.');
		}
		const spent = await spendVoice(
			locals.db,
			user.id,
			speechBytes(VOICE_SAMPLE),
			config.dailyCap,
			new Date()
		);
		if (!spent.allowed) {
			return json(
				{ message: 'That is all the reading aloud for today. It starts again at midnight UTC.' },
				{ status: 429 }
			);
		}
	}
	const pieces: Uint8Array[] = [];
	try {
		await streamSpeech(
			{ baseUrl: config.baseUrl, apiKey: config.apiKey, text: VOICE_SAMPLE, voice },
			(chunk) => {
				if (chunk.audio) {
					pieces.push(Uint8Array.from(atob(chunk.audio), (char) => char.charCodeAt(0)));
				}
			}
		);
	} catch {
		error(502, 'The voice could not be reached just now. Try again in a moment.');
	}
	const whole = new Uint8Array(pieces.reduce((sum, piece) => sum + piece.length, 0));
	let at = 0;
	for (const piece of pieces) {
		whole.set(piece, at);
		at += piece.length;
	}
	samples.set(voice, whole);
	return clip(whole);
};

function clip(bytes: Uint8Array<ArrayBuffer>): Response {
	return new Response(bytes, { headers: { 'content-type': 'audio/mpeg' } });
}
