import { APIError } from 'better-auth/api';
import { expect, test, vi } from 'vitest';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import { actions, load } from './+page.server';

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

/**
 * The action calls Better Auth directly, not through its HTTP endpoints, so
 * nothing but this check limits password guessing through the form.
 */
const credentials = { email: 'ada@example.test', authSecret: 'a'.repeat(43) };

test('refuses a sign-in over the rate limit without asking Better Auth', async () => {
	const signInEmail = vi.fn();
	const authRateLimit = vi.fn(() => Promise.resolve({ allowed: false, retryAfterSeconds: 42 }));
	const result = await runAction(
		actions,
		'default',
		fakeEvent({
			path: '/login',
			formData: credentials,
			authApi: { signInEmail },
			authRateLimit
		})
	);
	expect(authRateLimit).toHaveBeenCalledWith('sign-in');
	expect(signInEmail).not.toHaveBeenCalled();
	expect(result).toMatchObject({
		status: 429,
		data: { form: { errors: { _errors: ['Too many attempts. Try again in 42 seconds.'] } } }
	});
});

test('counts every sign-in attempt, and lets one under the limit through', async () => {
	const signInEmail = vi.fn(() => Promise.resolve({}));
	const authRateLimit = vi.fn(() => Promise.resolve({ allowed: true as const }));
	const result = await runAndCatch(() =>
		runAction(
			actions,
			'default',
			fakeEvent({ path: '/login', formData: credentials, authApi: { signInEmail }, authRateLimit })
		)
	);
	expect(authRateLimit).toHaveBeenCalledWith('sign-in');
	expect(signInEmail).toHaveBeenCalledOnce();
	expect(result).toMatchObject({ type: 'redirect', location: '/home' });
});

/**
 * An account cannot sign in until its address is confirmed. Better Auth only
 * says so after the password checked out, and has already sent a new link, so
 * the page says both.
 */
test('tells an unconfirmed account to open the link it was just sent', async () => {
	const signInEmail = vi.fn(() =>
		Promise.reject(
			new APIError('FORBIDDEN', { code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' })
		)
	);
	const result = await runAction(
		actions,
		'default',
		fakeEvent({ path: '/login', formData: credentials, authApi: { signInEmail } })
	);
	expect(result).toMatchObject({
		status: 403,
		data: {
			form: { errors: { _errors: [expect.stringMatching(/Confirm your email address first/)] } }
		}
	});
});

test('asks for the new link to come back to sign-in, keeping redirectTo', async () => {
	const signInEmail = vi.fn((_: { body: { callbackURL: string } }) => Promise.resolve({}));
	await runAndCatch(() =>
		runAction(
			actions,
			'default',
			fakeEvent({
				path: '/login?redirectTo=%2Finvite%2Fabc',
				formData: credentials,
				authApi: { signInEmail }
			})
		)
	);
	expect(signInEmail.mock.calls[0]?.[0].body.callbackURL).toBe(
		'/login?verified=1&redirectTo=%2Finvite%2Fabc'
	);
});

test('a wrong password is still the one generic message', async () => {
	const signInEmail = vi.fn(() =>
		Promise.reject(new APIError('UNAUTHORIZED', { code: 'INVALID_EMAIL_OR_PASSWORD' }))
	);
	const result = await runAction(
		actions,
		'default',
		fakeEvent({ path: '/login', formData: credentials, authApi: { signInEmail } })
	);
	expect(result).toMatchObject({
		data: { form: { errors: { _errors: ['Invalid email or password'] } } }
	});
});

/** Where the verification link lands, as Better Auth redirects it. */
test('says what became of a verification link', async () => {
	const at = async (path: string) => (await runLoad(load(fakeEvent({ path })))).verification;
	expect(await at('/login?verified=1')).toBe('verified');
	expect(await at('/login?verified=1&error=TOKEN_EXPIRED')).toBe('expired');
	expect(await at('/login?verified=1&error=INVALID_TOKEN')).toBe('invalid');
	expect(await at('/login')).toBeNull();
});
