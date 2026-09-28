/**
 * Whether this browser can show what a sender's transcoder produced, asked
 * before a download is decrypted into a black box.
 *
 * Sent photos are AVIF and sent videos VP9 in WebM (or H.264 in MP4), which
 * every current browser shows — so a "no" here is an out-of-date browser, and
 * the attachment says to update it. See docs/messaging.md#transcoding.
 */

/** A 1×1 AVIF, made by the same encoder the sender uses. */
const TINY_AVIF =
	'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB4AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQAMAAAAABNjb2xybmNseAACAAIABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACZtZGF0EgAKCBgABggQEDQgMhAYAAooooQAALAFQHv6LhIR';

let avif: Promise<boolean> | null = null;

export function canDisplayAvif(): Promise<boolean> {
	avif ??= new Promise<boolean>((resolve) => {
		const image = new Image();
		image.addEventListener('load', () => resolve(image.width > 0));
		image.addEventListener('error', () => resolve(false));
		image.src = TINY_AVIF;
	});
	return avif;
}

/**
 * Only a type that names its codecs can be answered in advance; a bare
 * `video/quicktime` gets "" from Chrome even for the H.264 files it plays
 * fine, so anything without `codecs=` is left to the `<video>` element's own
 * `error` event.
 */
export function canPlayVideo(mimeType: string): boolean {
	if (!mimeType.includes('codecs=')) {
		return true;
	}
	return document.createElement('video').canPlayType(mimeType) !== '';
}
