import { dev } from '$app/environment';
import type { Notifier } from './index';

let localNotifier: Notifier | undefined;

/**
 * Returns the request's notifier.
 *
 * Workers fans out through a Durable Object over
 * `event.platform.env.REALTIME`. Local dev and the self-hosted Node build use
 * a module-level `Map` — which is why self-hosting is single-replica — so
 * `npm run dev` needs no Cloudflare account — the same arrangement
 * `db/backend.ts` and `media/backend.ts` make, and for the same reason:
 * `svelte.config.js` strips the adapter's `emulate` hook, so `vite dev` has no
 * `platform` at all.
 *
 * Deliberately NOT placed on `event.locals` like `db` is. Five handlers out of
 * roughly forty need it, and `locals` is built for every single request.
 */
export async function createNotifier(event: {
	platform?: App.Platform | undefined;
}): Promise<Notifier> {
	// `dev` and `__SELF_HOSTED__` are build-time constants, so this branch —
	// and with it the whole module-level Map — is dead-code-eliminated from the
	// worker bundle.
	if (dev || __SELF_HOSTED__) {
		if (!localNotifier) {
			const { createLocalNotifier } = await import('./local');
			localNotifier = createLocalNotifier();
		}
		// A module-level cache is safe ONLY because this is the local backend,
		// where there is one process and the Map genuinely is shared state. The
		// Durable Object path below stays strictly per-request, since the binding
		// does.
		return localNotifier;
	}

	const { createDurableObjectNotifier } = await import('./remote');
	const { requireRealtime } = await import('./binding');
	return createDurableObjectNotifier(requireRealtime(event.platform));
}

export type { Notifier } from './index';
