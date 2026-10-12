<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { MediaFeed, Origin } from '$lib/playroom/iq-test/media';
	import { pornSpacing, sideColumns, stripRows } from '$lib/playroom/iq-test/media-fit';
	import type { Intensity } from '$lib/playroom/iq-test/settings';
	import { wideWindow } from '$lib/playroom/iq-test/wide-window.svelte';
	import ClipPlayer from './ClipPlayer.svelte';
	import MediaPanel from './MediaPanel.svelte';

	/**
	 * The page's frame, and the porn around the question in it. Without porn
	 * (`show` off), just the middle column at the question's width.
	 *
	 * On a wide window, a band down each side of the question, as tall as the
	 * window and reaching all the way to its edge: as many columns as that
	 * takes, each no wider than the intensity's widest, and together exactly
	 * the band's width, so none runs off the edge (see `sideColumns`). On a
	 * narrow one, a strip
	 * above the question and one below, edge to edge. Either way each column
	 * or strip fills itself exactly (see `MediaPanel`).
	 *
	 * Whatever the question leaves empty below it before the footer is filled
	 * too, with more strips: under the question on a wide window, and by the
	 * strip below it growing into several on a narrow one. With the bands up,
	 * the footer sits at the foot of the middle column, so a question that
	 * fits leaves nothing to scroll; otherwise it is under everything.
	 *
	 * "Wide" is one media query (`wideWindow`), read here and given to the
	 * CSS as a class (`wide-media`), so the two cannot disagree. The bands'
	 * widths come from the frame's own width, which its content cannot
	 * change. Not the window's: `innerWidth` counts the scrollbar, which the
	 * layout does not have, and the bands planned for it ran their outer
	 * columns that far off the edge.
	 * The space to fill below is measured, from boxes that take it whatever
	 * they hold, so filling it never changes it.
	 */
	let {
		feed,
		intensity,
		show,
		backdrop,
		docked,
		lead,
		leadOrigin = null,
		children,
		footer
	}: {
		feed: MediaFeed;
		intensity: Intensity;
		/** Whether there is porn around the question at all. */
		show: boolean;
		/** Whether a clip plays behind everything (sensory overload). */
		backdrop: boolean;
		/** Whether the media dock is at the foot of the window, to keep the middle column's foot clear of. */
		docked: boolean;
		/** A video shown first, above the porn in the first column: the hypno's PMV. */
		lead?: Snippet;
		/** The hypno's title and page, linked over its buttons. */
		leadOrigin?: Origin | null;
		/** The middle column: the heading and the question. */
		children: Snippet;
		footer: Snippet;
	} = $props();

	const bands = $derived(show && wideWindow.current);

	/** The frame's width, which is the page's, less its 1rem side padding. */
	let frameWidth = $state(0);
	/**
	 * A rem in pixels: the root's font size, which a reader may have changed,
	 * so the sizes worked out here agree with the CSS's rems. Read again as
	 * the frame changes.
	 */
	const rem = $derived.by(() => {
		void frameWidth;
		if (typeof document === 'undefined') {
			return 16;
		}
		return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
	});
	/** The question's column: `.frame`'s middle track. */
	const SHEET_REM = 44;

	/** Fewer, bigger pieces with more room around them at 3; packed at 4. */
	const spacing = $derived(pornSpacing(intensity));
	/**
	 * The space between one piece of porn and the next, and so between the
	 * outermost and the window's edge too: `MediaPanel`'s gap.
	 */
	const edge = $derived(spacing.gap * rem);
	/** Between the porn and the question: never less than between pieces of porn. */
	const gap = $derived(Math.max(rem, edge));
	/**
	 * Each band's width: half of what the question and its gaps leave of the
	 * frame, and the page's padding taken back (less a gap) at the edge — the
	 * margin `.before` and `.after` reach out by.
	 */
	const band = $derived(
		sideColumns(
			Math.max(0, (frameWidth - SHEET_REM * rem - 2 * gap) / 2 + rem - edge),
			edge,
			spacing.widest * rem
		)
	);
	const sideIndexes = $derived(Array.from({ length: bands ? band.count : 1 }, (_, index) => index));
	/**
	 * The height to fill with strips: below the question on a wide window,
	 * where none is needed; the strip below it on a narrow one, which is
	 * always at least one.
	 */
	let fillHeight = $state(0);
	let afterHeight = $state(0);
	const fillRows = $derived(
		bands
			? stripRows(fillHeight, edge, spacing.strip * rem)
			: stripRows(afterHeight, edge, spacing.strip * rem, 1)
	);
	/** Each strip's place in the feed, after the bands' (wide) or the strip above's (narrow). */
	const fillOffsets = $derived(
		Array.from({ length: fillRows }, (_, index) => (bands ? band.count * 2 : 1) + index)
	);
	/** Every column and strip takes its own share of the feed. */
	const columnCount = $derived((bands ? band.count * 2 : 1) + fillRows);

	/**
	 * The column whose clip is enlarged, if any: that one is heard, rather
	 * than the first column's, while it is.
	 */
	let enlargedColumn = $state<number | null>(null);

	/**
	 * The overload backdrop's clip: one no column is playing, moving on when
	 * it ends. "New porn" reorders the feed, which gives it another too.
	 */
	let backdropIndex = $state(0);
	const backdropClip = $derived.by(() => {
		const playable = feed.clips.filter((clip) => clip.video !== null);
		if (playable.length === 0) {
			return null;
		}
		const stride = columnCount + 1;
		return playable[(columnCount + backdropIndex * stride) % playable.length] ?? null;
	});
</script>

{#snippet column(offset: number, orientation: 'column' | 'row')}
	<MediaPanel
		images={feed.images}
		clips={feed.clips}
		origins={feed.origins}
		{offset}
		stride={columnCount}
		{orientation}
		gap={edge}
		audible={enlargedColumn === null ? offset === 0 : enlargedColumn === offset}
		lead={offset === 0 ? lead : undefined}
		{leadOrigin}
		onenlarge={(open) => {
			if (open) {
				enlargedColumn = offset;
			} else if (enlargedColumn === offset) {
				enlargedColumn = null;
			}
		}}
	/>
{/snippet}

{#if backdrop && backdropClip}
	<!--
		Sensory overload: a clip filling the window behind everything, muted,
		dimmed under the page's own colour so the questions stay readable.
	-->
	<div class="backdrop" aria-hidden="true" data-testid="overload-backdrop">
		<ClipPlayer
			clip={backdropClip}
			fit="cover"
			onended={() => {
				backdropIndex += 1;
			}}
		/>
	</div>
{/if}

<div
	bind:clientWidth={frameWidth}
	class="frame"
	class:with-media={show}
	class:wide-media={bands}
	class:docked={docked}
	style:--porn-gap="{edge}px"
	style:--frame-gap="{gap}px"
	style:--strip-height="{spacing.strip}rem"
>
	{#if show}
		<!-- The nearest column to the question first: it is the one that is never clipped. -->
		<div class="porn before" data-testid="porn-before">
			{#each sideIndexes as index (index)}
				{@render column(index * 2, bands ? 'column' : 'row')}
			{/each}
		</div>
	{/if}

	<!--
		The heading lives in the middle column, so on a wide window the porn
		either side runs from the very top of the page.
	-->
	<div class="main">
		{@render children()}

		{#if bands}
			<!--
				Whatever the question leaves before the foot of the window, filled
				with strips. The box takes that space whatever it holds, so filling
				it cannot change it; with too little for a strip, it holds none.
			-->
			<div class="fill">
				<div class="fill-rows" data-testid="porn-fill" bind:clientHeight={fillHeight}>
					{#each fillOffsets as offset (offset)}
						{@render column(offset, 'row')}
					{/each}
				</div>
			</div>
			<div class="foot">{@render footer()}</div>
		{/if}
	</div>

	{#if show}
		<div class="porn after" data-testid="porn-after" bind:clientHeight={afterHeight}>
			{#if bands}
				{#each sideIndexes as index (index)}
					{@render column(index * 2 + 1, 'column')}
				{/each}
			{:else}
				{#each fillOffsets as offset (offset)}
					{@render column(offset, 'row')}
				{/each}
			{/if}
		</div>
	{/if}
</div>

{#if !bands}
	{@render footer()}
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: -1;
		overflow: hidden;

		&::after {
			content: '';
			position: absolute;
			inset: 0;
			background: color-mix(in oklab, var(--iq-canvas) 55%, transparent);
		}
	}

	.main {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		min-inline-size: 0;
	}

	/* The room under the question, to the foot of the band beside it. The
	   column's own gap undone, so with nothing in it, it adds nothing; the
	   strips sit in a box laid over it, which their content cannot grow. */
	.fill {
		position: relative;
		flex: 1 1 0;
		min-block-size: 0;
		margin-block-start: -1.5rem;
	}

	.fill-rows {
		position: absolute;
		inset: var(--frame-gap) 0 var(--porn-gap);
		display: flex;
		flex-direction: column;
		gap: var(--porn-gap);

		:global(.media-panel) {
			flex: 1 1 0;
			min-block-size: 0;
		}
	}

	.frame {
		flex: 1 1 auto;
		display: grid;
		grid-template-columns: minmax(0, 44rem);
		justify-content: center;
		gap: 1rem;

		/* On a narrow window, a strip of porn above the question and one below,
		   each edge to edge: the page's side padding taken back. The one below
		   takes whatever the page has left above the footer, and fills it with
		   more strips. */
		&.with-media {
			grid-template-columns: minmax(0, 1fr) minmax(0, 44rem) minmax(0, 1fr);
			grid-template-rows: auto auto 1fr;
			gap: var(--frame-gap);

			.main {
				grid-column: 2;
			}

			/* As far from each edge as from each other: the page's 1rem side
			   padding, less that. */
			.porn {
				grid-column: 1 / -1;
				display: flex;
				block-size: var(--strip-height);
				margin-inline: calc(var(--porn-gap) - 1rem);
			}

			/* And from the top: the page's 1.5rem top padding, less that. */
			.before {
				margin-block-start: calc(var(--porn-gap) - 1.5rem);
			}

			/* At least one strip; more, of about the same height, as there is
			   room. Its strips share it, rather than size it. */
			.after {
				flex-direction: column;
				gap: var(--porn-gap);
				block-size: auto;
				min-block-size: var(--strip-height);

				:global(.media-panel) {
					flex: 1 1 0;
					min-block-size: 0;
				}
			}
		}

		/* On a wide window, a band either side, the question in the middle at
		   its own width, the bands taking what is left and reaching the window's
		   edges. Each is as tall as the window, and stays put as the question
		   scrolls. The columns start at the question's side, so the one clipped,
		   if any, is the outer one. The page's top and bottom padding move into
		   the middle column (see the page's `wide-columns`), with the footer,
		   clear of the dock. */
		&.wide-media {
			grid-template-rows: auto;

			.main,
			.porn {
				grid-row: 1;
			}

			.main {
				padding-block: 1.5rem 1rem;
			}

			.porn {
				position: sticky;
				inset-block-start: 0;
				align-self: start;
				block-size: 100dvh;
				min-block-size: 0;
				box-sizing: border-box;
				padding-block: var(--porn-gap);
				margin-inline: 0;
				gap: var(--porn-gap);
				overflow: hidden;

				/* Sharing the band equally rather than each at a worked-out width,
				   so rounding can never leave one hanging off the edge. */
				:global(.media-panel) {
					flex: 1 1 0;
					min-inline-size: 0;
				}
			}

			/* As far from the window's edge as the columns are from each other:
			   the page's 1rem side padding, less that. A column clipped there is
			   clipped at that line, not at the edge. */
			.before {
				grid-column: 1;
				flex-direction: row-reverse;
				margin-inline-start: calc(var(--porn-gap) - 1rem);
			}

			.after {
				grid-column: 3;
				flex-direction: row;
				margin-inline-end: calc(var(--porn-gap) - 1rem);
			}
		}

		&.wide-media.docked .main {
			padding-block-end: 5rem;
		}
	}

	/* At the foot of the middle column, under the fill. */
	.foot {
		margin-block-start: auto;
	}
</style>
