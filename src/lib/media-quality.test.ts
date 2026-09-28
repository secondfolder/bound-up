import { describe, expect, it } from 'vitest';
import {
	attachmentBudget,
	defaultQuality,
	fitLongEdge,
	fitShortEdge,
	keepOriginal,
	nextQuality,
	TRANSCODE_SETTINGS,
	transcodeKind,
	withExtension
} from './media-quality';
import {
	MAX_ATTACHMENT_TOTAL_BYTES,
	MAX_LOW_QUALITY_TOTAL_BYTES,
	MAX_VIDEO_BYTES
} from './messaging';

describe('which quality a send uses', () => {
	it('starts a feature holder on high and everyone else on low', () => {
		expect(defaultQuality(true)).toBe('high');
		expect(defaultQuality(false)).toBe('low');
	});

	it('cycles SD → HD → Original → SD', () => {
		expect(nextQuality('low')).toBe('high');
		expect(nextQuality('high')).toBe('original');
		expect(nextQuality('original')).toBe('low');
	});
});

describe('attachmentBudget', () => {
	it('is the low-quality budget without the feature and the full one with it', () => {
		expect(attachmentBudget(false)).toBe(MAX_LOW_QUALITY_TOTAL_BYTES);
		expect(attachmentBudget(true)).toBe(MAX_ATTACHMENT_TOTAL_BYTES);
		expect(MAX_LOW_QUALITY_TOTAL_BYTES).toBeLessThan(MAX_ATTACHMENT_TOTAL_BYTES);
	});

	// The tiers are sized against the budgets; if someone raises a bitrate this
	// is where it shows that a minute of low video no longer fits.
	it('holds a minute of low-quality video, even on the H.264 fallback', () => {
		const { avcBitrate, audioBitrate } = TRANSCODE_SETTINGS.low.video;
		expect(((avcBitrate + audioBitrate) * 60) / 8).toBeLessThan(MAX_LOW_QUALITY_TOTAL_BYTES);
	});

	it('holds half a minute of high-quality video under the video cap', () => {
		const { avcBitrate, audioBitrate } = TRANSCODE_SETTINGS.high.video;
		expect(((avcBitrate + audioBitrate) * 30) / 8).toBeLessThan(MAX_VIDEO_BYTES);
	});
});

describe('fitLongEdge', () => {
	it('scales a landscape photo so its width is the limit', () => {
		expect(fitLongEdge(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
	});

	it('scales a portrait photo so its height is the limit', () => {
		expect(fitLongEdge(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
	});

	it('never scales up', () => {
		expect(fitLongEdge(800, 600, 1600)).toEqual({ width: 800, height: 600 });
	});

	it('never rounds an edge to nothing', () => {
		expect(fitLongEdge(10_000, 1, 1600)).toEqual({ width: 1600, height: 1 });
	});
});

describe('fitShortEdge', () => {
	it('makes a 4K landscape clip 720p', () => {
		expect(fitShortEdge(3840, 2160, 720)).toEqual({ width: 1280, height: 720 });
	});

	it('makes a 4K portrait clip 720 wide, not 405', () => {
		expect(fitShortEdge(2160, 3840, 720)).toEqual({ width: 720, height: 1280 });
	});

	it('never scales up', () => {
		expect(fitShortEdge(640, 360, 720)).toEqual({ width: 640, height: 360 });
	});

	it('keeps both edges even, which the encoders need', () => {
		const { width, height } = fitShortEdge(1921, 1081, 720);
		expect(width % 2).toBe(0);
		expect(height % 2).toBe(0);
	});
});

describe('transcodeKind', () => {
	it('leaves everything alone at original', () => {
		expect(transcodeKind('image/jpeg', 'original')).toBe('keep');
		expect(transcodeKind('video/mp4', 'original')).toBe('keep');
	});

	it('re-encodes photos and videos at the other tiers', () => {
		expect(transcodeKind('image/heic', 'low')).toBe('image');
		expect(transcodeKind('image/png', 'high')).toBe('image');
		expect(transcodeKind('video/quicktime', 'low')).toBe('video');
	});

	// Decoding to a bitmap keeps only a GIF's first frame.
	it('passes GIFs and SVGs through at every tier', () => {
		expect(transcodeKind('image/gif', 'low')).toBe('keep');
		expect(transcodeKind('image/svg+xml', 'high')).toBe('keep');
	});

	it('passes through anything that is neither a photo nor a video', () => {
		expect(transcodeKind('application/pdf', 'low')).toBe('keep');
		expect(transcodeKind('', 'low')).toBe('keep');
	});
});

describe('keepOriginal', () => {
	it('keeps a web-displayable original the re-encode did not shrink', () => {
		expect(keepOriginal({ size: 1000, type: 'image/jpeg' }, 1200)).toBe(true);
		expect(keepOriginal({ size: 1000, type: 'video/mp4' }, 1000)).toBe(true);
	});

	it('takes the re-encode when it is smaller', () => {
		expect(keepOriginal({ size: 1000, type: 'image/jpeg' }, 400)).toBe(false);
	});

	// The conversion was for viewability, not only size.
	it('keeps a HEIC converted even when the AVIF came out larger', () => {
		expect(keepOriginal({ size: 1000, type: 'image/heic' }, 1200)).toBe(false);
	});
});

describe('withExtension', () => {
	it('replaces the extension', () => {
		expect(withExtension('IMG_1234.HEIC', 'avif')).toBe('IMG_1234.avif');
		expect(withExtension('clip.final.mov', 'webm')).toBe('clip.final.webm');
	});

	it('adds one to a name without', () => {
		expect(withExtension('photo', 'avif')).toBe('photo.avif');
		expect(withExtension('.hidden', 'avif')).toBe('.hidden.avif');
		expect(withExtension('', 'avif')).toBe('file.avif');
	});
});
