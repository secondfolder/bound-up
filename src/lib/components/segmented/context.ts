import { getContext, setContext } from 'svelte';

/**
 * What a segmented control's options are drawn as, which is what they are:
 * native radios in a radiogroup, ARIA tabs over panels, or links in a nav.
 * See docs/segmented-controls.md.
 */
export type SegmentedKind = 'radio' | 'tab' | 'link';

/** What a `RadioButtonGroup` hands its `RadioButton`s. */
export type SegmentedGroup = {
	readonly kind: SegmentedKind;
	/** The native radios' name: the group's own, or one made up so arrow keys keep to this group. */
	readonly name: string;
	/** The chosen option: the group's value, or the first option while it has none. */
	readonly selected: string | undefined;
	/**
	 * Adds an option in the order it renders, so an unset group can fall back
	 * to the first. Called while the option initialises, which is before the
	 * option reads `selected` on the server as well as in the browser.
	 */
	register: (value: string) => () => void;
	/** Chooses an option, as a person did: the fill slides to it. */
	select: (value: string, options?: { focus?: boolean }) => void;
	/** The tab kind's arrow, Home and End keys, from the tab with focus. */
	keydown: (event: KeyboardEvent, from: string) => void;
};

const KEY = Symbol('segmented-group');

export function setSegmentedGroup(group: SegmentedGroup): void {
	setContext(KEY, group);
}

export function segmentedGroup(): SegmentedGroup {
	const group = getContext<SegmentedGroup | undefined>(KEY);
	if (!group) {
		throw new Error('A RadioButton was rendered outside a RadioButtonGroup');
	}
	return group;
}
