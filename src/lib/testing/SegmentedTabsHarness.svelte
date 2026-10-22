<script lang="ts">
	import SegmentedTabs from '$lib/components/SegmentedTabs.svelte';

	/**
	 * Test-only wrapper: `SegmentedTabs` takes its panels as a snippet, which
	 * cannot be handed to `render()` as a plain prop.
	 */
	let { counts = [3, 1] }: { counts?: number[] } = $props();
	let value = $state<'mine' | 'theirs' | undefined>();
</script>

<SegmentedTabs
	label="Whose tasks"
	tabs={[
		{ id: 'mine', label: 'For you', count: counts[0] },
		{ id: 'theirs', label: 'For Jun', count: counts[1] }
	]}
	bind:value
>
	{#snippet panel(id)}<p>Panel {id}</p>{/snippet}
</SegmentedTabs>
<output>{value ?? 'none'}</output>
