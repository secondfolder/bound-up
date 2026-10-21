<script lang="ts">
	import { formatPassage, type Run, voiceOf, withQuotes } from '$lib/daydream/passage-format';
	import { quoteRanges } from '$lib/daydream/quotes';
	import type { Quote } from '$lib/sealed-kinds/daydreams';

	/**
	 * A passage's words, drawn to be read: paragraphs, scene breaks, lists,
	 * emphasis, dialogue in its speaker's colour, sounds, and highlighted quotes
	 * (docs/daydreams.md, "Reading a passage"). The formatting itself is
	 * `formatPassage`'s; this only draws its runs.
	 *
	 * Each run is one element holding one text node, carrying `data-start`, its
	 * offset into the passage as stored. That is what lets a selection be
	 * turned back into a quote's offsets (`storedOffset`), so keep it that way:
	 * nothing else inside a run, and no whitespace between runs in the markup,
	 * which Svelte would draw as spaces that are not in the passage.
	 */
	let {
		text,
		cast,
		quotes = [],
		streaming = false,
		turnId
	}: {
		/** The passage as stored, markup and all. */
		text: string;
		/** Who has a colour of their own: the user's names, then the setup's characters. */
		cast: { you: readonly string[]; characters: readonly string[] };
		quotes?: readonly Quote[];
		/** Still arriving: half-written markup is hidden rather than flickering into view. */
		streaming?: boolean;
		/** The turn, for selecting words in it (`DaydreamThread`); absent while it is arriving. */
		turnId?: string;
	} = $props();

	const blocks = $derived(withQuotes(formatPassage(text, { streaming }), quoteRanges(text, quotes)));

	/** The run's element: what it means first, then how it looks (its classes). */
	function tagOf(run: Run): string {
		if (run.marked) {
			return 'mark';
		}
		if (run.bold) {
			return 'strong';
		}
		return run.italic ? 'em' : 'span';
	}

	function voice(run: Run): string | null {
		const which = voiceOf(run.speaker, cast);
		return which === null ? null : `var(--daydream-voice-${which})`;
	}
</script>

<div class="prose" data-passage-text={turnId}>
	{#each blocks as block, index (index)}
		{#if block.kind === 'break'}
			<hr class="scene-break" />
		{:else if block.kind === 'list'}
			<!-- One line on purpose, as below. An ordered item's number is the
			     one written, so a list the model numbered from 4 reads from 4. -->
			<svelte:element this={block.ordered ? 'ol' : 'ul'} class="list">{#each block.items as item, at (at)}<li value={item.number ?? undefined}>{#each item.runs as run (run.start)}<svelte:element this={tagOf(run)} data-start={run.start} class:bold={run.bold} class:italic={run.italic} class:dialogue={run.dialogue} class:sound={run.sound} style:--voice={voice(run)}>{run.text}</svelte:element>{/each}</li>{/each}</svelte:element>
		{:else}
			<!-- One line on purpose: see the comment at the top. -->
			<p class:after-break={block.afterBreak} class:standout={block.standout}>{#each block.runs as run (run.start)}<svelte:element this={tagOf(run)} data-start={run.start} class:bold={run.bold} class:italic={run.italic} class:dialogue={run.dialogue} class:sound={run.sound} style:--voice={voice(run)}>{run.text}</svelte:element>{/each}</p>
		{/if}
	{/each}
</div>

<style>
	/* A reading measure: a line of about 65 characters at most, looser
	   leading than the app's, and paragraphs apart rather than one block. */
	.prose {
		max-inline-size: 65ch;
		line-height: 1.6;
		overflow-wrap: anywhere;

		/* Margins only between blocks, all at one specificity, so the rules
		   below each win by order: `p { margin: 0 }` beside a sibling rule
		   outranked it once Svelte had scoped both, and the paragraphs ran
		   together. */
		> * {
			margin-block: 0;
		}

		> * + * {
			margin-block-start: 0.8em;
		}

		> .scene-break {
			overflow: visible;
			margin-block: 1.1em;
			border: 0;
			text-align: center;
			color: var(--wa-color-text-quiet);
			line-height: 1;

			&::before {
				content: '⁂';
				font-size: 1.4em;
			}
		}
	}

	p,
	li {
		/* A single line break inside a paragraph is the model's, and kept. */
		white-space: pre-wrap;
	}

	.list {
		padding-inline-start: 1.6em;

		li + li {
			margin-block-start: 0.3em;
		}

		li::marker {
			color: var(--wa-color-text-quiet);
		}
	}

	/* The first line after a scene break, as a book sets a new section. */
	.after-break::first-line {
		font-variant-caps: small-caps;
		letter-spacing: 0.03em;
	}

	/* Heavier than the app's bold (700): a passage's bold is what it leans
	   on hardest. Rethink Sans is a variable font up to 800 (theme.css), so
	   this is drawn, not rounded down. */
	.bold {
		font-weight: 800;
	}

	/* A paragraph all in bold, often a monologue's key line (`standout` in
	   passage-format.ts), set like a pull quote. */
	.standout {
		font-family: var(--wa-font-family-heading);
		font-size: 1.35em;
		line-height: 1.3;
		color: var(--wa-color-brand-on-quiet);
	}

	.italic {
		font-style: italic;
	}

	mark {
		background: var(--wa-color-brand-fill-quiet);
		color: inherit;
		border-radius: 0.2rem;
	}

	.dialogue {
		color: var(--voice, var(--daydream-dialogue));
	}

	/* A moan or a slap reads as a sound, not a word: small caps, spaced, and
	   in a colour of its own unless it is in someone's line, where it keeps
	   their voice's. Not italics, which are thoughts. */
	.sound {
		font-variant-caps: all-small-caps;
		letter-spacing: 0.06em;
		font-weight: var(--wa-font-weight-semibold, 600);

		&:not(.dialogue) {
			color: var(--daydream-sound);
		}
	}
</style>
