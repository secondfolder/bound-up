/** Engines that report Apple as their vendor but are not Safari's renderer. */
const NOT_SAFARI = /CriOS|FxiOS|EdgiOS|Chrome|Chromium|Android/;

/**
 * Whether this is Safari itself, for the few visual effects it renders
 * differently. Apple's vendor string alone is not enough: every browser on iOS
 * reports it, and Chrome and Firefox there name themselves in the user agent.
 * Browser-only — it reads `navigator`.
 */
export function isSafari(): boolean {
	return navigator.vendor === 'Apple Computer, Inc.' && !NOT_SAFARI.test(navigator.userAgent);
}
