import { describe, expect, it } from 'vitest';
import { FEATURE_KEYS, FEATURES, hasFeature, isFeatureKey } from './features';

describe('isFeatureKey', () => {
	it('accepts every registered feature', () => {
		for (const key of FEATURE_KEYS) {
			expect(isFeatureKey(key)).toBe(true);
		}
	});

	it('rejects a key the registry no longer has', () => {
		expect(isFeatureKey('retired-feature')).toBe(false);
	});

	it('rejects inherited object properties', () => {
		// `in` would say yes to these; a row holding one must not pass.
		expect(isFeatureKey('toString')).toBe(false);
		expect(isFeatureKey('__proto__')).toBe(false);
	});
});

describe('hasFeature', () => {
	it('is true only for a feature in the list', () => {
		expect(hasFeature(['guides'], 'guides')).toBe(true);
		expect(hasFeature([], 'guides')).toBe(false);
	});
});

describe('FEATURE_KEYS', () => {
	it('lists exactly the registry', () => {
		expect([...FEATURE_KEYS].sort()).toEqual(Object.keys(FEATURES).sort());
	});
});
