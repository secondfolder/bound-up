<script lang="ts">
	import SidePanelLayout from '$lib/components/SidePanelLayout.svelte';

	/**
	 * `SidePanelLayout` in a scroller of its own, as the app's `<main>` is,
	 * with a page and a panel to find. Which way the panel opens is the
	 * window's width, so a test sets that.
	 */
	let { storageKey, title = 'Ideas' }: { storageKey: string; title?: string } = $props();
</script>

<div class="scroller">
	<SidePanelLayout {title} icon="lightbulb" {storageKey}>
		{#snippet main()}
			<h1>Page</h1>
			<p class="page-words">The page.</p>
		{/snippet}
		{#snippet panel()}
			<p class="panel-words">The panel.</p>
		{/snippet}
	</SidePanelLayout>
</div>

<style>
	.scroller {
		display: flex;
		flex-direction: column;
		block-size: 30rem;
		overflow-y: auto;
		--side-panel-speed: 0s;
	}
</style>
