const encoder = new TextEncoder();

export function hex(bytes: ArrayBuffer): string {
	return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * A keyed hash, for storing something guessable — an email, a client address —
 * in a form only this deployment can match against.
 *
 * Keyed with the auth secret rather than plain SHA-256: an IPv4 address and a
 * typical email are guessable, so an unkeyed hash of either is reversible by
 * anyone holding the table. Keyed, a leaked table says nothing on its own.
 * `purpose` keeps one use's hashes from being matched against another's.
 *
 * Relative imports only (none, today): the rate limit's pruning runs from
 * `scheduled.ts`, which wrangler bundles without SvelteKit's aliases.
 */
export async function keyedHash(secret: string, purpose: string, value: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`${purpose}|${value}`)));
}
