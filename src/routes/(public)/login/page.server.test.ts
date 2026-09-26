import { expect, test } from 'vitest';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import { load } from './+page.server';

/**
 * Only the redirectTo plumbing is covered here — it is what carries an invite
 * across sign-in. The sign-in itself goes through Better Auth and is exercised
 * end to end by the Playwright suite.
 */

const user = {
	id: 'u1',
	name: 'Ada',
	email: 'ada@example.test',
	image: null,
	timezone: 'UTC',
	role: 'user'
};

test('offers a validated redirectTo to the page', async () => {
	const data = await runLoad(load(fakeEvent({ path: '/login?redirectTo=%2Finvite%2Fabc' })));
	expect(data.redirectTo).toBe('/invite/abc');
});

test('drops a redirectTo that would leave the site', async () => {
	// Otherwise the login page would render an attacker-supplied link.
	const data = await runLoad(load(fakeEvent({ path: '/login?redirectTo=//evil.example' })));
	expect(data.redirectTo).toBeNull();
});

test('sends an already-signed-in visitor straight on to their destination', async () => {
	const result = await runAndCatch(() =>
		load(fakeEvent({ user, path: '/login?redirectTo=%2Finvite%2Fabc' }))
	);
	expect(result).toMatchObject({ type: 'redirect', location: '/invite/abc' });
});

test('sends an already-signed-in visitor home when there is nowhere to go back to', async () => {
	const result = await runAndCatch(() => runLoad(load(fakeEvent({ user, path: '/login' }))));
	expect(result).toMatchObject({ type: 'redirect', location: '/home' });
});

test('refuses to bounce a signed-in visitor off-site', async () => {
	const result = await runAndCatch(() =>
		load(fakeEvent({ user, path: '/login?redirectTo=https%3A%2F%2Fevil.example' }))
	);
	expect(result).toMatchObject({ type: 'redirect', location: '/home' });
});

/**
 * `reason=device` is the app sending someone back because their browser lost
 * its key. It is passed on so the storage explanation can follow the sign-in,
 * and anything else is ignored rather than trusted.
 */
test('passes on the one reason it knows, and nothing else', async () => {
	const sent = await runLoad(load(fakeEvent({ path: '/login?reason=device' })));
	expect(sent.reason).toBe('device');

	const ordinary = await runLoad(load(fakeEvent({ path: '/login' })));
	expect(ordinary.reason).toBeNull();

	const made = await runLoad(load(fakeEvent({ path: '/login?reason=%3Cscript%3E' })));
	expect(made.reason).toBeNull();
});
