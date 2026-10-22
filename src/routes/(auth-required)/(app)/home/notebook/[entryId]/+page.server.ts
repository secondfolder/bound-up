import { deleteEntryAction, loadNotebookEntry } from '$lib/server/notebook-pages';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => loadNotebookEntry(event, { kind: 'self' });

export const actions: Actions = {
	delete: (event) => deleteEntryAction(event, { kind: 'self' })
};
