<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import SectionWidget from '$lib/components/SectionWidget.svelte';
	import WidgetItems from '$lib/components/WidgetItems.svelte';
	import { CONTEXT_DEPENDENCY } from '$lib/context';
	import { storeContext } from '$lib/context-client.svelte';
	import type { WidgetItemView } from '$lib/types';

	/**
	 * The notebook's card on /home and /partner/[id]: the few most recently
	 * edited entries, titles opened in the browser. No entries means no body
	 * (see `SectionWidget`), but the card itself always shows, because it is
	 * the way into the notebook.
	 *
	 * The card is one space's (your own on /home, the partnership's on its
	 * page), and `/notebook` shows whatever the context is, so following it
	 * switches the context to the card's space first: the list then shows
	 * what the card previewed. A deliberate choice of that space, not a silent
	 * switch. A link opened in a new tab skips this and shows the context as
	 * it is. See docs/contexts.md.
	 */
	let { items, spaceId }: { items: WidgetItemView[]; spaceId: string | null } = $props();

	const href = resolve('/(auth-required)/(app)/notebook');

	async function follow(event: MouseEvent) {
		const opensElsewhere =
			event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
		if (spaceId === null || opensElsewhere) {
			return;
		}
		event.preventDefault();
		// Followed even if the switch failed (the notice says so): the list
		// then shows the context as it was, which is still the notebook.
		await storeContext({ kind: 'space', spaceId });
		// The app layout's context too: a navigation re-runs it only when
		// something it depends on was invalidated, and the cookie is not that.
		await goto(resolve('/(auth-required)/(app)/notebook'), { invalidate: [CONTEXT_DEPENDENCY] });
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
