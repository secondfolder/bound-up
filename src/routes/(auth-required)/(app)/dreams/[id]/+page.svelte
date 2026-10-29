<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import DreamSetupView from '$lib/components/dreams/DreamSetupView.svelte';
	import DreamStory from '$lib/components/dreams/DreamStory.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import { readPreferences } from '$lib/dream-browser/api';
	import { DreamSession } from '$lib/dream-browser/session.svelte';
	import { reportRequestFailure } from '$lib/request-failure.svelte';
	import type { PageData } from './$types';

	/**
	 * One daydream (docs/dreams.md): set up live until it has an opening, then
	 * played. Everything is opened here, in the browser; the server sends it
	 * sealed.
	 */
	let { data }: { data: PageData } = $props();

	let session = $state<DreamSession | null>(null);
	const id = $derived(data.dream.id);

	onMount(() => {
		// Read once: `data` is reassigned on every refresh, and the session
		// holds the story from here on.
		const view = data.dream;
		readPreferences()
			.then(async ({ revision, preferences }) => {
				const opened = new DreamSession(view.id, {
					userId: data.userId,
					general: { revision, preferences: preferences.preferences }
				});
				await opened.load(view);
				session = opened;
				if (data.available && (opened.step !== 'ready' || opened.path.length === 0)) {
					await opened.runSetup();
				}
			})
			.catch((cause: unknown) => reportRequestFailure(cause));
	});

	const playing = $derived(
		session !== null &&
			(session.path.length > 0 || session.streaming?.what === 'passage') &&
			session.step === 'ready'
	);
</script>

<div class="page">
	<NestedPageHeader
		backHref={resolve('/(auth-required)/(app)/dreams')}
		backLabel="Back to your daydreams"
		backText="Daydreams"
		title={playing ? '' : 'Setting it up'}
	/>
	<div class="content" data-dream={id}>
		{#if !data.available}
			<wa-callout variant="neutral">
				Daydreams aren't set up on this server any more, so this one can't go on.
			</wa-callout>
		{/if}
		{#if session === null}
			<div class="loading" role="status" aria-label="Opening">
				<wa-skeleton effect="sheen"></wa-skeleton>
				<wa-skeleton effect="sheen"></wa-skeleton>
			</div>
		{:else if session.unreadable}
			<wa-callout variant="warning">This daydream can't be shown on this device.</wa-callout>
		{:else if playing}
			<DreamStory {session} pictures={data.pictures} voice={data.voice} />
		{:else}
			<DreamSetupView {session} />
		{/if}
	</div>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		max-width: var(--page-width-narrow);
		width: 100%;
		margin-inline: auto;
	}

	.content {
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		padding: 0 var(--page-gutter);
	}

	.loading {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-xs);
	}
</style>
