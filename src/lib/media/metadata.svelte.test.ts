/**
 * The real metadata reader in real Chromium: exifr on a JPEG carrying EXIF,
 * and mediabunny on a video carrying tags. Named `.svelte.test.ts` only to
 * land in the browser project.
 */

import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality } from 'mediabunny';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NO_SENSITIVE_METADATA } from '$lib/media-metadata';
import { defined } from '$lib/testing/defined';
import { withExif } from '$lib/testing/exif';
import { readSensitiveMetadata } from './metadata';

async function jpeg(): Promise<Blob> {
	const canvas = new OffscreenCanvas(64, 48);
	const context = defined(canvas.getContext('2d'), 'a 2D context');
	context.fillStyle = '#f60';
	context.fillRect(0, 0, 64, 48);
	return await canvas.convertToBlob({ type: 'image/jpeg' });
}

async function clip(tags: Parameters<Output['setMetadataTags']>[0]): Promise<File> {
	const canvas = new OffscreenCanvas(64, 48);
	// A canvas never drawn on cannot become a video frame.
	const context = defined(canvas.getContext('2d'), 'a 2D context');
	context.fillStyle = '#06f';
	context.fillRect(0, 0, 64, 48);
	const target = new BufferTarget();
	const output = new Output({ format: new Mp4OutputFormat(), target });
	const source = new CanvasSource(canvas, {
		codec: 'avc',
		bitrate: new Quality({ bitrate: 100_000 })
	});
	output.addVideoTrack(source, { frameRate: 10 });
	output.setMetadataTags(tags);
	await output.start();
	await source.add(0, 0.1);
	await output.finalize();
	return new File([defined(target.buffer, 'the encoded clip')], 'clip.mp4', { type: 'video/mp4' });
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('readSensitiveMetadata: photos', () => {
	it('finds the GPS, the camera and the time a phone writes into a JPEG', async () => {
		const photo = await withExif(await jpeg(), {
			make: 'Apple',
			model: 'iPhone 15 Pro',
			dateTimeOriginal: '2026:09:01 10:00:00',
			gps: { latitude: -37.8136, longitude: 144.9631 }
		});
		const metadata = await readSensitiveMetadata(
			new File([photo], 'IMG_0001.jpg', { type: 'image/jpeg' })
		);
		expect(metadata.location).toBe(true);
		expect(metadata.device).toBe('Apple iPhone 15 Pro');
		expect(metadata.takenAt?.getFullYear()).toBe(2026);
	});

	it('finds nothing in a JPEG with no EXIF', async () => {
		const plain = new File([await jpeg()], 'plain.jpg', { type: 'image/jpeg' });
		await expect(readSensitiveMetadata(plain)).resolves.toEqual(NO_SENSITIVE_METADATA);
	});

	it('reports nothing, rather than failing, for a file it cannot read', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const broken = new File([new Uint8Array([1, 2, 3])], 'broken.jpg', { type: 'image/jpeg' });
		await expect(readSensitiveMetadata(broken)).resolves.toEqual(NO_SENSITIVE_METADATA);
	});
});

describe('readSensitiveMetadata: videos', () => {
	it('finds a location and a date in a video', async () => {
		const date = new Date('2026-09-01T00:00:00Z');
		const metadata = await readSensitiveMetadata(
			await clip({ date, raw: { '©xyz': '+37.7749-122.4194/' } })
		);
		expect(metadata.location).toBe(true);
		expect(metadata.takenAt?.toISOString()).toBe(date.toISOString());
	});

	it('finds nothing in a video with no tags', async () => {
		await expect(readSensitiveMetadata(await clip({}))).resolves.toEqual(NO_SENSITIVE_METADATA);
	});
});
