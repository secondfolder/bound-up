/**
 * Decodes, downsizes and AVIF-encodes one image, off the main thread.
 *
 * A worker because libavif in wasm takes seconds on a phone for a large photo,
 * and on the main thread that is seconds of a frozen composer. The single-
 * threaded encoder is the one that loads: `@jsquash/avif` only picks its
 * threaded build when `SharedArrayBuffer` exists, which needs COOP/COEP
 * headers this app does not send.
 *
 * Decoding is the browser's own, deliberately ("native decode only"): a file
 * the sender's browser cannot decode — HEIC outside Safari, say — is reported
 * back as undecodable and sent as picked.
 */

import encode from '@jsquash/avif/encode.js';
import { fitLongEdge } from '../media-quality';

export type ImageJob = { file: Blob; maxLongEdge: number; quality: number };

export type ImageResult =
	| { kind: 'encoded'; buffer: ArrayBuffer; width: number; height: number }
	| { kind: 'undecodable' }
	| { kind: 'failed'; message: string };

// The project's `lib` is the DOM's, where `postMessage` is `Window`'s and wants
// a target origin; this is the dedicated-worker shape.
const scope = globalThis as unknown as {
	addEventListener: (type: 'message', listener: (event: MessageEvent<ImageJob>) => void) => void;
	postMessage: (message: ImageResult, transfer?: Transferable[]) => void;
};

async function run({ file, maxLongEdge, quality }: ImageJob): Promise<ImageResult> {
	let bitmap: ImageBitmap;
	try {
		// `from-image` applies the EXIF orientation, which the re-encode would
		// otherwise lose along with the rest of the EXIF: a portrait phone photo
		// would arrive on its side.
		bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
	} catch {
		return { kind: 'undecodable' };
	}

	let resized: ImageBitmap | null = null;
	try {
		const { width, height } = fitLongEdge(bitmap.width, bitmap.height, maxLongEdge);
		// Resized by `createImageBitmap` rather than by `drawImage`, whose
		// single-pass bilinear scaling aliases badly at the 3–4× reductions a
		// phone photo needs.
		resized =
			width === bitmap.width && height === bitmap.height
				? bitmap
				: await createImageBitmap(bitmap, {
						resizeWidth: width,
						resizeHeight: height,
						resizeQuality: 'high'
					});
		const canvas = new OffscreenCanvas(width, height);
		const context = canvas.getContext('2d');
		if (!context) {
			return { kind: 'failed', message: 'No 2D context in the worker' };
		}
		context.drawImage(resized, 0, 0);
		const pixels = context.getImageData(0, 0, width, height);
		const buffer = await encode(pixels, { quality, speed: 7 });
		return { kind: 'encoded', buffer, width, height };
	} catch (error) {
		return { kind: 'failed', message: error instanceof Error ? error.message : String(error) };
	} finally {
		// Closed at once rather than left to the collector: each is a full
		// decoded frame, 48 MB for a 12 MP photo.
		resized?.close();
		bitmap.close();
	}
}

scope.addEventListener('message', (event) => {
	void run(event.data).then((result) => {
		scope.postMessage(result, result.kind === 'encoded' ? [result.buffer] : []);
	});
});
