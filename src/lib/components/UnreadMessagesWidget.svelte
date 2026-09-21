<script lang="ts">
	import SectionWidget from '$lib/components/SectionWidget.svelte';
	import UnreadPartnerLinks from '$lib/components/UnreadPartnerLinks.svelte';
	import type { UnreadPartnerView } from '$lib/types';

	/**
	 * The /home messages card: one row per partner with something waiting.
	 *
	 * Deliberately headed by plain text rather than a link. Messages are
	 * per-partner, so there is no single page behind the word "Messages" — each
	 * row carries its own link to that partner's board instead. `SectionWidget`
	 * takes an optional `href` for exactly this case.
	 *
	 * The whole card goes when nothing is unread — not just its body, which is
	 * what every other card does. A "Messages" header on its own would still be
	 * a row of chrome on a screen that is mostly read at a glance, and unlike
	 * the others it links nowhere, so there would be nothing to do with it.
	 */
	let { unread }: { unread: UnreadPartnerView[] } = $props();
</script>

{#if unread.length > 0}
	<SectionWidget title="Messages" icon="envelope" body={rows} />
{/if}

{#snippet rows()}
	<UnreadPartnerLinks {unread} />
{/snippet}
