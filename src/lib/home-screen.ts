/**
 * Whether to suggest adding the app to the Home Screen.
 *
 * Pure, so every device it has to tell apart can be pinned by a unit test.
 *
 * Only on iPhone and iPad, and only in a browser tab. Safari deletes all of a
 * site's storage after seven days of use without a visit to it, which is what
 * makes an iPhone user sign in again after a quiet week — and a web app opened
 * from the Home Screen is WebKit's one documented exemption. No other platform
 * clears storage on a timer, so nowhere else is the suggestion worth its space.
 * See docs/encryption.md.
 *
 * Every browser on iOS is WebKit and, since iOS 16.4, can add to the Home
 * Screen, so this does not single out Safari.
 */

const IOS_DEVICE = /\b(?:iPhone|iPad|iPod)\b/;
const MAC = /\bMacintosh\b/;

export function shouldOfferHomeScreen(input: {
	userAgent: string;
	/** `navigator.maxTouchPoints`. */
	maxTouchPoints: number;
	/** Already running from the Home Screen: `navigator.standalone` or `display-mode: standalone`. */
	standalone: boolean;
}): boolean {
	if (input.standalone) {
		return false;
	}
	if (IOS_DEVICE.test(input.userAgent)) {
		return true;
	}
	// iPadOS asks for the desktop site by default and says it is a Mac. A Mac
	// has no touch screen; an iPad reports several touch points.
	return MAC.test(input.userAgent) && input.maxTouchPoints > 1;
}

/** Remembered per device once dismissed. A convenience, so losing it is harmless. */
export const HOME_SCREEN_HINT_DISMISSED_KEY = 'bound-up:home-screen-hint-dismissed';
