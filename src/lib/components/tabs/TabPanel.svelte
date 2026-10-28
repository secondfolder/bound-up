<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tabGroup } from './context';

	/** One panel in a `TabGroup`, as `wa-tab-panel`: shown while the `Tab` whose `panel` is `name` is chosen. */
	let { name, children }: { name: string; children: Snippet } = $props();

	const group = tabGroup();
</script>

<div
	role="tabpanel"
	class="tab-panel"
	id={group.panelId(name)}
	aria-labelledby={group.tabId(name)}
	hidden={group.active !== name}
>
	{@render children()}
</div>

<style>
	.tab-panel {
		padding-block-start: var(--wa-space-m);
	}
</style>
