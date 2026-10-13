import { isRelayable, MAX_AGE_HEADER } from './hosts';

/**
 * Fetches pages from adult sites that refuse the visitor's country, from
 * somewhere that does not, and keeps what it fetched for as long as the
 * caller says it stays good.
 *
 * PMVHaven answers every request from an Australian address with
 * `451 Not available in Australia`, and France gets the same. A Worker's
 * subrequests leave from the data centre that took the visitor's request, so
 * for anyone in Australia the Worker itself is "in Australia". A Durable
 * Object runs in one place, chosen when it is first made, and its subrequests
 * leave from there. Which country within a region it lands in is not ours to
 * choose, which is why `./index.ts` has several to fall back on.
 *
 * **The cache is why the object is worth having beyond its location.** Every
 * isolate of every data centre goes through this one object, so a page cached
 * here is fetched once rather than once per isolate. It is SQLite, not memory:
 * an idle object is evicted within minutes, and its memory with it. Only a
 * `200` is kept, for `x-relay-max-age` seconds; a caller that sends none gets
 * nothing cached. Expired rows are swept on every write, so it holds only what
 * is still good.
 *
 * **Not an open proxy.** Only a GET to a host in `RELAYED_HOSTS` is passed on,
 * with only the two headers the callers set, and no redirect is followed;
 * anything else is a 403 without a request being made. Callers already build
 * every URL from fixed searches and ids in their own index, so this is a
 * second fence, not the first.
 *
 * **An alias-free zone**, for the reason `realtime/durable-object.ts` gives:
 * wrangler's esbuild bundles it from the export `sveltekit-cloudflare-do`
 * appends to the generated worker, and resolves none of SvelteKit's aliases.
 * Classic `(state, env)` style for the same reason as that one, with the
 * storage it uses declared by hand below.
 */

/** As much of `SqlStorage` as is used. See `realtime/binding.ts` for why it is hand-declared. */
type Sql = {
	exec: <Row extends Record<string, string | number | null>>(
		query: string,
		...bindings: unknown[]
	) => { toArray: () => Row[] };
};

/** All that callers set, and all that is passed on. */
const FORWARDED_HEADERS = ['user-agent', 'accept'] as const;

/**
 * Larger bodies are relayed but not kept. A row holds at most 2 MB, and the
 * pages relayed today are a few hundred KB.
 */
const MAX_CACHED_CHARS = 1_000_000;

export class PornRelay {
	readonly #sql: Sql;

	constructor(state: { storage: { sql: Sql } }) {
		this.#sql = state.storage.sql;
		this.#sql.exec(
			`CREATE TABLE IF NOT EXISTS pages (
				url TEXT PRIMARY KEY,
				content_type TEXT NOT NULL,
				body TEXT NOT NULL,
				expires_at INTEGER NOT NULL
			)`
		);
	}

	async fetch(request: Request): Promise<Response> {
		const target = new URL(request.url).searchParams.get('url');
		if (request.method !== 'GET' || target === null || !isRelayable(target)) {
			return new Response('Not a relayed URL', { status: 403 });
		}

		const now = Date.now();
		const [hit] = this.#sql
			.exec<{ content_type: string; body: string }>(
				'SELECT content_type, body FROM pages WHERE url = ? AND expires_at > ?',
				target,
				now
			)
			.toArray();
		if (hit) {
			return new Response(hit.body, {
				headers: { 'content-type': hit.content_type, 'x-relay-cache': 'hit' }
			});
		}

		const headers = new Headers();
		for (const name of FORWARDED_HEADERS) {
			const value = request.headers.get(name);
			if (value !== null) {
				headers.set(name, value);
			}
		}
		const response = await fetch(target, { headers, redirect: 'manual' });
		const maxAge = Number(request.headers.get(MAX_AGE_HEADER));
		if (response.status !== 200 || !(Number.isFinite(maxAge) && maxAge > 0)) {
			// Passed back whole, status included, so a refusal reads as one and
			// `./index.ts` can try another region. Rewrapped: a fetched
			// response's headers are immutable.
			return new Response(response.body, response);
		}

		const body = await response.text();
		const contentType = response.headers.get('content-type') ?? 'text/plain';
		if (body.length <= MAX_CACHED_CHARS) {
			this.#sql.exec('DELETE FROM pages WHERE expires_at <= ?', now);
			this.#sql.exec(
				'INSERT OR REPLACE INTO pages (url, content_type, body, expires_at) VALUES (?, ?, ?, ?)',
				target,
				contentType,
				body,
				now + maxAge * 1000
			);
		}
		return new Response(body, {
			headers: { 'content-type': contentType, 'x-relay-cache': 'miss' }
		});
	}
}
