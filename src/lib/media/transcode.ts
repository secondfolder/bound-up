/**
 * Turns a picked file into the file that is encrypted and uploaded, at the
 * sender's chosen quality. Browser-only, like `src/lib/crypto/`: nothing under
 * `src/lib/server/**` or any `+*.server.ts` may import it.
 *
 * Reached only through `await import()` from
 * `messaging/pending-attachment.svelte.ts`, behind a `browser` check, so
 * neither the AVIF wasm nor mediabunny reaches the worker bundle or a page
 * that never attaches media. See docs/messaging.md#transcoding.
 */

import { hasSensitiveMetadata } from '../media-metadata';
import {
	keepOriginal,
	TRANSCODE_SETTINGS,
	type TranscodedQuality,
	transcodeKind,
	withExtension
} from '../media-quality';
import type { ImageJob, ImageResult } from './image.worker';
import { readSensitiveMetadata } from './metadata';

export type TranscodeOptions = {
	/** How far through this file, 0–1. Images report only the end. */
	onProgress?: (fraction: number) => void;
	/** Gives up on the file: removed from the composer, or its quality changed. */
	signal?: AbortSignal;
};

/**
 * `keepOriginal`, plus the one thing it cannot know: whether the original
 * carries where it was taken, or anything else about who took it. Such a file
 * keeps its re-encode even when that came out larger, because someone who left
 * a photo on SD has every reason to expect none of that is going with it.
 * Read only when size alone would keep the original, which is rarely.
 */
async function sendOriginal(file: File, encodedSize: number): Promise<boolean> {
	if (!keepOriginal(file, encodedSize)) {
		return false;
	}
	return !hasSensitiveMetadata(await readSensitiveMetadata(file));
}

function encodeImage(job: ImageJob, signal: AbortSignal | undefined): Promise<ImageResult> {
	// A worker per image, closed when it answers: a long-lived worker would
	// hold the encoder's wasm memory for the rest of the session.
	const worker = new Worker(new URL('./image.worker.ts', import.meta.url), { type: 'module' });
	return new Promise<ImageResult>((resolve, reject) => {
		worker.addEventListener('message', (event: MessageEvent<ImageResult>) => resolve(event.data));
		worker.addEventListener('error', (event) =>
			resolve({ kind: 'failed', message: event.message || 'The image worker failed to start' })
		);
		// Terminating is the only way to stop wasm mid-encode, which is also
		// why there is a worker per image rather than one shared.
		signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
		worker.postMessage(job);
	}).finally(() => worker.terminate());
}

async function transcodeImage(
	file: File,
	quality: TranscodedQuality,
	signal: AbortSignal | undefined
): Promise<File> {
	const { maxLongEdge, quality: level } = TRANSCODE_SETTINGS[quality].image;
	const result = await encodeImage({ file, maxLongEdge, quality: level }, signal);
	if (result.kind !== 'encoded') {
		if (result.kind === 'failed') {
			console.warn('could not compress an image; sending it as picked', result.message);
		}
		return file;
	}
	if (await sendOriginal(file, result.buffer.byteLength)) {
		return file;
	}
	return new File([result.buffer], withExtension(file.name, 'avif'), {
		type: 'image/avif',
		lastModified: file.lastModified
	});
}

async function transcodeVideoFile(
	file: File,
	quality: TranscodedQuality,
	options: TranscodeOptions
): Promise<File> {
	// Its own chunk: mediabunny is the larger of the two libraries, and a
	// message of photos alone should not fetch it.
	const { transcodeVideo } = await import('./video');
	let encoded: Awaited<ReturnType<typeof transcodeVideo>>;
	try {
		encoded = await transcodeVideo(file, TRANSCODE_SETTINGS[quality].video, options);
	} catch (error) {
		if (options.signal?.aborted) {
			throw error;
		}
		console.warn('could not compress a video; sending it as picked', error);
		return file;
	}
	if (!encoded || (await sendOriginal(file, encoded.blob.size))) {
		return file;
	}
	return new File([encoded.blob], withExtension(file.name, encoded.extension), {
		type: encoded.mimeType,
		lastModified: file.lastModified
	});
}

/**
 * One job at a time, across every composer on the page: a phone decoding two
 * 4K videos at once runs out of memory well before it runs out of patience.
 * Jobs start in the order files were picked.
 */
let queue: Promise<unknown> = Promise.resolve();

/**
 * The file to send for `file` at `quality`.
 *
 * Never rejects for a file it could not compress — that file comes back as
 * picked, and the size checks decide whether it can go. It rejects only when
 * `signal` aborts, with the signal's reason.
 */
export function transcodeFile(
	file: File,
	quality: TranscodedQuality,
	options: TranscodeOptions = {}
): Promise<File> {
	const kind = transcodeKind(file.type, quality);
	if (kind === 'keep') {
		return Promise.resolve(file);
	}
	const run = async () => {
		options.signal?.throwIfAborted();
		const out =
			kind === 'image'
				? await transcodeImage(file, quality, options.signal)
				: await transcodeVideoFile(file, quality, options);
		options.onProgress?.(1);
		return out;
	};
	const job = queue.then(run, run);
	// The queue carries on past a failed or abandoned job.
	queue = job.catch(() => undefined);
	return job;
}
