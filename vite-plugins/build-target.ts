/**
 * Which platform `vite build` produces a server for.
 *
 * `cloudflare` (the default) is the Workers bundle that `wrangler deploy` and
 * Cloudflare's deploy-on-push expect, so a bare `npm run build` stays exactly
 * what it was. `node` is the adapter-node server the Docker image runs.
 *
 * Read from the environment rather than a CLI flag because two separate
 * configs need it — `svelte.config.js` picks the adapter, `vite.config.ts`
 * picks the plugins and defines `__SELF_HOSTED__` — and neither can see the
 * other's arguments. Both import this, so they cannot disagree. Plain,
 * erasable TypeScript only: `svelte.config.js` is loaded by Node directly,
 * which strips types but compiles nothing.
 */
export type BuildTarget = 'cloudflare' | 'node';

export function buildTarget(env: Record<string, string | undefined> = process.env): BuildTarget {
	const value = env.BUILD_TARGET;
	if (value === undefined || value === '' || value === 'cloudflare') {
		return 'cloudflare';
	}
	if (value === 'node') {
		return 'node';
	}
	// Loud rather than defaulting: a typo in the Dockerfile would otherwise
	// build a Workers bundle into the image, which fails only at runtime.
	throw new Error(`BUILD_TARGET must be "cloudflare" or "node", not "${value}".`);
}
