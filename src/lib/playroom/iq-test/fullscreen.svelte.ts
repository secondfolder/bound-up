/**
 * Fullscreen for the IQ test: whether this browser offers it, whether the
 * page is in it, and the toggle the setup dialog and the media dock share.
 *
 * Offered only where `document.fullscreenEnabled` says so. An iPhone's Safari
 * has no fullscreen for anything but a video, so there it is simply not
 * shown, rather than shown and failing.
 *
 * The state follows `fullscreenchange`, not the toggle: Escape, the browser's
 * own exit and a dock button all end up in the same place.
 */

let supported = $state(false);
let active = $state(false);

export function fullscreenSupported(): boolean {
	return supported;
}

export function isFullscreen(): boolean {
	return active;
}

/** Start following the page's fullscreen state. Returns the cleanup. */
export function watchFullscreen(): () => void {
	supported = document.fullscreenEnabled === true;
	const update = () => {
		active = document.fullscreenElement !== null;
	};
	update();
	document.addEventListener('fullscreenchange', update);
	return () => document.removeEventListener('fullscreenchange', update);
}

/**
 * Enter or leave fullscreen. Call it from a click: a browser only grants
 * fullscreen inside a gesture. A refusal is not an error worth reporting —
 * the page simply stays as it was.
 */
export function toggleFullscreen(): void {
	const request = document.fullscreenElement
		? document.exitFullscreen()
		: document.documentElement.requestFullscreen();
	request.catch(() => {
		// Refused (no gesture, or a policy): nothing changes, and the toggle
		// still reads the real state.
	});
}
