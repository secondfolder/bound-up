/**
 * A stand-in for `$app/paths` in component tests:
 * `vi.mock('$app/paths', () => import('$lib/testing/app-paths'))`.
 *
 * `resolve()` needs the generated route manifest, which a bare component render
 * does not have, so it just fills the params into the route id.
 *
 * It exports more than `resolve` because SvelteKit's own client runtime imports
 * `base` from here, and anything that reaches it — superforms does, through
 * `$app/navigation` — needs the name to exist. Under jsdom a missing export was
 * quietly `undefined`; a real browser refuses to link the module at all, with
 * "does not provide an export named …". One shared module rather than a factory
 * in every file is what stops the copies drifting on that.
 */
export const base = '';
export const assets = '';

export function resolve(id: string, params?: Record<string, string>): string {
	return params ? id.replace(/\[(\w+)\]/g, (_, key) => params[key]) : id;
}
