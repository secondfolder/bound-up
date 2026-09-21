import type { Db } from '../server/db';
import type { TestUser } from './fixtures';

/**
 * A stand-in `RequestEvent` for calling a `load` or an action directly.
 *
 * Route modules are tested by invoking their exported functions rather than
 * over HTTP: it is the same code SvelteKit runs, minus a server boot, and it
 * keeps a failure pointing at the action rather than at the plumbing. The full
 * HTTP path — cookies, the auth hook, real redirects — is what the Playwright
 * suite is for.
 *
 * Only the fields the partner routes touch are populated. Anything else is left
 * off deliberately, so a route that starts depending on it fails loudly here
 * instead of silently reading `undefined`.
 */

export type FakeEventOptions = {
	db: Db;
	user?: TestUser | null;
	params?: Record<string, string>;
	/** Path plus query. Resolved against `origin`. */
	path?: string;
	origin?: string;
	/** Body for an action. Values are sent as a real multipart FormData. */
	formData?: Record<string, string>;
	/**
	 * Body for an API endpoint, sent as real JSON.
	 *
	 * The `+server.ts` routes read `request.json()` rather than FormData — they
	 * are driven by fetch from the browser, not by a form — so they need a
	 * request that actually parses. `null` sends a body that does not, which is
	 * how the "malformed request" branches get exercised.
	 */
	json?: unknown;
	/**
	 * A stand-in for `locals.auth.api`, for routes that do call Better Auth.
	 *
	 * Only the handful of endpoints a route under test actually invokes need to
	 * be present. Anything else stays absent so that reaching for it is a loud
	 * failure rather than a confusing `undefined` — the same reason `auth`
	 * throws by default. Booting the real thing is not an option: it needs a
	 * live request context for `sveltekitCookies`.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	authApi?: Record<string, (...args: any[]) => unknown>;
};

// The route modules are typed against SvelteKit's `RequestEvent`, which carries
// far more than any of them reads. Returning `any` keeps the cast in one place
// instead of repeating it at every call site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fakeEvent(options: FakeEventOptions): any {
	const origin = options.origin ?? 'https://app.test';
	const url = new URL(options.path ?? '/', origin);

	let request: Request;
	if ('json' in options) {
		request = new Request(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: options.json === undefined ? 'not json' : JSON.stringify(options.json)
		});
	} else if (options.formData) {
		const body = new FormData();
		for (const [key, value] of Object.entries(options.formData)) body.append(key, value);
		request = new Request(url, { method: 'POST', body });
	} else {
		request = new Request(url);
	}

	const locals: Record<string, unknown> = {
		db: options.db,
		user: options.user ?? null,
		session: null
	};

	if (options.authApi) {
		locals.auth = { api: options.authApi };
	} else {
		// The partners routes call no Better Auth endpoint, so by default reaching
		// for it should be an obvious failure rather than a confusing `undefined`.
		//
		// `defineProperty` and not a getter in an object literal that gets spread:
		// spreading an object *invokes* its getters, so the throwing version fired
		// during construction and every test blew up before touching the route.
		Object.defineProperty(locals, 'auth', {
			enumerable: true,
			configurable: true,
			get(): never {
				throw new Error('fakeEvent does not provide locals.auth — pass `authApi`');
			}
		});
	}

	return {
		url,
		params: options.params ?? {},
		request,
		locals,
		// A no-op, unlike the rest of this object. `depends()` only registers an
		// invalidation key with the router, which has no meaning outside a real
		// navigation — but a load that calls it would otherwise crash here, and
		// failing a route test over cache plumbing teaches nobody anything.
		depends: () => {}
		// `parent()` IS left off deliberately: a load that reads parent data is
		// reading something the test has to decide, so it should fail loudly
		// until the test says what the parent returned.
	};
}

/**
 * Calls a `load` and drops the `void` from SvelteKit's return type.
 *
 * `PageServerLoad` is declared as returning `T | void` so that a load may
 * legitimately return nothing. Every load here does return something, but
 * TypeScript cannot know that at the call site, and without this every property
 * access in a test is an error.
 */
export async function runLoad<T>(result: T | void | Promise<T | void>): Promise<T> {
	const data = await result;
	if (data === undefined) throw new Error('load returned nothing');
	return data;
}

/**
 * Runs a load/action and normalises the two ways SvelteKit signals a redirect
 * or an error: both are thrown, and both are objects rather than Errors.
 */
export async function runAndCatch<T>(
	fn: () => T | Promise<T>
): Promise<
	| { type: 'ok'; value: T }
	| { type: 'redirect'; status: number; location: string }
	| { type: 'error'; status: number; message: string }
> {
	try {
		return { type: 'ok', value: await fn() };
	} catch (thrown) {
		const candidate = thrown as { status?: number; location?: string; body?: { message?: string } };
		if (typeof candidate?.status === 'number' && typeof candidate.location === 'string') {
			return { type: 'redirect', status: candidate.status, location: candidate.location };
		}
		if (typeof candidate?.status === 'number' && candidate.body) {
			return { type: 'error', status: candidate.status, message: candidate.body.message ?? '' };
		}
		throw thrown;
	}
}
