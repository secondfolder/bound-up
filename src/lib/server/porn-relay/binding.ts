import type { DurableObjectIdLike } from '../realtime/binding';

/**
 * The relay's Durable Object namespace, from `event.platform`. Hand-declared
 * for the reason `realtime/binding.ts` gives, and only as wide as the calls
 * made on it.
 */
export type PornRelayNamespace = {
	idFromName: (name: string) => DurableObjectIdLike;
	get: (
		id: DurableObjectIdLike,
		options?: { locationHint?: string }
	) => { fetch: (input: string, init?: RequestInit) => Promise<Response> };
};

/** Fails naming the fix, rather than with `Cannot read properties of undefined`. */
export function requirePornRelay(platform: App.Platform | undefined): PornRelayNamespace {
	if (!platform?.env?.PORN_RELAY) {
		throw new Error(
			'The Durable Object binding "PORN_RELAY" is unavailable. This code path ' +
				'only runs on Cloudflare Workers. Check that wrangler.jsonc has a ' +
				'durable_objects binding named "PORN_RELAY" pointing at the ' +
				'"PornRelay" class, both at the top level and under `previews`, that ' +
				'the top-level `exports` map declares it, and that the ' +
				'`sveltekit-cloudflare-do` plugin in vite.config.ts lists ' +
				'src/lib/server/porn-relay/durable-object.ts. `npm run dev` never ' +
				'reads this: it fetches directly.'
		);
	}
	return platform.env.PORN_RELAY;
}
