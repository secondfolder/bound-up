import { getContext, setContext } from 'svelte';
import type { KinkListStore } from './store.svelte';

/**
 * What every kink-list screen needs from the page around it: the list, and
 * where its other screens are. The same screens run signed in
 * (`/playroom/kink-list/…`) and signed out (`/kink-list/…`), so links between
 * them come from here rather than from a hard-coded route.
 */
export type KinkListPaths = {
	home: string;
	category: (categoryId: string) => string;
	quick: string;
	transfer: string;
	/** Only your own list, signed in, keeps a history. */
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
