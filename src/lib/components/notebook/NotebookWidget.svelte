<script lang="ts">
	import SectionWidget from '$lib/components/SectionWidget.svelte';
	import WidgetItems from '$lib/components/WidgetItems.svelte';
	import type { WidgetItemView } from '$lib/types';

	/**
	 * The notebook's card on /home and /partner/[id]: the few most recently
	 * edited entries, titles opened in the browser. No entries means no body
	 * (see `SectionWidget`), but the card itself always shows, because it is
	 * the way into the notebook.
	 */
	let { items, href }: { items: WidgetItemView[]; href: string } = $props();
</script>

<SectionWidget title="Notebook" {href} icon="book" body={items.length > 0 ? preview : undefined} />

{#snippet preview()}
	<WidgetItems {items} />
{/snippet}
