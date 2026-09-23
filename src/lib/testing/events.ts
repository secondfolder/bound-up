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
	/**
	 * Left out by tests whose route never touches the database; reaching for
	 * `locals.db` then fails loudly, the same way `locals.auth` does.
	 */
	db?: Db;
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
	// `never[]` parameters: every function is assignable to this, whatever it
	// takes, which is what a bag of stubs for different endpoints needs.
	authApi?: Record<string, (...args: never[]) => unknown>;
	/** `event.fetch`, for a route that calls out through it. Absent otherwise. */
	fetch?: typeof fetch;
	/**
	 * What `parent()` resolves to. Without it `parent` is absent, so a load that
	 * reads its layout's data fails until the test says what that data is.
	 */
	parentData?: Record<string, unknown>;
};

/**
 * The route modules are typed against SvelteKit's `RequestEvent`, which carries
 * far more than any of them reads, so the fake is cast once here rather than at
 * every call site.
 *
 * `Event` is inferred from where the result is passed — `load(fakeEvent(…))`
 * gets exactly that load's event type. Where nothing says (a helper that
 * builds one for later), it falls back to `never`: that is assignable to any
 * route's event, like `any` would be, but cannot be read from, since a test
 * poking at the fake is testing the fake rather than the route.
 */
export function fakeEvent<Event = never>(options: FakeEventOptions): Event {
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
		for (const [key, value] of Object.entries(options.formData)) {
			body.append(key, value);
		}
		request = new Request(url, { method: 'POST', body });
	} else {
		request = new Request(url);
	}

	const locals: Record<string, unknown> = {
		user: options.user ?? null,
		session: null
	};
	if (options.db) {
		locals.db = options.db;
	} else {
		Object.defineProperty(locals, 'db', {
			enumerable: true,
			configurable: true,
			get(): never {
				throw new Error('fakeEvent was given no db — pass `db` for a route that queries');
			}
		});
	}

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

	const event = {
		url,
		params: options.params ?? {},
		request,
		locals,
		// A no-op, unlike the rest of this object. `depends()` only registers an
		// invalidation key with the router, which has no meaning outside a real
		// navigation — but a load that calls it would otherwise crash here, and
		// failing a route test over cache plumbing teaches nobody anything.
		...(options.fetch ? { fetch: options.fetch } : {}),
		...(options.parentData ? { parent: () => Promise.resolve(options.parentData) } : {}),
		depends: () => undefined
	};
	return event as unknown as Event;
}

/**
 * Runs one of a route's form actions by name, the action counterpart of
 * `runLoad`.
 *
 * SvelteKit types a route's `actions` as a record of actions that may return
 * nothing, so every result would need narrowing before a test could read it.
 * An action under test always returns something — the test is about what — so
 * the `void` is dropped here once instead of cast away in every file.
 */
export async function runAction<
	Actions extends Record<string, (event: never) => unknown>,
	Name extends keyof Actions & string
>(
	actions: Actions,
	name: Name,
	event: Parameters<Actions[Name]>[0]
): Promise<Exclude<Awaited<ReturnType<Actions[Name]>>, void>> {
	const action = actions[name] as (event: Parameters<Actions[Name]>[0]) => unknown;
	return (await action(event)) as Exclude<Awaited<ReturnType<Actions[Name]>>, void>;
}

/**
 * Calls a `load` and drops the `void` from SvelteKit's return type.
 *
 * `PageServerLoad` is declared as returning `T | void` so that a load may
 * legitimately return nothing. Every load here does return something, but
 * TypeScript cannot know that at the call site, and without this every property
 * access in a test is an error.
 */
export async function runLoad<Data>(result: Data | Promise<Data>): Promise<Exclude<Data, void>> {
	const data = await result;
	if (data === undefined) {
		throw new Error('load returned nothing');
	}
	return data as Exclude<Data, void>;
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
		// Anything can be thrown, `null` included — hence the optional chaining.
		const candidate = thrown as
			| { status?: number; location?: string; body?: { message?: string } }
			| null
			| undefined;
		if (typeof candidate?.status === 'number' && typeof candidate.location === 'string') {
			return { type: 'redirect', status: candidate.status, location: candidate.location };
		}
		if (typeof candidate?.status === 'number' && candidate.body) {
			return { type: 'error', status: candidate.status, message: candidate.body.message ?? '' };
		}
		throw thrown;
	}
}
