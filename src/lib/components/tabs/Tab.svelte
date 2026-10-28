<script lang="ts">
	import { onDestroy, type Snippet, untrack } from 'svelte';
	import RadioButton from '$lib/components/segmented/RadioButton.svelte';
	import { tabGroup } from './context';

	/** One tab in a `TabGroup`'s `nav`, as `wa-tab`: `panel` names the `TabPanel` it shows. */
	let {
		panel,
		disabled = false,
		count,
		children
	}: {
		panel: string;
		disabled?: boolean;
		/** A number in a badge beside the label: how many are in the panel. */
		count?: number | null;
		children: Snippet;
	} = $props();

	const group = tabGroup();
	onDestroy(group.register(untrack(() => panel)));
</script>

<RadioButton value={panel} id={group.tabId(panel)} controls={group.panelId(panel)} {disabled} {count}>
	{@render children()}
</RadioButton>
