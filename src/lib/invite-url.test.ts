import { expect, test } from 'vitest';
import { invitePath, inviteUrl } from './invite-url';

test('builds the invite path from the token', () => {
	expect(invitePath('abc123')).toBe('/invite/abc123');
});

test('escapes a token so base64url padding or slashes cannot alter the path', () => {
	expect(invitePath('a/b+c=')).toBe('/invite/a%2Fb%2Bc%3D');
});

test('builds an absolute URL on the given origin', () => {
	expect(inviteUrl('https://app.example', invitePath('abc123'))).toBe(
		'https://app.example/invite/abc123'
	);
});

test('works on a non-default port, as local dev uses', () => {
	expect(inviteUrl('http://localhost:5173', invitePath('abc'))).toBe(
		'http://localhost:5173/invite/abc'
	);
});
