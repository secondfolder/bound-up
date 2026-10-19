import { getContext, setContext } from 'svelte';
import type { SearchView } from './answers';
import type { KinkListStore } from './store.svelte';

/**
 * What every kink-list screen needs from the page around it: the list, and
 * where its other screens are. The same screens run signed in
 * (`/playroom/kink-list/…`) and signed out (`/kink-list/…`), so links between
 * them come from here rather than from a hard-coded route.
 */
export type KinkListPaths = {
	home: string;
	quick: string;
	transfer: string;
	/** Only your own list, signed in, keeps a history; and only once a version has been kept. */
	history?: string;
};

export type KinkListContext = {
	store: KinkListStore;
	paths: KinkListPaths;
};

const KEY = Symbol('kink-list');

export function setKinkListContext(context: KinkListContext): void {
	setContext(KEY, context);
}

export function kinkListContext(): KinkListContext {
	const context = getContext<KinkListContext | undefined>(KEY);
	if (!context) {
		throw new Error('A kink-list screen was rendered outside a kink-list layout');
	}
	return context;
}

/**
 * The search on the list page, for the categories and rows under it to
 * narrow themselves by. Absent on screens without a search, which show
 * everything the filters do.
 */
export type KinkListSearch = {
	readonly query: string;
	readonly view: SearchView | null;
};

const SEARCH_KEY = Symbol('kink-list-search');

export function setKinkListSearch(search: KinkListSearch): void {
	setContext(SEARCH_KEY, search);
}

export function kinkListSearch(): KinkListSearch | undefined {
	return getContext<KinkListSearch | undefined>(SEARCH_KEY);
}
