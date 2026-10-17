<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A box that scrolls along one axis when its content does not fit, with
	 * each end faded out while there is more past it — and only then, so an
	 * end at its limit stays crisp. With `chevrons`, a button sits on each
	 * faded end and scrolls by most of a page.
	 *
	 * The children are laid out by the caller: wrap them in an element of your
	 * own (a flex row with `inline-size: max-content`, say) and that is what
	 * scrolls.
	 */
	let {
		axis = 'x',
		chevrons = false,
		children
	}: {
		axis?: 'x' | 'y';
		/** A button on each overflowing end that scrolls by a page. */
		chevrons?: boolean;
		children: Snippet;
	} = $props();

	let moreStart = $state(false);
	let moreEnd = $state(false);
	let scroller: HTMLElement | undefined = $state();

	/**
	 * Works out which ends have content past them. Every child is observed as
	 * well as the scroller, because content coming and going (and Web Awesome
	 * upgrading it) changes how big it is without changing the scroller.
	 */
	function overflowEdges(node: HTMLElement) {
		const update = () => {
			// `abs` because scrollLeft runs negative in a right-to-left layout.
			const scrolled = Math.abs(axis === 'x' ? node.scrollLeft : node.scrollTop);
			const room =
				axis === 'x' ? node.scrollWidth - node.clientWidth : node.scrollHeight - node.clientHeight;
			moreStart = scrolled > 1;
			moreEnd = scrolled < room - 1;
		};
		const resizes = new ResizeObserver(update);
		const observeChildren = () => {
			resizes.disconnect();
			resizes.observe(node);
			for (const child of node.children) {
				resizes.observe(child);
			}
		};
		const mutations = new MutationObserver(observeChildren);
		mutations.observe(node, { childList: true });
		observeChildren();
		node.addEventListener('scroll', update, { passive: true });
		update();
		return () => {
			resizes.disconnect();
			mutations.disconnect();
			node.removeEventListener('scroll', update);
		};
	}

	/**
	 * Most of a page, not all of it, so what was at the far edge is still in
	 * sight — unless that would stop 5rem or less short of the end, leaving a
	 * sliver under the fade that takes another click to reach; then all the
	 * way.
	 */
	function page(direction: -1 | 1) {
		if (!scroller) {
			return;
		}
		const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
		const visible = axis === 'x' ? scroller.clientWidth : scroller.clientHeight;
		const end = (axis === 'x' ? scroller.scrollWidth : scroller.scrollHeight) - visible;
		const from = axis === 'x' ? scroller.scrollLeft : scroller.scrollTop;
		let to = from + direction * 0.8 * visible;
		// 5rem, in pixels: scroll positions are pixels, and rem is the root's font size.
		const nearly = 5 * Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
		if (to >= end - nearly) {
			to = end;
		} else if (to <= nearly) {
			to = 0;
		}
		scroller.scrollTo(axis === 'x' ? { left: to, behavior } : { top: to, behavior });
	}
</script>

<div class="overflow" data-axis={axis} class:chevrons>
	<div
		class="scroller"
		bind:this={scroller}
		data-more-start={moreStart || undefined}
		data-more-end={moreEnd || undefined}
		{@attach overflowEdges}
	>
		{@render children()}
	</div>
	<!-- Outside the scroller, which the mask would fade them with. Hidden rather
	     than removed, so the row does not reflow as they come and go. -->
	<!-- Drawn here rather than a `wa-icon`: Font Awesome's chevron is a filled
	     shape, so at this size its line would be half again as thick. This is
	     its centre line at 1.5 times the size (its glyph is 0.875em tall, with
	     a line 0.125em thick), stroked at the original thickness: 2 of these
	     24 units at 1.5em. Points right, and is turned by CSS for the other
	     ends; the hidden label names the button. -->
	{#snippet chevron(label: string)}
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<polyline points="7.5 3 16.5 12 7.5 21" />
		</svg>
		<span class="wa-visually-hidden">{label}</span>
	{/snippet}
	{#if chevrons}
		<wa-button
			class="chevron start"
			size="s"
			appearance="plain"
			pill
			class:shown={moreStart}
			onclick={() => page(-1)}
		>
			{@render chevron(axis === 'x' ? 'Scroll left' : 'Scroll up')}
		</wa-button>
		<wa-button
			class="chevron end"
			size="s"
			appearance="plain"
			pill
			class:shown={moreEnd}
			onclick={() => page(1)}
		>
			{@render chevron(axis === 'x' ? 'Scroll right' : 'Scroll down')}
		</wa-button>
	{/if}
</div>

<style>
	/* Registered so the fades can transition: a custom property that is not
	   registered as a length only swaps at the end of a transition. */
	@property --overflow-fade-start {
		syntax: '<length>';
		inherits: false;
		initial-value: 0px;
	}

	@property --overflow-fade-end {
		syntax: '<length>';
		inherits: false;
		initial-value: 0px;
	}

	.overflow {
		--ease-in: 200ms ease-out;

		@media (prefers-reduced-motion: reduce) {
			--ease-in: 0s;
		}

		/* How far each end fades. Wider with chevrons, so a chevron sits over
		   faded content rather than over a button still at full strength. */
		--fade: 1.5rem;
		position: relative;
		min-inline-size: 0;
		min-block-size: 0;

		&.chevrons {
			--fade: 2.5rem;
		}

		/* A scroll container still reports its whole content as its minimum
		   size, so a long row held every ancestor sized to its content open at
		   that width — a centred page column stayed at its maximum on a phone,
		   composer and all. Contained, it takes the room it is given and scrolls
		   the rest, which means a caller has to give it some (`flex: 1`, a
		   width): left to size itself it would be nothing wide. */
		&[data-axis='x'] {
			contain: inline-size;
		}

		&[data-axis='y'] {
			contain: block-size;
		}
	}

	/* The padding gives the content's focus rings room inside the scroller,
	   which clips both axes once it scrolls one; the negative margin takes it
	   back out of the layout. No scrollbar: the faded end says there is more,
	   and focusing something inside scrolls it into view. */
	.scroller {
		--overflow-fade-start: 0px;
		--overflow-fade-end: 0px;
		transition:
			--overflow-fade-start var(--ease-in),
			--overflow-fade-end var(--ease-in);
		padding: 0.25rem;
		margin: -0.25rem;
		scrollbar-width: none;
		mask-image: linear-gradient(
			var(--_direction),
			transparent,
			#000 var(--overflow-fade-start),
			#000 calc(100% - var(--overflow-fade-end)),
			transparent
		);

		&[data-more-start] {
			--overflow-fade-start: var(--fade);
		}

		&[data-more-end] {
			--overflow-fade-end: var(--fade);
		}

		[data-axis='x'] > & {
			--_direction: to right;
			overflow-x: auto;
		}

		[data-axis='y'] > & {
			--_direction: to bottom;
			overflow-y: auto;
			max-block-size: 100%;
		}
	}

	.chevron {
		position: absolute;
		/* No padding, and an icon box as wide as the button is tall, so `pill`
		   makes a circle: Web Awesome only squares off a button whose content is
		   a lone `wa-icon`, and this one also holds its label. */
		--wa-form-control-height: 2rem;
		--wa-form-control-padding-inline: 0;

		/* The drop shadow is a text shadow in effect, so it stands out over the
		   faded content under it: `filter`, because an SVG ignores `text-shadow`.
		   Doubled for a halo dense enough to read on a button. */
		svg {
			display: block;
			inline-size: calc(var(--wa-form-control-height) - 2 * var(--wa-form-control-border-width));
			block-size: 1.5em;
			fill: none;
			stroke: currentColor;
			stroke-width: 2;
			stroke-linecap: round;
			stroke-linejoin: round;
			filter: drop-shadow(0 0 0.125rem var(--wa-color-surface-default))
				drop-shadow(0 0 0.25rem var(--wa-color-surface-default));
		}

		/* Out of the way, and out of reach, until its end has more: it fades
		   in, sliding in from the edge. `visibility` is what stops a hidden one
		   being clicked or tabbed to; as a transition it switches on at the
		   start of fading in and off at the end of fading out. */
		--_slide: 0px;
		opacity: 0;
		visibility: hidden;
		transition:
			opacity var(--ease-in),
			translate var(--ease-in),
			visibility var(--ease-in);

		&.start:not(.shown) {
			--_slide: -0.5rem;
		}

		&.end:not(.shown) {
			--_slide: 0.5rem;
		}

		&.shown {
			opacity: 1;
			visibility: visible;
		}

		/* Half a rem past the scroller's edge, nearer the end it points to. */
		[data-axis='x'] > & {
			inset-block-start: 50%;
			translate: var(--_slide) -50%;

			&.start {
				inset-inline-start: -0.5rem;

				svg {
					rotate: 180deg;
				}
			}

			&.end {
				inset-inline-end: -0.5rem;
			}
		}

		[data-axis='y'] > & {
			inset-inline-start: 50%;
			translate: -50% var(--_slide);

			&.start {
				inset-block-start: -0.5rem;

				svg {
					rotate: -90deg;
				}
			}

			&.end {
				inset-block-end: -0.5rem;

				svg {
					rotate: 90deg;
				}
			}
		}
	}
</style>
