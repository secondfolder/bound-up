<script lang="ts">
	import MediaTab from '$lib/components/iq-test/MediaTab.svelte';
	import { MINIMAL_LAYOUT } from '$lib/playroom/iq-test/dock';

	/**
	 * An expanded `MediaTab` whose content renders nothing, as the hypno's does
	 * for a vibe with one source and the list put away. A real snippet, since
	 * `createRawSnippet` has to render an element.
	 */
	let { shown = false }: { shown?: boolean } = $props();
</script>

<MediaTab
	name="Hypno"
	title="Bimbo Drone"
	layout={MINIMAL_LAYOUT}
	expanded
	panelId="hypno-panel"
	ontoggle={() => undefined}
>
	{#if shown}
		<p>Something</p>
	{/if}
</MediaTab>
