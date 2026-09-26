import { createD1Db } from './db';
import { sweepExpiredMedia } from './media/expiry';
import { createR2Store } from './media/r2';

/**
 * The worker's cron handler: `triggers.crons` in wrangler.jsonc.
 *
 * **This file is an alias-free zone**, for the reason `realtime/durable-object.ts`
 * is: SvelteKit's adapter generates the worker entry and has no hook for a
 * `scheduled` handler, so a plugin in vite.config.ts attaches this one to the
 * generated worker after the build, and wrangler's esbuild — which resolves no
 * `$lib`, `$env` or `$app` — bundles it from there. Every import here, and in
 * everything it imports, must be relative.
 *
 * Built per invocation, never cached at module level (invariant 2): the D1 and
 * R2 bindings arrive with the event, exactly as they do with a request.
 *
 * Declared structurally rather than with @cloudflare/workers-types, for the
 * ambient-globals reason `app.d.ts` gives.
 */
export function scheduled(
	_controller: { cron: string; scheduledTime: number },
	env: Pick<App.Platform['env'], 'DB' | 'MEDIA'>,
	ctx: { waitUntil: (promise: Promise<unknown>) => void }
): void {
	ctx.waitUntil(
		sweepExpiredMedia(createD1Db(env.DB), createR2Store(env.MEDIA)).then((purged) => {
			if (purged > 0) {
				console.info(`self-destructed ${purged} attachment(s)`);
			}
		})
	);
}
