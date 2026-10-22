import {
	createEntryAction,
	loadNotebookList,
	showHiddenEntryAction
} from '$lib/server/notebook-pages';
import type { Actions, PageServerLoad } from './$types';

/**
 * A partnership's shared notebook. Both partners write in it by default; a
 * member who holds control can make an entry read-only or hidden for the
 * other. See docs/notebook.md.
 */
export const load: PageServerLoad = async (event) => ({
	...(await loadNotebookList(event, { kind: 'partnership', partnershipId: event.params.id })),
	partnershipId: event.params.id
});

export const actions: Actions = {
	create: (event) =>
		createEntryAction(event, { kind: 'partnership', partnershipId: event.params.id }),
	show: (event) =>
		showHiddenEntryAction(event, { kind: 'partnership', partnershipId: event.params.id })
};
