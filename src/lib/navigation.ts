// biome-ignore-all lint/style/noRestrictedImports: this is the one file allowed to import them.
import { invalidate as kitInvalidate, invalidateAll as kitInvalidateAll } from '$app/navigation';
import { navigating } from '$app/state';

/**
 * SvelteKit's `invalidate` and `invalidateAll`, which never drop a navigation.
 *
 * SvelteKit's own take over from a navigation already under way: they re-run
 * the page the navigation is leaving, and the navigation is abandoned when its
 * data arrives, with no error and nothing on the page to say so. So a link
 * tapped just after a save, while the save's refresh was still to come, went
 * nowhere — rewards' "Add a reward" after setting credits, seen under
 * `wrangler dev`, where an action answers slowly enough to land inside the
 * navigation. Anything else that refreshes by itself (a realtime event, a tab
 * coming back, a context switch while the nav is tapped) could do the same.
 *
 * These wait for the navigation to finish, then refresh the page it landed
 * on. Nothing is lost by waiting: the new page loads after whatever the
 * refresh was for had happened, and the refresh then re-runs its loads too,
 * so a layout the navigation kept (the list under a sheet) is brought up to
 * date as well. A navigation that starts after the refresh is no problem:
 * SvelteKit lets the navigation win and keeps the invalidation for it.
 *
 * Every refresh goes through here; Biome's `noRestrictedImports` refuses
 * SvelteKit's own anywhere else. `use:enhance` refreshes too, so it comes
 * from `$lib/enhance`. superforms calls SvelteKit's own after a submit that
 * does not redirect, which is the one refresh this does not reach. See
 * docs/contexts.md, "A refresh never drops a tap".
 */
export async function invalidate(resource: Parameters<typeof kitInvalidate>[0]): Promise<void> {
	await navigationSettled();
	await kitInvalidate(resource);
}

/** `invalidateAll`, after any navigation under way. See `invalidate` above. */
export async function invalidateAll(): Promise<void> {
	await navigationSettled();
	await kitInvalidateAll();
}

/**
 * Resolves once no navigation is under way, however the last one ended.
 *
 * A navigation that is abandoned stays in `navigating` until the next one
 * starts, its `complete` already rejected, so each promise is waited on once:
 * waiting on that one again would spin. One that replaced it is waited on in
 * its turn.
 */
export async function navigationSettled(): Promise<void> {
	let waited: Promise<void> | null = null;
	for (;;) {
		const pending = navigating.complete;
		if (!pending || pending === waited) {
			return;
		}
		waited = pending;
		try {
			await pending;
		} catch {
			// Cancelled or abandoned: whatever took over is checked next.
		}
	}
}
