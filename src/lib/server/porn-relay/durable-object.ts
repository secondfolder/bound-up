import { isRelayable } from './hosts';

/**
 * Fetches pages from adult sites that refuse Australia, from somewhere that
 * is not Australia.
 *
 * PMVHaven answers every request from an Australian address with
 * `451 Not available in Australia`. A Worker's subrequests leave from the
 * data centre that took the visitor's request, so for anyone in Australia the
 * Worker itself is "in Australia" and every search came back empty. A Durable
 * Object runs in one place, chosen by the `locationHint` it was first made
 * with (`RELAY_LOCATION` in `./index.ts`), and its subrequests leave from
 * there.
 *
 * **Not an open proxy.** Only a GET to a host in `RELAYED_HOSTS` is passed on,
 * and only the two headers the callers set; anything else is a 403 without a
 * request being made. Callers already build every URL themselves from fixed
 * searches and ids in their own index, so this is a second fence, not the
 * first.
 *
 * **An alias-free zone**, for the reason `realtime/durable-object.ts` gives:
 * wrangler's esbuild bundles it from the export `sveltekit-cloudflare-do`
 * appends to the generated worker, and resolves none of SvelteKit's aliases.
 * Classic `fetch` style for the same reason as that one, too. It holds no
 * storage and no state, so it can be discarded at any time.
 */
export class PornRelay {
	// No constructor: the runtime passes `(state, env)`, and this object needs
	// neither.

	// biome-ignore lint/nursery/useThisInClassMethods: the runtime calls `fetch` on an instance; a stateless object has nothing on `this`.
	async fetch(request: Request): Promise<Response> {
		const target = new URL(request.url).searchParams.get('url');
		if (request.method !== 'GET' || target === null || !isRelayable(target)) {
			return new Response('Not a relayed URL', { status: 403 });
		}
		const headers = new Headers();
		for (const name of FORWARDED_HEADERS) {
			const value = request.headers.get(name);
			if (value !== null) {
				headers.set(name, value);
			}
		}
		const response = await fetch(target, { headers, redirect: 'manual' });
		// Passed back whole, status included, so a caller sees a refusal as one
		// rather than as an empty page. Rewrapped: a fetched response's headers
		// are immutable, and the stub hands it on to code that may not expect that.
		return new Response(response.body, response);
	}
}

/** All that callers set, and all that is passed on. */
const FORWARDED_HEADERS = ['user-agent', 'accept'] as const;
