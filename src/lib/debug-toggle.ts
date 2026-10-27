import type { SubmitFunction } from '@sveltejs/kit';
import { reportRequestFailure } from '$lib/request-failure.svelte';
import { invalidateAll } from './navigation';

/**
 * `use:enhance` for a form posting to `/settings?/debug`: the settings switch
 * and the bottom nav's corner button. See docs/debug-mode.md.
 *
 * Not enhance's default `update()`: the nav's form posts from whatever page is
 * open, and `update()` would apply the action's result to *that* page's
 * `page.form`, which belongs to the page's own forms. Re-running the loads is
 * all that is needed — the layout reads the new cookie into `page.data.debug`.
 */
export const submitDebugToggle: SubmitFunction =
	() =>
	async ({ result }) => {
		if (result.type === 'success') {
			await invalidateAll();
			return;
		}
		reportRequestFailure(result);
	};
