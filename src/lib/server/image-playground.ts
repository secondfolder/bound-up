import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { requireAdmin } from '$lib/server/admin';
import { requireFeature } from '$lib/server/features';

/**
 * Who may use the picture playground (docs/debug-mode.md, "Picture
 * playground"): an admin with debug mode. Debug mode because it is a tool,
 * and admin because every picture is drawn on the server's own Runware key.
 */
export async function requirePlayground(locals: App.Locals): Promise<void> {
	if (!locals.user) {
		error(401, 'Sign in to use the picture playground.');
	}
	requireAdmin(locals);
	await requireFeature(locals.db, locals.user.id, 'debugMode');
}

/**
 * Whether this server keeps the playground's history: only one with a disk
 * of its own (dev, self-hosted). Build-time constants, so on Workers the
 * history module, and `node:fs` with it, is never imported.
 */
export const KEEPS_PLAYGROUND_HISTORY = dev || __SELF_HOSTED__;

/** The history module, or null on a server that keeps none. */
export async function playgroundHistory() {
	if (dev || __SELF_HOSTED__) {
		return await import('$lib/server/image-playground-history');
	}
	return null;
}
