import { getContext, setContext } from 'svelte';

/** What a `TabGroup` hands its `Tab`s and `TabPanel`s. */
export type TabGroupContext = {
	/** The shown panel's name: the group's `active`, or the first tab's while that is unset. */
	readonly active: string | undefined;
	/** Adds a tab in render order, so an unset group can show the first. */
	register: (panel: string) => () => void;
	tabId: (panel: string) => string;
	panelId: (panel: string) => string;
};

const KEY = Symbol('tab-group');

export function setTabGroup(group: TabGroupContext): void {
	setContext(KEY, group);
}

export function tabGroup(): TabGroupContext {
	const group = getContext<TabGroupContext | undefined>(KEY);
	if (!group) {
		throw new Error('A Tab or TabPanel was rendered outside a TabGroup');
	}
	return group;
}
