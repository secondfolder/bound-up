<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import type { ModelWatch } from '$lib/daydream/model-watch.svelte';
	import { SmoothReveal } from '$lib/daydream/reveal.svelte';
	import type { DaydreamStory } from '$lib/daydream/story.svelte';
	import DaydreamProse from './DaydreamProse.svelte';
	import DaydreamSiblings from './DaydreamSiblings.svelte';
	import ModelProgress from './ModelProgress.svelte';

	/**
	 * The passage being written, as far as it has got: shown at a steady pace
	 * rather than in the stream's bursts (`SmoothReveal`), and formatted as it
	 * goes, with half-written markup kept out of sight. Once it is saved, the
	 * thread draws it as a `DaydreamPassage` instead. Until any of it shows,
	 * how it is going (`ModelProgress`): a model that reasons first can take a
	 * while to begin, and a bare spinner says nothing about why.
	 */
	let {
		text,
		watch = null,
		versions = null,
		debug = false,
		speaker,
		cast
	}: {
		/** The passage so far, markup and all. */
		text: string;
		/** How the reply is going, before the passage begins. */
		watch?: ModelWatch | null;
		/**
		 * The story and the turn this follows, for the `‹ 3/3 ›` beside its
		 * other takes, there while it arrives as after.
		 */
		versions?: { story: DaydreamStory; parentId: string | null } | null;
		/** Debug mode is on: the model's reasoning shows under the progress line as it comes. */
		debug?: boolean;
		/** Whose voice this is, when one character tells the whole story; null otherwise. */
		speaker: string | null;
		cast: { you: readonly string[]; characters: readonly string[] };
	} = $props();

	/**
	 * Keeps the reasoning scrolled to its newest line as it grows, unless the
	 * reader has scrolled up in it.
	 */
	function followEnd(watching: ModelWatch) {
		return (node: HTMLElement) => {
			// Read so the attachment re-runs as the reasoning grows.
			const grown = watching.reasoning.length;
			const atEnd = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
			if (atEnd && grown > 0) {
				void tick().then(() => {
					node.scrollTop = node.scrollHeight;
				});
			}
		};
	}

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
		{#if reveal.shown}<DaydreamProse text={reveal.shown} {cast} streaming />{:else if watch}<ModelProgress {watch} showLive={false} />
			<!-- The reasoning itself, not a live chat: a passage's request is
			     the raw log's to show, and a disclosure inside the bubble hid
			     the one thing worth reading while it waits. -->
			<!-- On one line: the text keeps its own line breaks (`pre-wrap`), and
			     would keep this file's indentation too. -->
			{#if debug && watch.reasoning}<p class="reasoning" {@attach followEnd(watch)}>{watch.reasoning}</p>{/if}{:else}<wa-spinner
			></wa-spinner>
			<span class="wa-visually-hidden">Writing</span>{/if}
	</div>
	{#if versions}
		<!-- Where a saved passage has it, so it does not jump when this is saved. -->
		<div class="actions">
			<DaydreamSiblings story={versions.story} arrivingAfter={versions.parentId} />
		</div>
	{/if}
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

		.actions {
			display: flex;
			align-items: center;
			gap: 0.25rem;
			color: var(--wa-color-text-quiet);

			/* Nothing in it until there are other takes. */
			&:empty {
				display: none;
			}
		}

		.reasoning {
			margin: 0.5rem 0 0;
			max-block-size: 12rem;
			overflow: auto;
			white-space: pre-wrap;
			font-size: var(--wa-font-size-s);
			font-style: italic;
			color: var(--wa-color-text-quiet);
		}

		.text {
			margin: 0;
			padding: 0.625rem 0.875rem;
			border-radius: 1rem;
			border-end-start-radius: 0.25rem;
			background: var(--wa-color-surface-raised, var(--wa-color-surface-default));
			border: 1px solid var(--wa-color-surface-border);
			overflow-wrap: anywhere;

			/* As DaydreamPassage's, so nothing changes size as it is saved. */
			@media (width >= 48rem) {
				padding: 0.75rem 1rem;
				font-size: 1.0625rem;
			}
		}

		/* The bubble rises into place as it appears, and each paragraph fades
		   up as it begins (DaydreamProse's `streaming`): a passage arrives
		   rather than blinking into being. Not on the saved passage that
		   replaces this, which must not flash as it swaps in. */
		@media (prefers-reduced-motion: no-preference) {
			animation: arrive 240ms ease-out;
		}
	}

	@keyframes arrive {
		from {
			opacity: 0;
			translate: 0 0.375rem;
		}
	}
</style>
