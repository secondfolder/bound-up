/**
 * The sites the relay fetches for, by exact hostname. Alias-free: the
 * Durable Object imports it (see `./durable-object.ts`).
 *
 * A site goes here when it refuses the requests a Worker makes from where
 * its visitor is, as PMVHaven refuses Australia. One that serves everyone
 * needs no relay and should not go through one: every relayed request is a
 * billed Durable Object request and a trip to Europe.
 */
export const RELAYED_HOSTS: readonly string[] = ['pmvhaven.com'];

/**
 * How long, in seconds, the relay may keep a successful response. Set by the
 * caller, because only the caller knows how fast its pages change; a request
 * without it is never cached.
 */
export const MAX_AGE_HEADER = 'x-relay-max-age';

/** An https URL on one of `RELAYED_HOSTS`, with no credentials or port. */
export function isRelayable(target: string): boolean {
	let url: URL;
	try {
		url = new URL(target);
	} catch {
		return false;
	}
	return (
		url.protocol === 'https:' &&
		url.username === '' &&
		url.password === '' &&
		url.port === '' &&
		RELAYED_HOSTS.includes(url.hostname)
	);
}
