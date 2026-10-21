<script lang="ts">
	import type { ModelWatch } from '$lib/daydream/model-watch.svelte';
	import { stageLabel } from '$lib/daydream/progress';
	import { startOpen } from './details';
	import ExchangeEntries from './ExchangeEntries.svelte';

	/**
	 * How a model call is going, while a page waits on it: what the model is
	 * doing and how much it has written (`stageLabel`), and in debug mode the
	 * live chat — the request and every piece of the answer as it comes. See
	 * docs/daydreams.md, "Progress while it writes".
	 *
	 * The count changes several times a second, so it is not what a screen
	 * reader is told: the status region says only the stage, which changes a
	 * handful of times a call.
	 */
	let {
		watch,
		showStage = true,
		showLive = true
	}: {
		watch: ModelWatch;
		/**
		 * Whether to draw the stage line. Off where a page lays it over what is
		 * waiting (the new-daydream box) and draws the live chat apart from it,
		 * where it has room.
		 */
		showStage?: boolean;
		/** Whether to draw the live chat the watch keeps: the device's debug switch, where it is not the watch's own. */
		showLive?: boolean;
	} = $props();

	const STAGE_WORDS = {
		waiting: 'Waiting for the model',
		thinking: 'Thinking',
		reading: 'Reading links',
		writing: 'Writing'
	} as const;
</script>

<div class="model-progress">
	{#if showStage}
		<p class="stage">
			<wa-spinner></wa-spinner>
			<span aria-hidden="true">{stageLabel(watch.progress)}</span>
			<span class="wa-visually-hidden" role="status">{STAGE_WORDS[watch.progress.stage]}</span>
		</p>
	{/if}
	{#if showLive && watch.live && watch.entries.length > 0}
		<wa-details
			class="live"
			summary="Live chat{watch.heading ? `: ${watch.heading}` : ''}"
			{@attach startOpen(true)}
		>
			<ExchangeEntries entries={watch.entries} open={(entry) => entry.who === 'model'} follow />
		</wa-details>
	{/if}
</div>

<style>
	.model-progress {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.stage {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
		font-variant-numeric: tabular-nums;
	}
</style>
