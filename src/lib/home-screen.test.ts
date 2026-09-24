import { describe, expect, it } from 'vitest';
import { shouldOfferHomeScreen } from './home-screen';

/**
 * Only iPhone and iPad, in a tab — the one place storage is cleared on a
 * timer, and the one place a Home Screen app is exempt from it.
 */

const IPHONE_SAFARI =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1';
// iPadOS asks for the desktop site by default, so it says it is a Mac.
const IPAD_DESKTOP_MODE =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const MAC_SAFARI = IPAD_DESKTOP_MODE;
const ANDROID_CHROME =
	'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

const offer = (userAgent: string, maxTouchPoints = 0, standalone = false) =>
	shouldOfferHomeScreen({ userAgent, maxTouchPoints, standalone });

describe('shouldOfferHomeScreen', () => {
	it('offers on iPhone Safari', () => {
		expect(offer(IPHONE_SAFARI, 5)).toBe(true);
	});

	/** Every iOS browser is WebKit and, since iOS 16.4, can add to the Home Screen. */
	it('offers on other iOS browsers too', () => {
		expect(offer(IPHONE_CHROME, 5)).toBe(true);
	});

	it('offers on an iPad pretending to be a Mac', () => {
		expect(offer(IPAD_DESKTOP_MODE, 5)).toBe(true);
	});

	it('does not offer on a real Mac, which has no touch screen', () => {
		expect(offer(MAC_SAFARI, 0)).toBe(false);
	});

	it('does not offer on Android, which clears nothing on a timer', () => {
		expect(offer(ANDROID_CHROME, 5)).toBe(false);
	});

	it('does not offer once it is already running from the Home Screen', () => {
		expect(offer(IPHONE_SAFARI, 5, true)).toBe(false);
		expect(offer(IPAD_DESKTOP_MODE, 5, true)).toBe(false);
	});
});
