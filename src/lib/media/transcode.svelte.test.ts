/**
 * The real transcoder in real Chromium: the AVIF wasm in its worker, and
 * mediabunny over WebCodecs. Named `.svelte.test.ts` only to land in the
 * browser project; there is no component here.
 */

import {
	ALL_FORMATS,
	BlobSource,
	BufferTarget,
	CanvasSource,
	canEncodeVideo,
	Input,
	Output,
	Quality,
	WebMOutputFormat
} from 'mediabunny';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defined } from '$lib/testing/defined';
import { transcodeFile } from './transcode';

/** Lets a test play a browser that cannot encode VP9. */
const encoders = vi.hoisted(() => ({ vp9: true }));

vi.mock('mediabunny', async (importOriginal) => {
	const actual = await importOriginal<typeof import('mediabunny')>();
	return {
		...actual,
		canEncodeVideo: (...args: Parameters<typeof actual.canEncodeVideo>) =>
			args[0] === 'vp9' && !encoders.vp9 ? Promise.resolve(false) : actual.canEncodeVideo(...args)
	};
});

async function png(width: number, height: number): Promise<File> {
	const canvas = new OffscreenCanvas(width, height);
	const context = defined2d(canvas);
	const gradient = context.createLinearGradient(0, 0, width, height);
	gradient.addColorStop(0, '#f60');
	gradient.addColorStop(1, '#06f');
	context.fillStyle = gradient;
	context.fillRect(0, 0, width, height);
	context.fillStyle = '#fff';
	context.fillRect(width / 4, height / 4, width / 2, height / 2);
	const blob = await canvas.convertToBlob({ type: 'image/png' });
	return new File([blob], 'IMG_0001.PNG', { type: 'image/png' });
}

function defined2d(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
	const context = canvas.getContext('2d');
	if (!context) {
		throw new Error('no 2D context');
	}
	return context;
}

/**
 * A short, noisy VP9 clip at a generous bitrate, so re-encoding it at the low
 * tier's bitrate comes out smaller — noise, because a flat frame compresses to
 * nothing at any bitrate and the original would be kept.
 */
async function clip(width: number, height: number): Promise<File> {
	const canvas = new OffscreenCanvas(width, height);
	const context = defined2d(canvas);
	const target = new BufferTarget();
	const output = new Output({ format: new WebMOutputFormat(), target });
	const source = new CanvasSource(canvas, {
		codec: 'vp9',
		bitrate: new Quality({ bitrate: 8_000_000 })
	});
	output.addVideoTrack(source, { frameRate: 10 });
	await output.start();
	const image = context.createImageData(width, height);
	for (let frame = 0; frame < 10; frame += 1) {
		crypto.getRandomValues(new Uint8Array(image.data.buffer, 0, 65_536));
		for (let offset = 65_536; offset < image.data.length; offset += 65_536) {
			image.data.copyWithin(offset, 0, Math.min(65_536, image.data.length - offset));
		}
		context.putImageData(image, 0, 0);
		await source.add(frame / 10, 1 / 10);
	}
	await output.finalize();
	return new File([defined(target.buffer, 'the encoded clip')], 'clip.mov', { type: 'video/webm' });
}

async function videoSize(file: Blob) {
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	const track = defined(await input.getPrimaryVideoTrack(), 'a video track');
	const size = { width: await track.getDisplayWidth(), height: await track.getDisplayHeight() };
	input.dispose();
	return size;
}

/** Asked once, up front, so each test below is declared for the browser it has. */
const avcEncodable = await canEncodeVideo('avc', { width: 1280, height: 720 });

afterEach(() => {
	vi.restoreAllMocks();
	encoders.vp9 = true;
});

describe('transcodeFile: images', () => {
	it('re-encodes a photo to AVIF within the low tier, under a new name', async () => {
		const original = await png(2400, 1800);
		const file = await transcodeFile(original, 'low');

		expect(file.type).toBe('image/avif');
		expect(file.name).toBe('IMG_0001.avif');
		expect(file.size).toBeLessThan(original.size);
		const bitmap = await createImageBitmap(file);
		expect({ width: bitmap.width, height: bitmap.height }).toEqual({ width: 1600, height: 1200 });
	});

	it('keeps more pixels at high', async () => {
		const sent = await transcodeFile(await png(2400, 1800), 'high');
		const bitmap = await createImageBitmap(sent);
		// Under high's 3200 px limit already, so never scaled up.
		expect({ width: bitmap.width, height: bitmap.height }).toEqual({ width: 2400, height: 1800 });
	});

	// "Native decode only": what this browser cannot decode goes as picked.
	it('sends what the browser cannot decode as picked', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const heic = new File([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])], 'IMG_1.HEIC', {
			type: 'image/heic'
		});
		const sent = await transcodeFile(heic, 'low');
		expect(sent).toBe(heic);
	});

	it('leaves a GIF alone, since decoding keeps only its first frame', async () => {
		const gif = new File([new Uint8Array([71, 73, 70, 56, 57, 97])], 'party.gif', {
			type: 'image/gif'
		});
		const sent = await transcodeFile(gif, 'low');
		expect(sent).toBe(gif);
	});

	it("gives up on a file whose signal aborts, with the signal's reason", async () => {
		const controller = new AbortController();
		const job = transcodeFile(await png(2400, 1800), 'low', { signal: controller.signal });
		controller.abort(new Error('removed'));
		await expect(job).rejects.toThrow('removed');
	});

	// One at a time, so a later file is not held up by an abandoned one.
	it('carries on with the next file after one is abandoned', async () => {
		const controller = new AbortController();
		const abandoned = transcodeFile(await png(2400, 1800), 'low', { signal: controller.signal });
		const next = transcodeFile(await png(400, 300), 'low');
		controller.abort(new Error('removed'));
		await expect(abandoned).rejects.toThrow('removed');
		await expect(next).resolves.toMatchObject({ type: 'image/avif' });
	});

	it('reports the end of each file', async () => {
		const progress = vi.fn();
		await transcodeFile(await png(40, 30), 'low', { onProgress: progress });
		expect(progress).toHaveBeenLastCalledWith(1);
	});
});

describe('transcodeFile: video', () => {
	it('re-encodes to VP9 in WebM with a 720 px short edge at low', { timeout: 60_000 }, async () => {
		const original = await clip(1920, 1080);
		const file = await transcodeFile(original, 'low');

		expect(file.type).toMatch(/^video\/webm; codecs="vp09/);
		expect(file.name).toBe('clip.webm');
		expect(file.size).toBeLessThan(original.size);
		await expect(videoSize(file)).resolves.toEqual({ width: 1280, height: 720 });
	});

	it('falls back to H.264 in MP4 where VP9 cannot be encoded', {
		timeout: 60_000,
		skip: !avcEncodable
	}, async () => {
		const original = await clip(1280, 720);
		encoders.vp9 = false;
		const file = await transcodeFile(original, 'low');
		expect(file.type).toMatch(/^video\/mp4; codecs="avc1/);
		expect(file.name).toBe('clip.mp4');
	});

	// Chromium ships an H.264 encoder only in some builds; without either
	// encoder there is nothing to convert to, and the original goes as picked.
	it('sends the original where neither VP9 nor H.264 can be encoded', {
		timeout: 60_000,
		skip: avcEncodable
	}, async () => {
		const original = await clip(1280, 720);
		encoders.vp9 = false;
		const sent = await transcodeFile(original, 'low');
		expect(sent).toBe(original);
	});
});
