import { describe, expect, it } from 'vitest';
import { redirectTargetOrHome, safeRedirect } from './safe-redirect';

describe('safeRedirect', () => {
	it('accepts an ordinary in-app path', () => {
		expect(safeRedirect('/invite/abc123')).toBe('/invite/abc123');
		expect(safeRedirect('/home?x=1#y')).toBe('/home?x=1#y');
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

	it('rejects a bare relative path', () => {
		expect(safeRedirect('home')).toBeNull();
		expect(safeRedirect('../home')).toBeNull();
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

describe('redirectTargetOrHome', () => {
	it('passes a safe path through', () => {
		expect(redirectTargetOrHome('/invite/abc')).toBe('/invite/abc');
	});

	it('falls back to /home for anything else', () => {
		expect(redirectTargetOrHome('//evil.example')).toBe('/home');
		expect(redirectTargetOrHome(null)).toBe('/home');
	});
});
