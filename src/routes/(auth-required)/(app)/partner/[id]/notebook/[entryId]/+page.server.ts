import { deleteEntryAction, loadNotebookEntry, setAccessAction } from '$lib/server/notebook-pages';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
	...(await loadNotebookEntry(event, { kind: 'partnership', partnershipId: event.params.id })),
	partnershipId: event.params.id
});

export const actions: Actions = {
	setAccess: (event) =>
		setAccessAction(event, { kind: 'partnership', partnershipId: event.params.id }),
	delete: (event) =>
		deleteEntryAction(event, { kind: 'partnership', partnershipId: event.params.id })
};
