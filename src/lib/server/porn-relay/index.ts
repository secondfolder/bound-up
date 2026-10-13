import { dev } from '$app/environment';
import { requirePornRelay } from './binding';
import { isRelayable } from './hosts';

/**
 * Where relays are made, in the order they are tried. A location hint names a
 * region, not a country, and an object lands in whichever country of it
 * Cloudflare chooses: measured on 2026-10-13, the first `weur` object landed in
 * France, which PMVHaven refuses as well, while a second one did not. So a
 * `451` from one moves on to the next. Each is one object, kept where it was
 * first made, so the order only matters the first time.
 */
export const RELAY_LOCATIONS = ['weur', 'eeur', 'enam', 'wnam'] as const;

/** The fictional origin of a stub request, as in `realtime/remote.ts`. */
const RELAY_ORIGIN = 'https://porn-relay.invalid';

/**
 * Which relay last answered with anything but a 451, so an isolate pays for
 * a refusal at most once per relay. Public data only, like the indexes in
 * `playroom-pmv.ts`, so a module-level value is safe (invariant 2).
 */
let working = 0;

/**
 * A `fetch` that sends requests for the hosts in `RELAYED_HOSTS` through the
 * relay, and everything else straight out through `fallback`. A caller sets
 * `MAX_AGE_HEADER` to let the relay keep what it fetched.
 *
 * Only on Workers. `vite dev` and the self-hosted Node build fetch directly
 * from wherever they run — which, for a server in Australia, means PMVHaven
 * refuses them as it refused the Worker. `dev` and `__SELF_HOSTED__` are
 * build-time constants, so the relay is all that is left in the worker bundle.
 */
export function relayedFetch(
	platform: App.Platform | undefined,
	fallback: typeof fetch
): typeof fetch {
	if (dev || __SELF_HOSTED__) {
		return fallback;
	}
	return relayThrough(requirePornRelay(platform), fallback);
}

/** The relayed `fetch` itself, apart so tests can hand it a namespace. */
export function relayThrough(
	namespace: ReturnType<typeof requirePornRelay>,
	fallback: typeof fetch
): typeof fetch {
	return async (input, init) => {
		const target = input instanceof Request ? input.url : String(input);
		if (!isRelayable(target)) {
			return fallback(input, init);
		}
		const url = `${RELAY_ORIGIN}/?${new URLSearchParams({ url: target })}`;
		let response: Response | null = null;
		for (let tried = 0; tried < RELAY_LOCATIONS.length; tried += 1) {
			const index = (working + tried) % RELAY_LOCATIONS.length;
			const location = RELAY_LOCATIONS[index];
			response = await namespace
				.get(namespace.idFromName(location), { locationHint: location })
				.fetch(url, { headers: init?.headers });
			if (response.status !== 451) {
				working = index;
				return response;
			}
			await response.body?.cancel();
		}
		// Every relay refused: the last refusal, so the caller sees why.
		return response ?? fallback(input, init);
	};
}

/** Start again from the first relay. Tests only. */
export function resetRelay(): void {
	working = 0;
}
