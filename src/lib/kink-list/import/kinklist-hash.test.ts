import { describe, expect, it } from 'vitest';
import { decodeKinklistHash, encodeKinklistHash } from './kinklist-hash';
import fixtures from './kinklist-hash.fixtures.json' with { type: 'json' };

/**
 * The fixtures were made by running the sites' own `encode` and `decode` in
 * Node. Their encoder drops zero digits inside a chunk, so a link does not
 * always hold exactly what was picked: the site shows whatever its `decode`
 * makes of it, and so must an import. That is what these pin.
 */
describe('the KinkList hash', () => {
	for (const { levels, values, hash, decoded } of fixtures.cases) {
		it(`decodes as the sites do (${levels} levels, ${values.length} answers)`, () => {
			expect(decodeKinklistHash(hash, levels)).toEqual(decoded);
		});

		it(`encodes as the sites do (${levels} levels, ${values.length} answers)`, () => {
			expect(encodeKinklistHash(values, levels)).toBe(hash);
		});
	}

	it('refuses characters no list writes', () => {
		expect(decodeKinklistHash('#abc def', 6)).toBeNull();
		expect(decodeKinklistHash('', 6)).toBeNull();
	});
});
