import { dev } from '$app/environment';
import { requirePornRelay } from './binding';
import { isRelayable } from './hosts';

/**
 * Where the relay runs: Western Europe. Read only when the object is first
 * made; after that it stays wherever it was made. See `./durable-object.ts`.
 */
export const RELAY_LOCATION = 'weur';

/** The fictional origin of a stub request, as in `realtime/remote.ts`. */
const RELAY_ORIGIN = 'https://porn-relay.invalid';

/**
 * A `fetch` that sends requests for the hosts in `RELAYED_HOSTS` through the
 * relay, and everything else straight out through `fallback`.
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
	const namespace = requirePornRelay(platform);
	const relay = namespace.get(namespace.idFromName(RELAY_LOCATION), {
		locationHint: RELAY_LOCATION
	});
	return (input, init) => {
		const target = input instanceof Request ? input.url : String(input);
		if (!isRelayable(target)) {
			return fallback(input, init);
		}
		return relay.fetch(`${RELAY_ORIGIN}/?${new URLSearchParams({ url: target })}`, {
			headers: init?.headers
		});
	};
}
