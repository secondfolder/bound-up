<script lang="ts">
	import { resolve } from '$app/paths';
	import SectionWidget from '$lib/components/SectionWidget.svelte';
	import WidgetItems from '$lib/components/WidgetItems.svelte';
	import { followInContext } from '$lib/context-client.svelte';
	import type { WidgetItemView } from '$lib/types';

	/**
	 * The notebook's card on Today: the few most recently edited entries,
	 * titles opened in the browser. No entries means no body (see
	 * `SectionWidget`), but the card itself always shows, because it is the
	 * way into the notebook.
	 *
	 * The card is one space's (your own in Everyone and Me, the partnership's
	 * in its context), and `/notebook` shows whatever the context is, so
	 * following it switches the context to the card's space first: the list
	 * then shows what the card previewed. A deliberate choice of that space, not a silent
	 * switch. A link opened in a new tab skips this and shows the context as
	 * it is. See docs/contexts.md.
	 */
	let { items, spaceId }: { items: WidgetItemView[]; spaceId: string | null } = $props();

	const href = resolve('/(auth-required)/(app)/notebook');

	async function follow(event: MouseEvent) {
		if (spaceId !== null) {
			await followInContext(event, { kind: 'space', spaceId }, href);
		}
	}
</script>

<SectionWidget
	title="Notebook"
	{href}
	icon="book"
	onfollow={follow}
	body={items.length > 0 ? preview : undefined}
/>

{#snippet preview()}
	<WidgetItems {items} />
{/snippet}
