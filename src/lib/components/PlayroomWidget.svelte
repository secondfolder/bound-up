<script lang="ts">
	import SectionWidget from '$lib/components/SectionWidget.svelte';
	import type { IqTestResultView } from '$lib/types';

	/**
	 * The Playroom's /home card. Its body is the last IQ test result, if there
	 * is one; otherwise the card is just its header, which links to /playroom.
	 */
	let { latestIq, href }: { latestIq: IqTestResultView | null; href: string } = $props();
</script>

<SectionWidget title="Playroom" {href} icon="dice" body={latestIq ? preview : undefined} />

{#snippet preview()}
	{#if latestIq}
		<p class="latest">
			Last IQ test: <strong>{latestIq.iq}</strong>
		</p>
	{/if}
{/snippet}

<style>
	.latest {
		margin: 0;

		strong {
			font-size: 1.25em;
		}
	}
</style>
