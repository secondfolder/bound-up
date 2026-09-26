<script lang="ts">
	import type { MessageAttachmentInfo } from '$lib/crypto/messages';
	import { formatTimeLeft } from '$lib/messaging';
	import { fetchAttachment, MediaExpiredError } from '$lib/messaging/client';
	import type { AttachmentView } from '$lib/types';
	import SelfDestructedMedia from './SelfDestructedMedia.svelte';

	/**
	 * One decrypted image or video.
	 *
	 * Downloaded in full and decrypted before anything can be shown, because age
	 * ciphertext is not seekable — there is no `Range` support and no
	 * progressive playback. That is why videos are capped below the message
	 * budget, and why this shows a spinner rather than a progress bar (a plain
	 * `fetch` reports no download progress).
	 */
	let {
		info,
		partnershipId,
		view
	}: {
		info: MessageAttachmentInfo;
		partnershipId: string;
		/**
		 * The server's row for this attachment, matched by id: its expiry. Absent
		 * only if the manifest names a file the server has no row for, which then
		 * fails as a download like any other missing file.
		 */
		view?: AttachmentView | undefined;
	} = $props();

	let url: string | null = $state(null);
	let failed = $state(false);
	/** A 410 from the server: it expired between the load and the download. */
	let gone = $state(false);

	let now = $state(Date.now());

	// Primitives rather than reads of `view` inside the effects: `view` is a
	// fresh object on every `invalidate()`, and an effect that read it would
	// download and decrypt the file again on every refresh (AGENTS.md).
	const expiresAt = $derived(view?.expiresAt?.getTime() ?? null);

	/**
	 * Ticks every half minute, for the countdown and so media that expires while
	 * the thread is open turns into the placeholder without a reload. Not a
	 * single timeout at `expiresAt`: `setTimeout` overflows past about 24.8 days
	 * and fires at once, and the longest lifetime is 30. Permanent media has
	 * nothing to count down.
	 */
	$effect(() => {
		if (expiresAt === null) {
			return;
		}
		const timer = setInterval(() => {
			now = Date.now();
		}, 30_000);
		return () => clearInterval(timer);
	});
	const expired = $derived(
		gone || (view?.expired ?? false) || (expiresAt !== null && now >= expiresAt)
	);
	const timeLeft = $derived(expiresAt === null ? null : formatTimeLeft(expiresAt - now));

	$effect(() => {
		if (expired) {
			return;
		}
		let current: string | null = null;
		let cancelled = false;

		void (async () => {
			try {
				const result = await fetchAttachment(partnershipId, info);
				if (cancelled) {
					// Revoked immediately: the component went away mid-download, and
					// an un-revoked object URL keeps the whole decrypted blob in memory.
					URL.revokeObjectURL(result.url);
					return;
				}
				current = result.url;
				({ url } = result);
			} catch (error) {
				if (error instanceof MediaExpiredError) {
					if (!cancelled) {
						gone = true;
					}
					return;
				}
				console.error('could not open attachment', error);
				if (!cancelled) {
					failed = true;
				}
			}
		})();

		return () => {
			cancelled = true;
			if (current) {
				URL.revokeObjectURL(current);
			}
		};
	});
</script>

{#if expired}
	<SelfDestructedMedia />
{:else if failed}
	<p class="failed">Could not open this file.</p>
{:else if !url}
	<div class="loading" aria-live="polite">
		<wa-spinner></wa-spinner>
		<span>Decrypting {info.fileName}…</span>
	</div>
{:else if info.kind === 'video'}
	<!-- svelte-ignore a11y_media_has_caption
	     (Since this is a user uploaded video we don't have captions for it although at somepoint in the future we'd like
	     to offer on-device auto-captioning)
	-->
	<div class="media video">
		<!-- biome-ignore lint/a11y/useMediaCaption: as above — an uploaded video has no caption track to offer. -->
		<video src={url} controls playsinline preload="metadata"></video>
		{@render countdown()}
	</div>
{:else}
	<div class="media">
		<img src={url} alt={info.fileName} />
		{@render countdown()}
	</div>
{/if}

<!-- Over the media rather than under it, so it costs no height in the thread.
     The bomb is the word "Self-destructs" to a screen reader, so the badge
     reads as the whole sentence while showing only "in 3 days". -->
{#snippet countdown()}
	{#if timeLeft}
		<p class="countdown">
			<wa-icon name="bomb" variant="solid" label="Self-destructs"></wa-icon>
			<span>in {timeLeft}</span>
		</p>
	{/if}
{/snippet}

<style>
	img,
	video {
		display: block;
		max-inline-size: 100%;
		border-radius: var(--wa-panel-border-radius, 0.5rem);
	}

	.loading {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		color: var(--wa-color-text-quiet);

		wa-spinner {
			font-size: 1rem;
		}
	}

	/* Shrinks to the media, so the badge's corner is the picture's corner. */
	.media {
		position: relative;
		inline-size: fit-content;
		max-inline-size: 100%;
	}

	.countdown {
		position: absolute;
		inset-block-end: 0.375rem;
		inset-inline-start: 0.375rem;
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin: 0;
		padding: 0.125rem 0.5rem;
		border-radius: 999px;
		background: var(--media-badge-fill);
		backdrop-filter: blur(6px);
		color: var(--wa-color-text-normal);
		font-size: 0.6875rem;
		line-height: 1.4;
		/* Information, not a control: taps go through to the media. */
		pointer-events: none;

		wa-icon {
			font-size: 0.625rem;
		}
	}

	/* The native controls own a video's bottom edge, so its badge sits in the
	   top-left corner instead of covering the play button and scrubber. */
	.video .countdown {
		inset-block: 0.375rem auto;
	}

	.failed {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--wa-color-text-danger);
	}
</style>
