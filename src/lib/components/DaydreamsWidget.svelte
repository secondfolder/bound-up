<script lang="ts">
	import SectionWidget from '$lib/components/SectionWidget.svelte';
	import WidgetItems from '$lib/components/WidgetItems.svelte';
	import type { DaydreamsWidgetView } from '$lib/types';

	/** Today's card for Daydreams: the most recently played, newest first. */
	let { daydreams, href }: { daydreams: DaydreamsWidgetView; href: string } = $props();

	const items = $derived(
		daydreams.daydreams.map((daydream) => ({
			id: daydream.id,
			// Sealed: `WidgetItems` opens the title from the setup.
			title: '',
			kind: 'daydream' as const,
			sealed: daydream.setup,
			note: daydream.lastTurnAt ? null : 'new',
			// Daydreams are only ever your own.
			context: null
		}))
	);
	const hidden = $derived(Math.max(0, daydreams.total - daydreams.daydreams.length));
</script>

<!-- No daydreams yet means no body: see `SectionWidget`. -->
<SectionWidget
	title="Daydreams"
	{href}
	icon="cloud-moon"
	body={items.length > 0 ? preview : undefined}
/>

{#snippet preview()}
	<WidgetItems {items} more={hidden > 0 ? `and ${hidden} more` : null} />
{/snippet}
