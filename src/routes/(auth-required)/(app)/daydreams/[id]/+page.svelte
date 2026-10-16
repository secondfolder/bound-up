<script lang="ts">
	import { resolve } from '$app/paths';
	import DaydreamDisclosure from '$lib/components/DaydreamDisclosure.svelte';
	import DaydreamThread from '$lib/components/DaydreamThread.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import { openedDaydreamSetup, openedPart, shownText } from '$lib/sealed-views.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const setup = $derived(openedDaydreamSetup(data.daydream.setup));
	const title = $derived(shownText(openedPart(setup, (value) => value.title)));
</script>

<section class="page">
	<NestedPageHeader
		backHref={resolve('/(auth-required)/(app)/daydreams')}
		backLabel="Back to daydreams"
		backText="Daydreams"
		{title}
	/>

	<div class="content">
		<wa-button
			class="setup"
			size="s"
			appearance="outlined"
			href={resolve('/(auth-required)/(app)/daydreams/[id]/edit', { id: data.daydream.id })}
		>
			<wa-icon slot="start" name="sliders" variant="solid"></wa-icon>
			Setup
		</wa-button>

		{#if !data.accepted}
			<DaydreamDisclosure action={`${resolve('/(auth-required)/(app)/daydreams')}?/acceptDisclosure`} />
		{:else}
			<!-- Keyed, so moving between daydreams starts each conversation afresh. -->
			{#key data.daydream.id}
				<DaydreamThread daydream={data.daydream} available={data.available} />
			{/key}
		{/if}
	</div>
</section>

<style>
	.page {
		max-width: 48rem;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		min-block-size: 100%;
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
