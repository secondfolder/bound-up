<script lang="ts">
	import SectionWidget from '$lib/components/SectionWidget.svelte';
	import WidgetItems from '$lib/components/WidgetItems.svelte';
	import type { GuidesWidgetView } from '$lib/types';

	let { guides, href }: { guides: GuidesWidgetView; href: string } = $props();

	const items = $derived(
		// Guides are shared content, not per-account and not per-partnership, so
		// there is no scope to attribute a row to.
		guides.guides.map((guide) => ({ id: guide.id, title: guide.title, note: null, context: null }))
	);
	const hidden = $derived(Math.max(0, guides.total - guides.guides.length));
</script>

<!-- No guides at all means no body: see `SectionWidget`. -->
<SectionWidget
	title="Guides"
	{href}
	icon="book-open"
	body={items.length > 0 ? preview : undefined}
/>

{#snippet preview()}
	<WidgetItems {items} more={hidden > 0 ? `and ${hidden} more` : null} />
{/snippet}
