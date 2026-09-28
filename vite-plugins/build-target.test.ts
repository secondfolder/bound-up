import { describe, expect, it } from 'vitest';
import { buildTarget } from './build-target';

describe('buildTarget', () => {
	it('defaults to Cloudflare, so a bare `npm run build` is unchanged', () => {
		expect(buildTarget({})).toBe('cloudflare');
		expect(buildTarget({ BUILD_TARGET: '' })).toBe('cloudflare');
		expect(buildTarget({ BUILD_TARGET: 'cloudflare' })).toBe('cloudflare');
	});

	it('selects the Node server for the Docker image', () => {
		expect(buildTarget({ BUILD_TARGET: 'node' })).toBe('node');
	});

	it('refuses anything else rather than silently building for Workers', () => {
		expect(() => buildTarget({ BUILD_TARGET: 'nodejs' })).toThrow(/BUILD_TARGET/);
	});
});
