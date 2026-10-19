import { describe, expect, it } from 'vitest';
import { DEBUG_COOKIE_ON, debugModeOn } from './debug';

describe('debugModeOn', () => {
	it('needs both the feature and this device switched on', () => {
		expect(debugModeOn(['debugMode'], DEBUG_COOKIE_ON)).toBe(true);
		expect(debugModeOn(['debugMode'], undefined)).toBe(false);
		expect(debugModeOn([], DEBUG_COOKIE_ON)).toBe(false);
		expect(debugModeOn(['guides', 'daydreams'], DEBUG_COOKIE_ON)).toBe(false);
	});

	it('reads any other cookie value as off', () => {
		expect(debugModeOn(['debugMode'], '0')).toBe(false);
		expect(debugModeOn(['debugMode'], 'true')).toBe(false);
	});
});
