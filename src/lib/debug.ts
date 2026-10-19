/**
 * Debug mode: the pure half. See docs/debug-mode.md.
 *
 * Alias-free, like `features.ts`, so a test or a load can use it without
 * Vite.
 *
 * Debug mode is on when the account holds the `debugMode` feature *and* this
 * device has switched it on. The switch is a cookie rather than a column so
 * that turning it on on the phone that misbehaves leaves every other device as
 * it was, and so the server knows the answer when it renders, with no flash of
 * the normal page first. Holding the feature is checked too, so a cookie left
 * behind after a revoke does nothing.
 */

import { type FeatureKey, hasFeature } from './features';

export const DEBUG_COOKIE = 'debug';

/** The cookie's value while debug mode is on; it is deleted when off. */
export const DEBUG_COOKIE_ON = '1';

export function debugModeOn(features: readonly FeatureKey[], cookie: string | undefined): boolean {
	return cookie === DEBUG_COOKIE_ON && hasFeature(features, 'debugMode');
}
