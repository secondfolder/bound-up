/**
 * How much each tab of the IQ test's media dock shows, by the room it has.
 *
 * A tab is as wide as its contents, so it cannot measure the space it is
 * allowed — the page measures the dock instead, shares it between the tabs,
 * and picks a layout from that. Alias-free and pure, so the steps are tested
 * without a browser.
 */

/**
 * What a tab shows.
 *
 * - `title`: the full title (the hypno's track name), a single word
 *   ("Hypno"), or none.
 * - `detail`: progress over the total, just what is left, or none.
 * - `slider`: the volume slider beside the mute toggle.
 * - `action`: the tab's one action — New porn, the hypno's Next — with its label,
 *   as an icon alone, or not in the tab at all.
 */
export type TabLayout = {
	title: 'full' | 'short' | null;
	detail: 'full' | 'short' | null;
	slider: boolean;
	action: 'label' | 'icon' | null;
};

/**
 * Widest first, each with the narrowest room, in CSS pixels per tab, at which
 * it still fits: a little over the widest tab measured at that layout in
 * Chromium, which is the hypno tab with a long track name — 643px in full,
 * 484 with a one-word title, 393 with the action as an icon, 226 with the
 * slider gone and the time short, about the same again with the title gone,
 * and 122 at the last. That last needs no minimum: the icon, the mute toggle
 * and the button that opens the panel.
 */
export const TAB_LAYOUTS: readonly (readonly [minWidth: number, layout: TabLayout])[] = [
	[660, { title: 'full', detail: 'full', slider: true, action: 'label' }],
	[500, { title: 'short', detail: 'full', slider: true, action: 'label' }],
	[410, { title: 'short', detail: 'full', slider: true, action: 'icon' }],
	[260, { title: 'short', detail: 'short', slider: false, action: 'icon' }],
	[240, { title: null, detail: 'short', slider: false, action: 'icon' }],
	[0, { title: null, detail: null, slider: false, action: null }]
];

/** The narrowest a tab gets: icon, mute toggle and the panel button. */
export const MINIMAL_LAYOUT: TabLayout = { title: null, detail: null, slider: false, action: null };

/**
 * The settings tab, collapsed, each a little over its width measured in
 * Chromium: its icon, the fullscreen button and the button that opens it,
 * with padding — the button as an icon (124px), and labelled ("Exit
 * fullscreen", the longer of its two labels: 239px).
 */
export const SETTINGS_TAB_WIDTH = 124;
export const SETTINGS_TAB_LABELLED_WIDTH = 250;
/**
 * With the intensity slider too (`IntensitySlider`'s compact control, its
 * mark and its margins, 176px, and a gap): the button as an icon (306px),
 * and labelled (423px).
 */
export const SETTINGS_TAB_SLIDER_WIDTH = 320;
export const SETTINGS_TAB_SLIDER_LABELLED_WIDTH = 440;

/** The gap between the tabs, in CSS pixels: `.dock-tabs`' gap. */
export const DOCK_GAP = 8;

/** The layout for a tab given the room it has, in CSS pixels. */
export function layoutFor(room: number): TabLayout {
	return TAB_LAYOUTS.find(([min]) => room >= min)?.[1] ?? MINIMAL_LAYOUT;
}

/**
 * The room each media tab gets: the dock, less the settings tab if there is
 * one, shared between the media tabs with the gaps between them all taken off.
 */
export function roomPerTab(dockWidth: number, mediaTabs: number, settingsWidth: number): number {
	const count = Math.max(1, mediaTabs);
	const fixed = settingsWidth > 0 ? settingsWidth + DOCK_GAP : 0;
	return (dockWidth - fixed - DOCK_GAP * (count - 1)) / count;
}

/** The settings tab's bar: never a title, detail or slider, only its icon and its action. */
const SETTINGS_BAR = { title: null, detail: null, slider: false } as const;

/**
 * Every tab's layout at once. The settings tab's fullscreen button matches
 * the media tabs' actions, Next and New porn: all labelled, or all icons.
 *
 * Where the settings have an intensity slider (`withSlider`: during the
 * questions, not on the results), the settings tab sheds as the dock
 * narrows: the fullscreen button's label first, then the slider, leaving the
 * icon button. Both only while every media tab still has its widest layout
 * beside it (bar its action, which is an icon once the settings' is), so
 * neither is at the media tabs' expense. That makes the label the first
 * thing to go, and the media tabs' labels go with it, to match.
 *
 * With no slider, the fullscreen button is labelled when the media tabs'
 * actions all fit labelled beside it, and with no media tabs, when it fits.
 */
export function dockLayouts(
	dockWidth: number,
	mediaTabs: number,
	withSettings: boolean,
	withSlider = true
): { media: TabLayout; settings: TabLayout } {
	if (!withSettings) {
		return { media: layoutFor(roomPerTab(dockWidth, mediaTabs, 0)), settings: MINIMAL_LAYOUT };
	}
	/** Whether a settings tab this wide leaves every media tab at its widest. */
	const roomBeside = (settingsWidth: number) =>
		mediaTabs === 0
			? dockWidth >= settingsWidth
			: roomPerTab(dockWidth, mediaTabs, settingsWidth) >= (TAB_LAYOUTS[0]?.[0] ?? 0);
	const iconsOnly = (layout: TabLayout): TabLayout =>
		layout.action === 'label' ? { ...layout, action: 'icon' } : layout;

	if (withSlider) {
		if (roomBeside(SETTINGS_TAB_SLIDER_LABELLED_WIDTH)) {
			return {
				media: layoutFor(roomPerTab(dockWidth, mediaTabs, SETTINGS_TAB_SLIDER_LABELLED_WIDTH)),
				settings: { ...SETTINGS_BAR, slider: true, action: 'label' }
			};
		}
		if (roomBeside(SETTINGS_TAB_SLIDER_WIDTH)) {
			return {
				media: iconsOnly(layoutFor(roomPerTab(dockWidth, mediaTabs, SETTINGS_TAB_SLIDER_WIDTH))),
				settings: { ...SETTINGS_BAR, slider: true, action: 'icon' }
			};
		}
	} else {
		const labelled = layoutFor(roomPerTab(dockWidth, mediaTabs, SETTINGS_TAB_LABELLED_WIDTH));
		const fits =
			mediaTabs === 0 ? dockWidth >= SETTINGS_TAB_LABELLED_WIDTH : labelled.action === 'label';
		if (fits) {
			return { media: labelled, settings: { ...SETTINGS_BAR, action: 'label' } };
		}
	}
	// Not room for every action labelled: all of them icons, so the three
	// match, even where the media tabs alone could have kept their labels.
	return {
		media: iconsOnly(layoutFor(roomPerTab(dockWidth, mediaTabs, SETTINGS_TAB_WIDTH))),
		settings: { ...SETTINGS_BAR, action: 'icon' }
	};
}

/**
 * Whether a tab already shows everything its panel would: the porn tab, once
 * its slider (if it has sound) and its labelled action both fit, has nothing
 * left to open a panel for.
 */
export function showsEverything(layout: TabLayout, hasSound: boolean): boolean {
	return layout.action === 'label' && (layout.slider || !hasSound);
}
