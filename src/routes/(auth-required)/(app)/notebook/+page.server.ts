import {
	createEntryAction,
	loadNotebookList,
	showHiddenEntryAction
} from '$lib/server/notebook-pages';
import type { Actions, PageServerLoad } from './$types';

/**
 * The notebook, in the current context: your own, one partnership's, or
 * every one you are in at once. See docs/notebook.md and docs/contexts.md.
 */
export const load: PageServerLoad = (event) => loadNotebookList(event);

export const actions: Actions = {
	create: (event) => createEntryAction(event),
	show: (event) => showHiddenEntryAction(event)
};
