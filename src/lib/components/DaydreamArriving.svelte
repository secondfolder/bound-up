<script lang="ts">
	import { onDestroy } from 'svelte';
	import { SmoothReveal } from '$lib/daydream/reveal.svelte';
	import DaydreamProse from './DaydreamProse.svelte';

	/**
	 * The passage being written, as far as it has got: shown at a steady pace
	 * rather than in the stream's bursts (`SmoothReveal`), and formatted as it
	 * goes, with half-written markup kept out of sight. Once it is saved, the
	 * thread draws it as a `DaydreamPassage` instead.
	 */
	let {
		text,
		speaker,
		cast,
		opening = false
	}: {
		/** The passage so far, markup and all. */
		text: string;
		/** Whose voice this is, when one character tells the whole story; null otherwise. */
		speaker: string | null;
		cast: { you: readonly string[]; characters: readonly string[] };
		opening?: boolean;
	} = $props();

	const reveal = new SmoothReveal();
	$effect(() => {
		reveal.set(text);
	});
	onDestroy(() => reveal.dispose());
</script>

<!-- `data-hold-scroll`: following the end stops once this reaches the top (`followEnd`). -->
<li class="streaming" data-hold-scroll>
	{#if speaker}<span class="who">{speaker}</span>{/if}
	<div class="text">
		{#if reveal.shown}<DaydreamProse text={reveal.shown} {cast} {opening} streaming />{:else}<wa-spinner></wa-spinner>
			<span class="wa-visually-hidden">Writing</span>{/if}
	</div>
</li>

<style>
	.streaming {
		align-self: flex-start;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		max-inline-size: 90%;

		.who {
			font-size: 0.8125rem;
			color: var(--wa-color-text-quiet);
			padding-inline: 0.25rem;
		}

		.text {
			margin: 0;
			padding: 0.625rem 0.875rem;
			border-radius: 1rem;
			border-end-start-radius: 0.25rem;
			background: var(--wa-color-surface-raised, var(--wa-color-surface-default));
			border: 1px solid var(--wa-color-surface-border);
			overflow-wrap: anywhere;
		}
	}
</style>
