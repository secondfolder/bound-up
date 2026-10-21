import { describe, expect, it } from 'vitest';
import { errorCopy } from './error-page';

describe('errorCopy', () => {
	it('names the common statuses in words, not codes', () => {
		expect(errorCopy(403).title).toBe('Not for this account');
		expect(errorCopy(404).title).toBe('Nothing here');
		expect(errorCopy(401).title).toBe('Sign in to see this');
		expect(errorCopy(429).title).toBe('Slow down a moment');
	});

	it('falls back to a general message for anything else, server errors included', () => {
		expect(errorCopy(500).title).toBe('Something went wrong');
		expect(errorCopy(418).title).toBe('Something went wrong');
	});

	it('never puts a status code in the heading', () => {
		for (const status of [400, 401, 403, 404, 409, 429, 500, 502, 503]) {
			expect(errorCopy(status).title).not.toMatch(/\d/);
		}
	});
});
