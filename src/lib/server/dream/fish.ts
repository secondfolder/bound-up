/**
 * A minimal Fish Audio client for reading a daydream aloud (docs/dreams.md,
 * "Read aloud"): text to speech with word timings, streamed as Fish
 * streams it, over server-sent events from `/v1/tts/stream/with-timestamp`
 * (measured 2026-10-30: each event one base64 mp3 chunk, the text it
 * covers, and the latest timings for that chunk, `chunk_seq`).
 *
 * The S2 models read free words in square brackets as directions, which is
 * how the story model's delivery cues reach them. S2.1 Pro, like S2 Pro
 * before it, speaks adult text as written: measured 2026-10-30 by reading an
 * explicit line and transcribing the audio with Fish's own speech-to-text,
 * which gave it back word for word.
 *
 * Alias-free, like the rest of `server/dream`: it takes its key and base URL
 * as arguments.
 */

export const DEFAULT_FISH_BASE_URL = 'https://api.fish.audio';

/**
 * The model every request names: S2.1 Pro, Fish's newest and its default,
 * at the same price as S2 Pro. Chosen by ear 2026-10-30: S2 Pro at
 * `balanced` latency cut the last word of a clip short ("waiting" lost its
 * "-ing"), and a `[break]` after the text kept the word but ended each clip
 * with a sharp breath; S2.1 Pro at `balanced` kept every word whole.
 */
export const FISH_MODEL = 's2.1-pro';

export type SpeechRequest = {
	baseUrl: string;
	apiKey: string;
	text: string;
	/** The Fish voice (`reference_id`). */
	voice: string;
	signal?: AbortSignal;
};

type FishEvent = {
	audio_base64?: string;
	chunk_seq?: number;
	chunk_audio_offset_sec?: number;
	alignment?: { segments?: { text?: string; start?: number; end?: number }[] } | null;
};

export type SpeechChunk = {
	audio: string;
	/** Timings for chunk `seq`, from the clip's start; null while Fish has none yet. */
	words: { seq: number; words: { text: string; start: number; end: number }[] } | null;
};

const SSE_DATA = 'data:';

/**
 * Streams one clip. `onChunk` hears each piece as it arrives. Throws with
 * Fish's status on a refusal before any audio (401 a bad key, 402 no
 * credit), never with the text.
 */
/** What is sent to Fish Audio for a clip, without the key: debug mode shows it. */
export function speechBody(request: Pick<SpeechRequest, 'text' | 'voice'>) {
	return {
		text: request.text,
		reference_id: request.voice,
		format: 'mp3',
		mp3_bitrate: 64,
		// The first audio in about half a second, where `normal` takes about
		// 2.5 s, and with S2.1 Pro no worse to hear (`FISH_MODEL`).
		latency: 'balanced',
		normalize: true
	};
}

export async function streamSpeech(
	request: SpeechRequest,
	onChunk: (chunk: SpeechChunk) => void
): Promise<void> {
	const response = await fetch(`${request.baseUrl}/v1/tts/stream/with-timestamp`, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${request.apiKey}`,
			'content-type': 'application/json',
			model: FISH_MODEL
		},
		body: JSON.stringify(speechBody(request)),
		signal: request.signal
	});
	if (!(response.ok && response.body)) {
		await response.body?.cancel();
		throw new Error(`Fish Audio ${response.status}`);
	}
	const decoder = new TextDecoder();
	let buffer = '';
	for await (const bytes of response.body) {
		buffer += decoder.decode(bytes, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';
		for (const line of lines) {
			const chunk = parseLine(line.trim());
			if (chunk) {
				onChunk(chunk);
			}
		}
	}
	const last = parseLine(buffer.trim());
	if (last) {
		onChunk(last);
	}
}

function parseLine(line: string): SpeechChunk | null {
	if (!line.startsWith(SSE_DATA)) {
		return null;
	}
	let event: FishEvent;
	try {
		event = JSON.parse(line.slice(SSE_DATA.length).trim()) as FishEvent;
	} catch {
		return null;
	}
	if (typeof event.audio_base64 !== 'string') {
		return null;
	}
	const offset = event.chunk_audio_offset_sec ?? 0;
	const segments = event.alignment?.segments ?? null;
	return {
		audio: event.audio_base64,
		words: segments
			? {
					seq: event.chunk_seq ?? 0,
					words: segments.map((segment) => ({
						text: segment.text ?? '',
						start: (segment.start ?? 0) + offset,
						end: (segment.end ?? 0) + offset
					}))
				}
			: null
	};
}
