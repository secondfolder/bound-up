import { deleteEntryAction, loadNotebookEntry, setAccessAction } from '$lib/server/notebook-pages';
import type { Actions, PageServerLoad } from './$types';

/** One entry, in its own space whatever the context is. See docs/notebook.md. */
export const load: PageServerLoad = (event) => loadNotebookEntry(event);

export const actions: Actions = {
	setAccess: (event) => setAccessAction(event),
	delete: (event) => deleteEntryAction(event)
};
