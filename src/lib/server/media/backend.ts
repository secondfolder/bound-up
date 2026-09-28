import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { MediaStore } from './index';
import type { LocalMediaStore } from './local';

let localStore: LocalMediaStore | undefined;

/**
 * Returns the request's media store.
 *
 * Workers uses R2 over `event.platform.env.MEDIA`. Local dev and the
 * self-hosted Node build write to a plain directory — `MEDIA_DIR`, a Docker
 * volume in the image — so `npm run dev` needs no Cloudflare account — the same
 * arrangement `db/backend.ts` makes for the database, and for the same reason:
 * `svelte.config.js` strips the adapter's `emulate` hook, so `vite dev` has no
 * `platform` at all.
 *
 * Deliberately NOT placed on `event.locals` like `db` is. Three handlers out of
 * roughly forty need it, and `locals` is built for every single request.
 */
export async function createMediaStore(event: {
	platform?: App.Platform | undefined;
}): Promise<MediaStore> {
	// `dev` and `__SELF_HOSTED__` are build-time constants, so this branch —
	// and with it the whole `node:fs` import — is dead-code-eliminated from the
	// worker bundle.
	if (dev || __SELF_HOSTED__) {
		return await getLocalMediaStore();
	}

	const { createR2Store } = await import('./r2');
	const { requireR2 } = await import('./platform');
	return createR2Store(requireR2(event.platform));
}

/**
 * The one local store for this process. Exported for the self-hosted media
 * sweep, which runs outside any request (see `self-hosted/sweep.ts`). Only
 * ever called behind `dev || __SELF_HOSTED__`.
 */
export async function getLocalMediaStore(): Promise<LocalMediaStore> {
	if (!localStore) {
		const { createLocalStore } = await import('./local');
		localStore = createLocalStore(env.MEDIA_DIR || './local-media');
	}
	// A module-level cache is safe ONLY because this is the local backend, one
	// Node process over one directory; the R2 path above stays strictly
	// per-request, since the binding does.
	return localStore;
}

export type { MediaStore } from './index';
