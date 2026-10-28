<script lang="ts">
	import Tab from '$lib/components/tabs/Tab.svelte';
	import TabGroup from '$lib/components/tabs/TabGroup.svelte';
	import TabPanel from '$lib/components/tabs/TabPanel.svelte';

	/**
	 * Test-only wrapper: `TabGroup` takes its tabs and panels as snippets,
	 * which cannot be handed to `render()` as plain props. Each event is
	 * written out as a line, so a test can read them in order.
	 */
	let { counts = [3, 1], active = $bindable() }: { counts?: number[]; active?: 'mine' | 'theirs' } =
		$props();
	let events = $state<string[]>([]);
</script>

<TabGroup
	label="Whose tasks"
	bind:active
	ontabshow={(name) => events.push(`show ${name}`)}
	ontabhide={(name) => events.push(`hide ${name}`)}
>
	{#snippet nav()}
		<Tab panel="mine" count={counts[0]}>For you</Tab>
		<Tab panel="theirs" count={counts[1]}>For Jun</Tab>
	{/snippet}
	<TabPanel name="mine"><p>Panel mine</p><input aria-label="Kept" /></TabPanel>
	<TabPanel name="theirs"><p>Panel theirs</p></TabPanel>
</TabGroup>
<output>{active ?? 'none'}</output>
<ol>
	{#each events as happened, index (index)}<li>{happened}</li>{/each}
</ol>
