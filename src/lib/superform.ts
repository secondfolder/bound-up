// biome-ignore lint/style/noRestrictedImports: this is the one file allowed to import it.
import { superForm as baseSuperForm } from 'sveltekit-superforms';
import { reportRequestFailure } from '$lib/request-failure.svelte';

/**
 * superforms' `superForm`, with a failure that shows.
 *
 * Its default `onError` rethrows the error, so a 500 from an action, or a
 * submit that never reaches the server, ends up in the console and nowhere on
 * the page. This one reports it to the app-wide notice instead (see
 * `$lib/request-failure.svelte.ts`). A form that passes its own `onError` still
 * gets its own.
 *
 * Every form imports `superForm` from here. Biome's `noRestrictedImports`
 * refuses the library's own export anywhere else, so a new form cannot quietly
 * go back to silent failures.
 */
export const superForm: typeof baseSuperForm = (form, options) =>
	baseSuperForm(form, {
		onError: ({ result }) => reportRequestFailure(result),
		...options
	});
