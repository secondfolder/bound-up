/**
 * Re-encodes one video through WebCodecs, by way of mediabunny.
 *
 * VP9 + Opus in WebM first: about a third smaller than H.264 for the same
 * picture, and it plays in every current browser, Safari included from iOS
 * 17.4. H.264 + AAC (or Opus) in MP4 is the fallback for a sender whose
 * browser cannot encode VP9. Not AV1, which Safari only decodes on recent
 * hardware — a video that will not play is worse than a larger one.
 *
 * Anything short of a clean conversion returns null and the original is sent
 * instead: no decoder for the input, no encoder for either pair, or an audio
 * track the conversion would have had to drop. Silently losing the sound is
 * not an acceptable way to save bytes.
 */

import {
	ALL_FORMATS,
	type AudioCodec,
	BlobSource,
	BufferTarget,
	Conversion,
	canEncodeAudio,
	canEncodeVideo,
	Input,
	Mp4OutputFormat,
	Output,
	Quality,
	type VideoCodec,
	WebMOutputFormat
} from 'mediabunny';
import { type Dimensions, fitShortEdge, type TranscodeSettings } from '../media-quality';

export type EncodedVideo = { blob: Blob; mimeType: string; extension: 'webm' | 'mp4' };

type Plan = {
	container: 'webm' | 'mp4';
	video: VideoCodec;
	videoBitrate: number;
	/** Null when the input has no sound to carry. */
	audio: AudioCodec | null;
};

async function firstEncodableAudio(codecs: AudioCodec[], bitrate: number) {
	for (const codec of codecs) {
		if (await canEncodeAudio(codec, { quality: new Quality({ bitrate }) })) {
			return codec;
		}
	}
	return null;
}

async function choosePlan(
	size: Dimensions,
	settings: TranscodeSettings['video'],
	hasAudio: boolean
): Promise<Plan | null> {
	const candidates: {
		container: Plan['container'];
		video: VideoCodec;
		bitrate: number;
		audio: AudioCodec[];
	}[] = [
		{ container: 'webm', video: 'vp9', bitrate: settings.vp9Bitrate, audio: ['opus'] },
		{ container: 'mp4', video: 'avc', bitrate: settings.avcBitrate, audio: ['aac', 'opus'] }
	];
	for (const candidate of candidates) {
		const videoOk = await canEncodeVideo(candidate.video, {
			...size,
			quality: new Quality({ bitrate: candidate.bitrate })
		});
		if (!videoOk) {
			continue;
		}
		const audio = hasAudio
			? await firstEncodableAudio(candidate.audio, settings.audioBitrate)
			: null;
		if (hasAudio && !audio) {
			continue;
		}
		return {
			container: candidate.container,
			video: candidate.video,
			videoBitrate: candidate.bitrate,
			audio
		};
	}
	return null;
}

export async function transcodeVideo(
	file: Blob,
	settings: TranscodeSettings['video'],
	{ onProgress, signal }: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}
): Promise<EncodedVideo | null> {
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	try {
		const track = await input.getPrimaryVideoTrack().catch(() => null);
		if (!(track && (await track.canDecode()))) {
			return null;
		}
		const audioTrack = await input.getPrimaryAudioTrack();
		// Display dimensions: after the rotation a phone records as metadata, so
		// "short edge" means the one that looks short.
		const size = fitShortEdge(
			await track.getDisplayWidth(),
			await track.getDisplayHeight(),
			settings.maxShortEdge
		);
		const plan = await choosePlan(size, settings, audioTrack !== null);
		if (!plan) {
			return null;
		}

		const target = new BufferTarget();
		const output = new Output({
			format: plan.container === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat(),
			target
		});
		const conversion = await Conversion.init({
			input,
			output,
			tracks: 'primary',
			video: {
				...size,
				fit: 'fill',
				codec: plan.video,
				quality: new Quality({ bitrate: plan.videoBitrate }),
				forceTranscode: true
			},
			audio: plan.audio
				? {
						codec: plan.audio,
						quality: new Quality({ bitrate: settings.audioBitrate })
					}
				: { discard: true },
			// No tags carried over: a phone writes where the clip was shot into
			// them, and re-encoding is the chance to leave that behind.
			tags: {},
			showWarnings: false
		});
		const droppedSound = conversion.discardedTracks.some(
			(discarded) => discarded.track.type === 'audio' && discarded.reason !== 'discarded_by_user'
		);
		if (!conversion.isValid || droppedSound) {
			return null;
		}
		if (onProgress) {
			conversion.onProgress = onProgress;
		}
		// Abandoned when the sender removes the file or picks another quality: a
		// phone encoding a clip nobody will send is only draining its battery.
		// `cancel` makes `execute` throw, which the caller treats as the abort.
		signal?.throwIfAborted();
		const cancel = () => void conversion.cancel();
		signal?.addEventListener('abort', cancel, { once: true });
		try {
			await conversion.execute();
		} finally {
			signal?.removeEventListener('abort', cancel);
		}
		signal?.throwIfAborted();

		const { buffer } = target;
		if (!buffer) {
			return null;
		}
		// The full type, codecs included, so a reader can ask its own browser
		// whether it will play before downloading ends in a black box.
		const mimeType = await output.getMimeType();
		return {
			blob: new Blob([buffer], { type: mimeType }),
			mimeType,
			extension: plan.container
		};
	} finally {
		input.dispose();
	}
}
