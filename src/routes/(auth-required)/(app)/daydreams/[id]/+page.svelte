<script lang="ts">
	import { resolve } from '$app/paths';
	import DaydreamDisclosure from '$lib/components/DaydreamDisclosure.svelte';
	import DaydreamThread from '$lib/components/DaydreamThread.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import { daydreamTitle } from '$lib/daydream';
	import { hasFeature } from '$lib/features';
	import { openedDaydreamSetup, openedPart, shownText } from '$lib/sealed-views.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const setup = $derived(openedDaydreamSetup(data.daydream.setup));
	/**
	 * The name the thread gave it this visit, after the opening. Held here
	 * rather than reloaded: a reload would read every turn again to change
	 * one heading.
	 */
	let named: string | null = $state(null);
	const title = $derived(named ?? shownText(openedPart(setup, daydreamTitle)));
</script>

<section class="page">
	<NestedPageHeader
		backHref={resolve('/(auth-required)/(app)/daydreams')}
		backLabel="Back to daydreams"
		backText="Daydreams"
		{title}
	/>

	<div class="content">
		{#if !data.accepted}
			<!-- The thread has Settings in its tool row, beside the dials; until
			     the disclosure is accepted there is no thread, so it is here. -->
			<wa-button
				class="setup"
				size="s"
				appearance="outlined"
				href={resolve('/(auth-required)/(app)/daydreams/[id]/edit', { id: data.daydream.id })}
			>
				<wa-icon slot="start" name="gear" variant="solid"></wa-icon>
				Settings <span class="wa-visually-hidden">for this daydream</span>
			</wa-button>
			<DaydreamDisclosure action={`${resolve('/(auth-required)/(app)/daydreams')}?/acceptDisclosure`} />
		{:else}
			<!-- Keyed, so moving between daydreams starts each conversation afresh. -->
			{#key data.daydream.id}
				<DaydreamThread
					daydream={data.daydream}
					available={data.available}
					keepRawReplies={hasFeature(data.features, 'debugMode')}
					picturesAvailable={data.picturesAvailable}
					debug={data.debug}
					onnamed={(name) => {
						named = name;
					}}
				/>
			{/key}
		{/if}
	</div>
</section>

<style>
	/* Fills the pane however short the story is, so the compose box can sit at
	   its bottom: `flex`, not `min-block-size: 100%`, which counted none of the
	   hints above the page in <main> and let the box sit wherever the story
	   ended. The width, because auto margins in <main>'s flex column would
	   otherwise shrink the column to its content. */
	.page {
		max-width: 48rem;
		inline-size: 100%;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
	}

	.content {
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: var(--wa-space-m) var(--wa-space-l) 0;

		.setup {
			align-self: flex-end;
		}
	}
</style>
