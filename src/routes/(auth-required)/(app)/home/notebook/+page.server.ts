import { createEntryAction, loadNotebookList } from '$lib/server/notebook-pages';
import type { Actions, PageServerLoad } from './$types';

/** Your own notebook. Everything in it is sealed to your own vault. See docs/notebook.md. */
export const load: PageServerLoad = (event) => loadNotebookList(event, { kind: 'self' });

export const actions: Actions = {
	create: (event) => createEntryAction(event, { kind: 'self' })
};
