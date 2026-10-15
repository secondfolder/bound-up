import type { Handle, RequestEvent, ServerInit } from '@sveltejs/kit';
import { getSessionCookie } from 'better-auth/cookies';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building, dev } from '$app/environment';
import { env as privateEnv } from '$env/dynamic/private';
import { createAuth } from '$lib/server/auth';
import type { Db } from '$lib/server/db';
import { createDb, getLocalDb } from '$lib/server/db/backend';
import { createMailer, type Mailer, sendInBackground } from '$lib/server/mail';
import { readMailConfig } from '$lib/server/mail/config';
import { getLocalMediaStore } from '$lib/server/media/backend';
import {
	type AuthRateLimiter,
	authRateLimiter,
	bucketForAuthPath,
	emailRateLimiter,
	onceEach,
	rateLimitMessage,
	unlimited,
	unlimitedEmail
} from '$lib/server/rate-limit';

const AUTH_PATH_PREFIX = '/api/auth';

/**
 * The mailer, built the first time something is sent rather than on every
 * request.
 *
 * Built eagerly, a missing `MAIL_FROM` made every page a 500 — the landing
 * page and the roadmap included — and every request parsed the mail settings
 * for nothing. Built here, inside `send`, a bad setting rejects that send, and
 * `sendInBackground` logs it with the fix `readMailConfig` names. It must not
 * throw where the request can see it instead: only some addresses are sent
 * mail (an unconfirmed account, an account being recovered), so a send that
 * failed the response would tell a stranger which addresses have accounts.
 * The self-hosted server still checks the settings once at start-up (`init`).
 */
function lazyMailer(platform: App.Platform | undefined): Mailer {
	let built: Mailer | undefined;
	return {
		send(message) {
			try {
				built ??= createMailer(readMailConfig(platform));
			} catch (error) {
				return Promise.reject(error);
			}
			return built.send(message);
		}
	};
}

/**
 * Runs once when the server starts. Only the self-hosted Node build does
 * anything here: it checks the mail settings, and, having no cron trigger,
 * starts the media sweep that `scheduled.ts` is on Workers. `__SELF_HOSTED__` is a build-time constant, so
 * this is empty in the worker bundle and never runs under `vite dev`, which
 * keeps its behaviour as it was. See docs/self-hosting.md.
 */
export const init: ServerInit = async () => {
	if (__SELF_HOSTED__ && !building) {
		// Read once up front so a server with no way to send email refuses to
		// start, with the fix in the message, rather than answering every
		// request with it. Workers has no environment to read here (its
		// `platform.env` exists only inside a request), so there the check in
		// `handle` is the one that fires.
		readMailConfig(undefined);
		const { runMediaSweep, startMediaSweep } = await import('$lib/server/self-hosted/sweep');
		const db = await getLocalDb();
		const store = await getLocalMediaStore();
		startMediaSweep(() => runMediaSweep(db, store));
	}
};

export const handle: Handle = async ({ event, resolve }) => {
	// Bail before touching platform.env. During prerendering adapter-cloudflare
	// substitutes a platform whose env getters throw. svelteKitHandler also
	// short-circuits on `building`, but only after we would have dereferenced
	// the binding.
	if (building) {
		return resolve(event);
	}

	const db = await createDb(event);

	// Workers reads wrangler secrets from platform.env; dev has no platform
	// at all (svelte.config.js strips the adapter's emulate hook) and reads
	// .env instead, and the self-hosted server reads its process environment. Fail loudly: Better Auth otherwise falls back to a
	// hard-coded default secret, and its own check only throws when
	// NODE_ENV === 'production', which Workers does not set.
	const secret = event.platform?.env?.BETTER_AUTH_SECRET ?? privateEnv.BETTER_AUTH_SECRET;
	if (!secret) {
		throw new Error(
			'BETTER_AUTH_SECRET is not set. In development put it in .env ' +
				'(`npm run secrets -- dev` fills it in); on Workers run ' +
				'`npm run secrets -- production`, or `-- remote-preview` for branch ' +
				'previews; self-hosted, put it in the .env beside docker-compose.yml ' +
				'(docs/self-hosting.md shows the one command that writes it).'
		);
	}

	const mailer = lazyMailer(event.platform);
	const limitsOff = rateLimitsOff(event);
	const emailRateLimit = limitsOff ? unlimitedEmail : onceEach(emailRateLimiter(db, secret));

	const auth = createAuth(db, {
		secret,
		origin: event.url.origin,
		rpID: event.url.hostname,
		host: event.url.host,
		sendMail: (message, what, onlyIf) =>
			sendInBackground(event.platform, mailer, message, what, onlyIf),
		emailRateLimit
	});

	event.locals.db = db;
	event.locals.auth = auth;
	event.locals.mailer = mailer;
	event.locals.authRateLimit = limitsOff ? unlimited : rateLimiterFor(event, db, secret);
	event.locals.emailRateLimit = emailRateLimit;
	event.locals.session = null;
	event.locals.user = null;

	// Cheap gate: skip the session lookup entirely for anonymous traffic. The
	// public surface is now just /, /login and /signup — the guides moved under
	// /home when the app shell landed, so they sit behind the group guard.
	if (getSessionCookie(event.request)) {
		const result = await auth.api.getSession({ headers: event.request.headers });
		if (result) {
			event.locals.session = result.session;
			event.locals.user = result.user;
		}
	}

	// The `/api/auth` counterparts of the rate-limited form actions, counted in
	// the same buckets. Better Auth's own limiter is off (see auth.ts).
	const { pathname } = event.url;
	if (event.request.method === 'POST' && pathname.startsWith(`${AUTH_PATH_PREFIX}/`)) {
		const bucket = bucketForAuthPath(pathname.slice(AUTH_PATH_PREFIX.length));
		const limited = bucket ? await event.locals.authRateLimit(bucket) : null;
		if (limited && !limited.allowed) {
			// Better Auth's own error shape, so the auth client reports it as it
			// would any other refusal.
			return Response.json(
				{ code: 'TOO_MANY_REQUESTS', message: rateLimitMessage(limited.retryAfterSeconds) },
				{ status: 429, headers: { 'retry-after': String(limited.retryAfterSeconds) } }
			);
		}
	}

	// Serves /api/auth/* from auth.handler and otherwise falls through to
	// resolve, so no src/routes/api/auth/[...all]/+server.ts is needed.
	// Note: for auth requests `resolve` is never called.
	return svelteKitHandler({ auth, event, resolve, building });
};

/**
 * Whether the auth rate limits are off for this deployment.
 *
 * Off under `vite dev`, where every request comes from localhost and the e2e
 * suite signs up hundreds of accounts a minute, and wherever `AUTH_RATE_LIMIT`
 * is `off` — the Playwright suite against the Docker image, which is the same
 * situation, or an operator limiting at their proxy instead.
 */
function rateLimitsOff(event: RequestEvent): boolean {
	const setting = event.platform?.env?.AUTH_RATE_LIMIT ?? privateEnv.AUTH_RATE_LIMIT;
	return dev || setting === 'off';
}

/**
 * The sign-in rate limit for this request's client.
 *
 * The client is SvelteKit's `getClientAddress()`: `cf-connecting-ip` on
 * Workers, and on adapter-node the socket's peer unless `ADDRESS_HEADER` names
 * a header the proxy in front sets (docs/self-hosting.md). An adapter that
 * cannot say at all shares one bucket rather than going unlimited.
 */
function rateLimiterFor(event: RequestEvent, db: Db, secret: string): AuthRateLimiter {
	let address = 'unknown';
	try {
		address = event.getClientAddress();
	} catch {
		// Kept as the shared bucket above.
	}
	return authRateLimiter(db, secret, address);
}
