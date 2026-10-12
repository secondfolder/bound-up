import { recordImage } from './media-log';

/**
 * Attachment for a third-party picture: reports whether it loaded, so a
 * browser that is blocking a host says so in the console (see `media-log.ts`).
 *
 * A listener rather than `onload=`/`onerror=`: the events can fire before
 * hydration, and Svelte's handlers attach too late to see them. An image that
 * has already settled by then is read from `complete` and `naturalWidth`.
 */
export function trackImage(image: HTMLImageElement): () => void {
	const loaded = () => recordImage(image.src, 'loaded');
	const failed = () => recordImage(image.src, 'failed');
	if (image.complete && image.src) {
		if (image.naturalWidth > 0) {
			loaded();
		} else {
			failed();
		}
	}
	image.addEventListener('load', loaded);
	image.addEventListener('error', failed);
	return () => {
		image.removeEventListener('load', loaded);
		image.removeEventListener('error', failed);
	};
}
