<script lang="ts" generics="Name extends string">
	import type { Snippet } from 'svelte';
	import RadioButtonGroup from '$lib/components/segmented/RadioButtonGroup.svelte';
	import { setTabGroup } from './context';

	/**
	 * Tabs over panels, Web Awesome's `wa-tab-group` API drawn as our
	 * segmented pill rather than underlined tabs: `nav` is `slot="nav"`,
	 * `Tab`'s `panel` and `TabPanel`'s `name` pair them, and `ontabshow` /
	 * `ontabhide` are `wa-tab-show` / `wa-tab-hide`. See
	 * docs/segmented-controls.md.
	 *
	 * Every panel stays rendered and the others are `hidden`, so a panel keeps
	 * its state (an open detail, a completion in flight, a half-typed entry)
	 * when the tab changes.
	 */
	let {
		label,
		active = $bindable(),
		ontabshow,
		ontabhide,
		nav,
		children
	}: {
		/** What the tabs choose between, for a screen reader: "Whose tasks". */
		label: string;
		/** The shown panel; the first tab's while unset. */
		active?: Name;
		/** A person chose a tab. */
		ontabshow?: (name: Name) => void;
		/** The tab a person left. */
		ontabhide?: (name: Name) => void;
		/** The `Tab`s. */
		nav: Snippet;
		/** The `TabPanel`s. */
		children: Snippet;
	} = $props();

	const uid = $props.id();
	/** Tabs in render order; plain, as `RadioButtonGroup`'s is. */
	const order: string[] = [];
	const current = () => active ?? order[0];

	function show(name: Name) {
		const previous = current();
		active = name;
		if (previous !== undefined && previous !== name) {
			ontabhide?.(previous as Name);
		}
		ontabshow?.(name);
	}

	setTabGroup({
		get active() {
			return current();
		},
		register(panel) {
			order.push(panel);
			return () => {
				const index = order.indexOf(panel);
				if (index !== -1) {
					order.splice(index, 1);
				}
			};
		},
		tabId: (panel) => `${uid}-tab-${panel}`,
		panelId: (panel) => `${uid}-panel-${panel}`
	});
</script>

<div class="tab-group">
	<RadioButtonGroup kind="tab" {label} hideLabel fill value={active} onchange={show}>
		{@render nav()}
	</RadioButtonGroup>
	{@render children()}
</div>
