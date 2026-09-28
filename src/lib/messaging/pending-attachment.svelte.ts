/**
 * One file in the composer, between being picked and being sent.
 *
 * It starts compressing the moment it is picked rather than when Send is
 * pressed: a video takes long enough that making someone watch it after they
 * have decided to send is the worst time to do it. It holds a job per quality,
 * so flicking SD → HD → SD reuses the SD result, and abandons any unfinished
 * job the sender has moved away from, since an encode nobody will send only
 * drains a phone's battery.
 *
 * The encoders are reached through `await import()` behind the `browser`
 * check, which is dead code in the server build: this module is rendered on
 * the server as part of the composer, and must not pull the encoders into the
 * worker bundle. See docs/messaging.md#transcoding.
 */

import { browser } from '$app/environment';
import { type MediaQuality, transcodeKind } from '$lib/media-quality';
import type { MediaTtl } from '$lib/messaging';

export type AttachmentKind = 'image' | 'video';

type Job = {
	promise: Promise<File>;
	controller: AbortController;
	/** Set once the promise settles with a file, so a cached result is instant. */
	result: File | null;
};

export class PendingAttachment {
	readonly id = crypto.randomUUID();
	readonly original: File;
	readonly kind: AttachmentKind;
	/** The original, for the composer's thumbnail. Revoked by `dispose`. */
	readonly previewUrl: string;

	quality: MediaQuality = $state('low');
	mediaTtl: MediaTtl = $state(0);
	/**
	 * The file to send at the current quality once it is ready, null while it
	 * is still compressing. Immediate for a file sent as picked, so the size
	 * checks can measure it straight away.
	 */
	prepared: File | null = $state(null);
	/** How far the current quality's compression has got, 0–1; null when not compressing. */
	progress: number | null = $state(null);

	readonly #jobs = new Map<MediaQuality, Job>();

	constructor(original: File, options: { quality: MediaQuality; mediaTtl: MediaTtl }) {
		this.original = original;
		this.kind = original.type.startsWith('video/') ? 'video' : 'image';
		this.previewUrl = URL.createObjectURL(original);
		this.mediaTtl = options.mediaTtl;
		this.setQuality(options.quality);
	}

	get name(): string {
		return this.original.name;
	}

	setQuality(quality: MediaQuality): void {
		this.quality = quality;
		for (const [other, job] of this.#jobs) {
			if (other !== quality && job.result === null) {
				job.controller.abort();
				this.#jobs.delete(other);
			}
		}

		// Sent as picked — Original, a GIF, anything not a photo or a video —
		// so there is nothing to wait for.
		if (
			!browser ||
			quality === 'original' ||
			transcodeKind(this.original.type, quality) === 'keep'
		) {
			this.prepared = this.original;
			this.progress = null;
			return;
		}

		const job = this.#jobs.get(quality) ?? this.#start(quality);
		this.prepared = job.result;
		this.progress = job.result ? null : (this.progress ?? 0);
		void job.promise.then(
			(file) => {
				if (this.quality === quality) {
					this.prepared = file;
					this.progress = null;
				}
			},
			// Aborted: only ever a job this attachment has moved away from.
			() => undefined
		);
	}

	#start(quality: Exclude<MediaQuality, 'original'>): Job {
		const controller = new AbortController();
		const job: Job = { controller, result: null, promise: Promise.resolve(this.original) };
		this.progress = 0;
		job.promise = import('$lib/media/transcode')
			.then(({ transcodeFile }) =>
				transcodeFile(this.original, quality, {
					signal: controller.signal,
					onProgress: (fraction) => {
						if (this.quality === quality && job.result === null) {
							this.progress = fraction;
						}
					}
				})
			)
			.then((file) => {
				job.result = file;
				return file;
			});
		this.#jobs.set(quality, job);
		return job;
	}

	/** The file to send at the current quality, waiting for it if need be. */
	ready(): Promise<File> {
		if (this.prepared) {
			return Promise.resolve(this.prepared);
		}
		return this.#jobs.get(this.quality)?.promise ?? Promise.resolve(this.original);
	}

	/** Stops any work and frees the thumbnail. The attachment is unusable after. */
	dispose(): void {
		for (const job of this.#jobs.values()) {
			if (job.result === null) {
				job.controller.abort();
			}
		}
		this.#jobs.clear();
		URL.revokeObjectURL(this.previewUrl);
	}
}
