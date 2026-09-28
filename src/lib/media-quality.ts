/**
 * The quality tiers a message's media is sent at, and the pure rules around
 * them: what each tier encodes to, which files are left alone, and the resize
 * maths. The encoding itself is browser-only and lives in `src/lib/media/`.
 *
 * Alias-free and free of any browser API, so it runs in the node test project
 * and the server can share `attachmentBudget` with the client.
 *
 * See docs/messaging.md#transcoding.
 */

import { MAX_ATTACHMENT_TOTAL_BYTES, MAX_LOW_QUALITY_TOTAL_BYTES } from './messaging';

export const MEDIA_QUALITIES = ['low', 'high', 'original'] as const;

export type MediaQuality = (typeof MEDIA_QUALITIES)[number];

/** The tiers that re-encode. `original` is the file as picked, byte for byte. */
export type TranscodedQuality = Exclude<MediaQuality, 'original'>;

/**
 * What the composer's button says. SD and HD rather than Low and High: they are
 * the words people already use for video, and "Low" on every photo read like
 * a warning.
 */
export const MEDIA_QUALITY_LABELS: Record<MediaQuality, string> = {
	low: 'SD',
	high: 'HD',
	original: 'Original'
};

/** The button cycles SD → HD → Original → SD. */
export function nextQuality(quality: MediaQuality): MediaQuality {
	const index = MEDIA_QUALITIES.indexOf(quality);
	return MEDIA_QUALITIES[(index + 1) % MEDIA_QUALITIES.length] ?? 'low';
}

/**
 * Without `highQualityMedia` every file is SD and there is no button to change
 * it; the server's byte budget backs that up, because bytes are the only part
 * of quality the server can see.
 *
 * An account with `highQualityMedia` starts on high: it is what the feature is
 * for, and making its holders pick it on every send would make the feature
 * something they have to remember to use.
 */
export function defaultQuality(highQualityMedia: boolean): MediaQuality {
	return highQualityMedia ? 'high' : 'low';
}

/** The attachment bytes one message may carry, which the feature raises. */
export function attachmentBudget(highQualityMedia: boolean): number {
	return highQualityMedia ? MAX_ATTACHMENT_TOTAL_BYTES : MAX_LOW_QUALITY_TOTAL_BYTES;
}

export type TranscodeSettings = {
	image: {
		/** The longest edge, in pixels. Photos are framed either way up. */
		maxLongEdge: number;
		/** libavif's 0–100 quality. */
		quality: number;
	};
	video: {
		/**
		 * The shortest edge, in pixels — "720p" whichever way the phone was held.
		 * Capping the long edge instead would shrink a portrait clip to 405 px wide.
		 */
		maxShortEdge: number;
		/** Bits per second, per codec: VP9 matches H.264's picture at roughly two thirds the rate. */
		vp9Bitrate: number;
		avcBitrate: number;
		audioBitrate: number;
	};
};

/**
 * Sized against the budgets. Low's bitrates put about a minute of video under
 * `MAX_LOW_QUALITY_TOTAL_BYTES` (0.9 Mbps × 60 s ≈ 6.7 MB for VP9, ≈ 9.7 MB
 * for the H.264 fallback); high's put about 45 seconds under
 * `MAX_VIDEO_BYTES`.
 */
export const TRANSCODE_SETTINGS: Record<TranscodedQuality, TranscodeSettings> = {
	low: {
		image: { maxLongEdge: 1600, quality: 50 },
		video: { maxShortEdge: 720, vp9Bitrate: 800_000, avcBitrate: 1_200_000, audioBitrate: 96_000 }
	},
	high: {
		image: { maxLongEdge: 3200, quality: 70 },
		video: {
			maxShortEdge: 1080,
			vp9Bitrate: 2_500_000,
			avcBitrate: 4_000_000,
			audioBitrate: 128_000
		}
	}
};

export type Dimensions = { width: number; height: number };

/** Scales down, never up, so the longest edge is at most `maxLongEdge`. */
export function fitLongEdge(width: number, height: number, maxLongEdge: number): Dimensions {
	const scale = Math.min(1, maxLongEdge / Math.max(width, height));
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale))
	};
}

/**
 * Scales down, never up, so the shortest edge is at most `maxShortEdge`.
 *
 * Both edges come out even: H.264 and VP9 encoders subsample chroma 2×2 and
 * several refuse an odd dimension outright.
 */
export function fitShortEdge(width: number, height: number, maxShortEdge: number): Dimensions {
	const scale = Math.min(1, maxShortEdge / Math.min(width, height));
	const even = (value: number) => Math.max(2, Math.round((value * scale) / 2) * 2);
	return { width: even(width), height: even(height) };
}

/**
 * Formats every current browser shows, so an original in one of them is worth
 * keeping when it is already smaller than what re-encoding produced.
 * `video/mp4` is here even though an iPhone's HEVC MP4 does not play
 * everywhere: the container says nothing about the codec, and the re-encode
 * is only discarded when it failed to make the file smaller.
 */
const WEB_DISPLAYABLE = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/avif',
	'video/mp4',
	'video/webm'
]);

/**
 * Left exactly as picked, at every tier.
 *
 * A GIF (and so any animation) because decoding to a bitmap keeps only its
 * first frame, and SVG because it is not pixels to begin with.
 */
const PASS_THROUGH = new Set(['image/gif', 'image/svg+xml']);

export type TranscodeKind = 'image' | 'video' | 'keep';

/** What to do with a file of this type at this tier. */
export function transcodeKind(mimeType: string, quality: MediaQuality): TranscodeKind {
	if (quality === 'original' || PASS_THROUGH.has(mimeType)) {
		return 'keep';
	}
	if (mimeType.startsWith('image/')) {
		return 'image';
	}
	if (mimeType.startsWith('video/')) {
		return 'video';
	}
	return 'keep';
}

/**
 * Whether to send the original rather than the re-encode: only when the
 * re-encode came out no smaller and the original already displays everywhere.
 * A HEIC stays converted even when it grew, since the point of converting it
 * was that most browsers cannot show it at all.
 */
export function keepOriginal(original: { size: number; type: string }, encodedSize: number) {
	return encodedSize >= original.size && WEB_DISPLAYABLE.has(original.type);
}

/** `IMG_1234.HEIC` → `IMG_1234.avif`. A name without an extension gains one. */
export function withExtension(fileName: string, extension: string): string {
	const dot = fileName.lastIndexOf('.');
	const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
	return `${stem || 'file'}.${extension}`;
}
