import { dev } from '$app/environment';

/**
 * The last way out: a Cloudflare Tunnel to a machine of our own ("darcy"),
 * reached through a Workers VPC service per host, for when a host refuses
 * every address a Worker or the relay can send from.
 *
 * Why it exists: Redgifs is itself behind Cloudflare, so every Worker and
 * Durable Object anywhere reaches it from one shared address
 * (`2a06:98c0:3600::103`), and its search rate limit is keyed to that address.
 * With every other Worker on the internet spending it, it was refused nearly
 * always (measured 2026-10-13, from the Worker and from relays in six regions
 * alike). Through the tunnel the request leaves from darcy's own address and
 * is answered. PMVHaven has one too, as a last resort should every relay
 * region be refused.
 *
 * **A fallback, not the route.** darcy is one machine that can be off, and
 * every request through it spends its own allowance, so a request goes the
 * usual way first and only a refusal (`FALLBACK_STATUSES`) or a thrown fetch
 * sends it here. Then the host *stays* here for `STICKY_MS`: a Redgifs token
 * is bound to the address that fetched it ("WrongSender" from any other), so
 * the token and the searches that use it have to take the same route.
 *
 * Each VPC service names one host, so a host needs its own service and
 * binding: `npx wrangler vpc service create <name> --type http
 * --tunnel-id <darcy's tunnel id> --hostname <host> --https-port 443`, then
 * a `vpc_services` entry in wrangler.jsonc, top level and `previews` both.
 */
export const TUNNELLED_HOSTS = {
	'api.redgifs.com': 'TUNNEL_REDGIFS',
	'pmvhaven.com': 'TUNNEL_PMVHAVEN'
} as const;

type TunnelBinding = (typeof TUNNELLED_HOSTS)[keyof typeof TUNNELLED_HOSTS];

/** A Workers VPC service binding: as much of one as is used. */
export type TunnelService = {
	fetch: (input: string, init?: RequestInit) => Promise<Response>;
};

/** What sends a request to the tunnel: refused for who we are, or rate-limited. */
const FALLBACK_STATUSES = new Set([403, 429, 451]);

/** How long a host that refused the usual route is sent straight to the tunnel. */
export const STICKY_MS = 30 * 60 * 1000;

/**
 * Hosts on the tunnel, until when. Per isolate; public data only, like the
 * other caches here (invariant 2).
 */
const tunnelUntil = new Map<string, number>();

/**
 * `primary`, with the tunnel behind it for the hosts in `TUNNELLED_HOSTS`.
 *
 * Only on Workers, and only for a binding that exists: `vite dev` and the
 * self-hosted build send from their own address and have no Cloudflare in
 * the way, so they need none of this.
 */
export function withTunnelFallback(
	platform: App.Platform | undefined,
	primary: typeof fetch
): typeof fetch {
	if (dev || __SELF_HOSTED__ || !platform) {
		return primary;
	}
	return tunnelThrough((binding) => platform.env[binding], primary);
}

/** The fallback itself, apart so tests can hand it bindings. */
export function tunnelThrough(
	bindingFor: (binding: TunnelBinding) => TunnelService | undefined,
	primary: typeof fetch,
	now: () => number = Date.now
): typeof fetch {
	return async (input, init) => {
		const target = input instanceof Request ? input.url : String(input);
		const host = hostOf(target);
		const tunnel = host === null ? undefined : bindingFor(TUNNELLED_HOSTS[host]);
		if (host === null || tunnel === undefined) {
			return primary(input, init);
		}
		if (now() < (tunnelUntil.get(host) ?? 0)) {
			try {
				return await tunnel.fetch(target, init);
			} catch (error) {
				// darcy is off or unreachable: the usual route is still worth a try.
				console.error(`The tunnel to ${host} failed`, error);
				tunnelUntil.delete(host);
				return primary(input, init);
			}
		}

		let response: Response | null = null;
		try {
			response = await primary(input, init);
			if (!FALLBACK_STATUSES.has(response.status)) {
				return response;
			}
		} catch (error) {
			console.error(`${host} failed the usual way; trying the tunnel`, error);
		}
		try {
			const tunnelled = await tunnel.fetch(target, init);
			tunnelUntil.set(host, now() + STICKY_MS);
			await response?.body?.cancel();
			return tunnelled;
		} catch (error) {
			console.error(`The tunnel to ${host} failed`, error);
			if (response === null) {
				throw error;
			}
			return response;
		}
	};
}

function hostOf(target: string): keyof typeof TUNNELLED_HOSTS | null {
	let hostname: string;
	try {
		({ hostname } = new URL(target));
	} catch {
		return null;
	}
	return Object.hasOwn(TUNNELLED_HOSTS, hostname)
		? (hostname as keyof typeof TUNNELLED_HOSTS)
		: null;
}

/** Start every host on the usual route again. Tests only. */
export function resetTunnel(): void {
	tunnelUntil.clear();
}
