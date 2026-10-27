import { describe, expect, it } from 'vitest';
import { redirectTargetOrToday, safeRedirect } from './safe-redirect';

describe('safeRedirect', () => {
	it('accepts an ordinary in-app path', () => {
		expect(safeRedirect('/invite/abc123')).toBe('/invite/abc123');
		expect(safeRedirect('/today?x=1#y')).toBe('/today?x=1#y');
	});

	it('rejects an absolute URL', () => {
		expect(safeRedirect('https://evil.example/steal')).toBeNull();
		expect(safeRedirect('http://evil.example')).toBeNull();
		expect(safeRedirect('javascript:alert(1)')).toBeNull();
	});

	it('rejects a protocol-relative URL', () => {
		// Browsers read both of these as "go to evil.example", even though they
		// start with a slash — this is the case a naive startsWith('/') misses.
		expect(safeRedirect('//evil.example/steal')).toBeNull();
		expect(safeRedirect('/\\evil.example/steal')).toBeNull();
	});

	it('rejects a path the browser would read as protocol-relative', () => {
		// The URL parser strips tabs and newlines before it reads a Location,
		// so each of these becomes `//evil.example`.
		expect(safeRedirect('/\t/evil.example/steal')).toBeNull();
		expect(safeRedirect('/\n/evil.example/steal')).toBeNull();
		expect(safeRedirect('/\r/evil.example/steal')).toBeNull();
		expect(safeRedirect(decodeURIComponent('%2F%09%2Fevil.example'))).toBeNull();
	});

	it('rejects any other control character', () => {
		expect(safeRedirect('/today\u0000')).toBeNull();
		expect(safeRedirect('/today\u007f')).toBeNull();
	});

	it('rejects a bare relative path', () => {
		expect(safeRedirect('today')).toBeNull();
		expect(safeRedirect('../today')).toBeNull();
	});

	it('treats nothing as nothing', () => {
		expect(safeRedirect(null)).toBeNull();
		expect(safeRedirect(undefined)).toBeNull();
		expect(safeRedirect('')).toBeNull();
	});

	it('allows a lone slash', () => {
		expect(safeRedirect('/')).toBe('/');
	});
});

describe('redirectTargetOrToday', () => {
	it('passes a safe path through', () => {
		expect(redirectTargetOrToday('/invite/abc')).toBe('/invite/abc');
	});

	it('falls back to /today for anything else', () => {
		expect(redirectTargetOrToday('//evil.example')).toBe('/today');
		expect(redirectTargetOrToday(null)).toBe('/today');
	});
});
