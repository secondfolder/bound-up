import { tryFetch } from '$lib/request-failure.svelte';
import { EMPTY_FEED, hasMedia, type MediaFeed, shuffleFeed } from './media';
import { byHost, mediaInfo, mediaWarn } from './media-log';
import type { Vibe } from './settings';

/** Waits before asking again for pictures that did not come, in ms. */
export const MEDIA_RETRIES = [30_000, 60_000, 120_000];

/**
 * The pictures and clips for a run that shows porn: fetched for a vibe, and
 * shuffled on arrival and on "New porn".
 *
 * A failure is nobody's problem: the page is meant to work without them, and
 * nobody is waiting. An empty answer means every source was backing off, so
 * it is asked again a few times, further apart each time, while the test
 * goes on.
 */
export class PornFeed {
	feed = $state<MediaFeed>(EMPTY_FEED);
	/** The vibe `feed` is for: an empty answer for another clears it. */
	#feedVibe: Vibe | null = null;

	/**
	 * Fetch a vibe's feed (or, for none, empty it), retrying an empty one.
	 * Returns what stops it: for an effect to return, so a change of vibe
	 * aborts the fetch and the retries for the old one.
	 */
	follow(vibe: Vibe | null): () => void {
		if (vibe === null) {
			this.feed = EMPTY_FEED;
			this.#feedVibe = null;
			return () => undefined;
		}
		const controller = new AbortController();
		let retry: ReturnType<typeof setTimeout> | undefined;
		const load = (attempt: number) => {
			void tryFetch(`/api/playroom/iq-test/media?vibe=${vibe}`, { signal: controller.signal })
				.then(async (response) => {
					if (!response?.ok) {
						mediaWarn(
							`Could not get pictures for "${vibe}": ${response ? `HTTP ${response.status}` : 'no connection'}.`
						);
					}
					const next = response?.ok ? ((await response.json()) as MediaFeed) : EMPTY_FEED;
					if (hasMedia(next)) {
						const files = next.clips.filter((clip) => clip.video !== null);
						mediaInfo(
							`Pictures for "${vibe}": ${next.images.length} images (${byHost(next.images)}), ` +
								`${next.clips.length} clips (${files.length} playable by the page, ` +
								`${files.filter((clip) => clip.sound).length} with sound).`
						);
						// Shuffled on arrival: the server hands every visitor the same
						// cached order, so without this every reload showed the same
						// pictures in the same places.
						this.feed = shuffleFeed(next);
						this.#feedVibe = vibe;
						return;
					}
					// Nothing for this vibe yet: the last vibe's pictures are not
					// kept up in its place. They were, and a change of theme seemed
					// to change nothing whenever the new one's sources were
					// backing off.
					if (this.#feedVibe !== vibe) {
						this.feed = EMPTY_FEED;
						this.#feedVibe = vibe;
					}
					if (attempt < MEDIA_RETRIES.length) {
						const wait = MEDIA_RETRIES[attempt] ?? 0;
						mediaInfo(
							`No pictures for "${vibe}" yet: every source is backing off. Asking again in ${wait / 1000}s.`
						);
						retry = setTimeout(() => load(attempt + 1), wait);
					} else {
						mediaInfo(
							`Still no pictures for "${vibe}"; giving up. The test carries on without them.`
						);
					}
				})
				.catch(() => {
					// Aborted because the vibe changed: the next `follow` is already
					// fetching the right feed.
				});
		};
		load(0);
		return () => {
			controller.abort();
			clearTimeout(retry);
		};
	}

	/**
	 * Swap everything on show for others from the same feed: a new order, so
	 * every column, strip and the overload backdrop draw something else.
	 */
	shuffle() {
		this.feed = shuffleFeed(this.feed);
		mediaInfo('Shuffled: new pictures and clips from the same feed.');
	}
}
