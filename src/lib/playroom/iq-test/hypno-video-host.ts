/**
 * Where the PMVHaven hypno's `<video>` is shown: in the first porn column,
 * as one of the porn videos, while there are columns; otherwise out of sight
 * at its home in `HypnoVideo`, playing on for its sound (mood lighting, the
 * intro, the results).
 *
 * One element, moved rather than remade, so the hypno never starts again
 * from the top when the columns come and go. A media element only pauses
 * when it is still out of the document once the task that removed it is
 * over, and every move here — including putting it back home when its slot
 * is torn down, which happens after the slot has already left the page — is
 * synchronous, so it plays straight through. It is played again anyway if a
 * browser paused it, since only a pause it meant should stop it.
 *
 * Module state: there is only ever one hypno video on the page.
 */

let video: HTMLVideoElement | null = null;
let home: HTMLElement | null = null;
let slot: HTMLElement | null = null;

function place() {
	if (!video) {
		return;
	}
	const target = slot ?? home;
	if (!target || video.parentElement === target) {
		return;
	}
	const wasPlaying = !video.paused;
	target.append(video);
	if (wasPlaying && video.paused) {
		void video.play().catch(() => undefined);
	}
}

/** Called by `HypnoVideo` with its element and the home it sits in when unseen. Returns the undo. */
export function provideHypnoVideo(element: HTMLVideoElement, homeElement: HTMLElement): () => void {
	video = element;
	home = homeElement;
	place();
	return () => {
		// Wherever it is: a video moved into a column is no longer inside the
		// component that made it, and would outlive it there.
		element.remove();
		if (video === element) {
			video = null;
			home = null;
		}
	};
}

/** An attachment for the column's slot that shows the hypno. */
export function hypnoSlot(node: HTMLElement): () => void {
	slot = node;
	place();
	return () => {
		if (slot === node) {
			slot = null;
			place();
		}
	};
}
