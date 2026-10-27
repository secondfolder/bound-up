// biome-ignore-all lint/style/noRestrictedImports: this is the one file allowed to import it.

import type { SubmitFunction } from '@sveltejs/kit';
import { enhance as kitEnhance } from '$app/forms';
import { invalidateAll } from './navigation';

type Result = Record<string, unknown> | undefined;

/** What a `SubmitFunction` may hand back: the callback that takes the answer. */
type AfterSubmit<Success extends Result, Failure extends Result> = Exclude<
	Awaited<ReturnType<SubmitFunction<Success, Failure>>>,
	void
>;

/**
 * SvelteKit's `use:enhance`, whose refresh never drops a navigation.
 *
 * Its `update()` refreshes the page with SvelteKit's own `invalidateAll`,
 * which abandons a navigation already under way: a link tapped while a save
 * was answering went nowhere. This one's `update()` does what SvelteKit's
 * does, in the same order — reset the form, refresh, apply the result — but
 * refreshes through `$lib/navigation`, which waits for the navigation to land
 * first. Its options are SvelteKit's.
 *
 * Every form imports `enhance` from here. Biome's `noRestrictedImports`
 * refuses SvelteKit's own anywhere else.
 */
export function enhance<Success extends Result, Failure extends Result>(
	form: HTMLFormElement,
	submit?: SubmitFunction<Success, Failure>
): ReturnType<typeof kitEnhance> {
	return kitEnhance<Success, Failure>(form, async (input) => {
		const callback: AfterSubmit<Success, Failure> | undefined =
			(await Promise.resolve(submit?.(input))) ?? undefined;
		return async (opts) => {
			const update: typeof opts.update = async ({
				reset = true,
				invalidateAll: refresh = true
			} = {}) => {
				if (opts.result.type === 'success') {
					if (reset) {
						// From the prototype, as SvelteKit does, so a field named
						// `reset` cannot clobber it.
						HTMLFormElement.prototype.reset.call(opts.formElement);
					}
					if (refresh) {
						await invalidateAll();
					}
				}
				// Applies the result, which SvelteKit leaves to a page the
				// navigation has not since left.
				await opts.update({ reset: false, invalidateAll: false });
			};
			await (callback ? callback({ ...opts, update }) : update());
		};
	});
}
