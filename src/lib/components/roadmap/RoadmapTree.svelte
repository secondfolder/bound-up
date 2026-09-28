<script lang="ts">
	import type { RoadmapBranch, RoadmapItem, RoadmapStatus, RoadmapTwig } from '$lib/roadmap';
	import RoadmapNode from './RoadmapNode.svelte';

	type Props = {
		branches: RoadmapBranch[];
		/** Statuses the legend has filtered out; their nodes are dimmed. */
		hidden?: ReadonlySet<RoadmapStatus>;
	};

	let { branches, hidden = new Set() }: Props = $props();

	/*
	 * Filtering, drawn. A hidden item's marker and text are dimmed, and so is
	 * every stretch of connector that leads *only* to hidden items — but a
	 * stretch that also carries on to something shown stays at full strength.
	 * A hidden leaf with a shown twig keeps the line into it, because that
	 * line is the twig's way to the trunk too.
	 */
	function isHidden(item: RoadmapTwig): boolean {
		return hidden.has(item.status);
	}

	/** The item and everything under it are hidden. */
	function allHidden(item: RoadmapItem | RoadmapTwig): boolean {
		return isHidden(item) && ('children' in item ? (item.children ?? []) : []).every(isHidden);
	}

	/** Which of an item's connector stretches to dim. See the CSS for which is which. */
	function dimmed(items: (RoadmapItem | RoadmapTwig)[], index: number) {
		const item = items[index];
		const self = item !== undefined && allHidden(item);
		const onward = items.slice(index + 1).every(allHidden);
		const children = item !== undefined && 'children' in item ? (item.children ?? []) : [];
		return {
			elbow: self,
			onward,
			above: self && onward,
			stem: children.length > 0 && children.every(isHidden)
		};
	}

	// Per branch, per leaf: the leaf's flags and its twigs'. Re-derived when
	// the legend changes `hidden`.
	const dims = $derived(
		branches.map((branch) =>
			branch.items.map((item, index) => ({
				...dimmed(branch.items, index),
				twigs: (item.children ?? []).map((_, twigIndex) => dimmed(item.children ?? [], twigIndex))
			}))
		)
	);

	const NOT_DIMMED = { above: false, elbow: false, onward: false, stem: false };

	function leafDims(branchIndex: number, itemIndex: number) {
		return dims[branchIndex]?.[itemIndex] ?? NOT_DIMMED;
	}

	function twigDims(branchIndex: number, itemIndex: number, twigIndex: number) {
		return dims[branchIndex]?.[itemIndex]?.twigs[twigIndex] ?? NOT_DIMMED;
	}

	let trunk: HTMLOListElement | undefined = $state();
	// Set once the boughs have been packed (wide screens only); null leaves the
	// CSS grid fallback in charge.
	let packedHeight: number | null = $state(null);
	// Which side of the trunk each bough grows from once packed. Until then
	// they simply alternate.
	let packedSides: Side[] | null = $state(null);

	type Side = 'start' | 'end';

	function sideOf(index: number): Side {
		return packedSides?.[index] ?? (index % 2 === 0 ? 'end' : 'start');
	}

	/*
	 * Wide screens: pack each side of the trunk as its own column, with the
	 * same gap between every pair of boughs on that side. Each bough, in
	 * order, goes on whichever side is shorter so far — strict alternation
	 * left one side a thousand pixels longer than the other, since the
	 * branches differ so much in size.
	 *
	 * CSS cannot do this with the boughs in reading order. A shared grid ties
	 * the two sides' rows together, so a tall bough on one side opened a gap
	 * of whatever size on the other. Two separate lists would have put the
	 * branches in a different order for screen readers and the keyboard than
	 * on a phone, where they sit one under another. So the boughs are measured
	 * and positioned here. Before that runs (without JavaScript, or before
	 * hydration) the staggered grid in the CSS below stands in, and on a
	 * phone none of this applies.
	 */
	$effect(() => {
		const list = trunk;
		if (!list) {
			return;
		}
		const wide = matchMedia('(min-width: 720px)');
		let frame = 0;

		const layout = () => {
			const boughs = [...list.children] as HTMLElement[];
			if (!wide.matches) {
				packedHeight = null;
				packedSides = null;
				return;
			}
			const gap = Number.parseFloat(getComputedStyle(list).rowGap) || 0;
			// The left side starts lower, so the first two boughs step up the
			// trunk rather than sitting level with each other.
			const next: Record<Side, number> = { end: 0, start: gap * 2.5 };
			const sides: Side[] = [];
			let bottom = 0;
			for (const bough of boughs) {
				// Mirroring a bough does not change its width, so its height is
				// the same whichever side it ends up on.
				const side: Side = next.start < next.end ? 'start' : 'end';
				const top = next[side];
				sides.push(side);
				bough.style.setProperty('--y', `${top}px`);
				next[side] = top + bough.offsetHeight + gap;
				bottom = Math.max(bottom, top + bough.offsetHeight);
			}
			packedSides = sides;
			packedHeight = bottom;
		};
		// Batched to a frame: a font swapping in resizes every bough at once.
		const schedule = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(layout);
		};

		// Positioning a bough never resizes it (its width is the same packed or
		// not), so this cannot feed itself.
		const observer = new ResizeObserver(schedule);
		for (const bough of list.children) {
			observer.observe(bough);
		}
		wide.addEventListener('change', schedule);
		layout();

		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			wide.removeEventListener('change', schedule);
		};
	});
</script>

<!--
	The tree is drawn in CSS rather than laid out by a graph library: the trunk
	is a ::before on the list, and every connector is a border on the item it
	leads to. Only the boughs' vertical positions on a wide screen are measured
	(see above); every connector hangs off its own element, so none of them can
	drift out of line. The markup is ordinary nested lists that read in order
	without the picture. See docs/roadmap.md.
-->
<div class="tree">
	<ol
		class="trunk"
		class:packed={packedHeight !== null}
		style:--packed-height={packedHeight === null ? undefined : `${packedHeight}px`}
		bind:this={trunk}
	>
		{#each branches as branch, index (branch.id)}
			<!-- `--row` is for the grid that stands in until the boughs are
			     packed: each spans two rows, so each starts halfway down the one
			     before it on the other side. -->
			<li
				class="bough"
				class:dim-all={branch.items.every(allHidden)}
				data-side={sideOf(index)}
				style:--row={index + 1}
			>
				<div class="branch-head" id={branch.id}>
					<span class="branch-icon" aria-hidden="true">
						<wa-icon name={branch.icon} variant="solid"></wa-icon>
					</span>
					<div class="branch-text">
						<h2>{branch.title}</h2>
						<p>{branch.summary}</p>
					</div>
				</div>
				<ul class="leaves">
					{#each branch.items as item, itemIndex (item.id)}
						<li
							class:dim-above={leafDims(index, itemIndex).above}
							class:dim-elbow={leafDims(index, itemIndex).elbow}
							class:dim-onward={leafDims(index, itemIndex).onward}
							class:dim-stem={leafDims(index, itemIndex).stem}
						>
							<RoadmapNode {item} dimmed={isHidden(item)} />
							{#if item.children?.length}
								<ul class="twigs">
									{#each item.children as twig, twigIndex (twig.id)}
										<li
											class:dim-above={twigDims(index, itemIndex, twigIndex).above}
											class:dim-elbow={twigDims(index, itemIndex, twigIndex).elbow}
											class:dim-onward={twigDims(index, itemIndex, twigIndex).onward}
										>
											<RoadmapNode item={twig} twig dimmed={isHidden(twig)} />
										</li>
									{/each}
								</ul>
							{/if}
						</li>
					{/each}
				</ul>
			</li>
		{/each}
	</ol>
	<div class="ground" aria-hidden="true"></div>
</div>

<style>
	.tree {
		/* How far a bough reaches from the trunk's centre to its head. */
		--reach: 1.5rem;
		--trunk-width: 6px;
		--line: 2px;
		/* Opaque: two connectors overlap where a vertical meets its elbow, and a
		   translucent colour would show the join as a darker patch. */
		--line-color: var(--wa-color-brand-40);
		--bark: var(--wa-color-brand-30);
		--branch-icon-size: 2.75rem;
		/* A leaf's marker (RoadmapNode), which its twigs hang under. */
		--leaf-marker-size: 1.25rem;
		/* How far a hidden item and its connectors fade: the one level there
		   is, besides full strength. RoadmapNode falls back to the same. */
		--dim-opacity: 0.3;
		/*
		 * Hidden connectors are drawn solid, in the colour the line would be
		 * at --dim-opacity over the page (mixed in sRGB, which is how the
		 * browser composites opacity), rather than translucent. Connectors
		 * overlap where they join, and two translucent lines over each other
		 * add up to a third, darker level; a hidden one over a shown one
		 * showed as a notch at the join. Solid, an overlap is invisible.
		 */
		--line-color-dim: color-mix(
			in srgb,
			var(--line-color) calc(var(--dim-opacity) * 100%),
			var(--page-wash-floor)
		);
		--bark-dim: color-mix(
			in srgb,
			var(--bark) calc(var(--dim-opacity) * 100%),
			var(--page-wash-floor)
		);
		--elbow-radius: 0.6rem;
		--trunk-pad-start: 1rem;
		--trunk-pad-end: 2rem;

		position: relative;
		/* Its own stacking context, so a hidden connector's z-index of -1
		   (see the end of this sheet) puts it under the shown ones and the
		   markers, and no further. */
		isolation: isolate;
		/* Mobile: the trunk runs down the left gutter. */
		--trunk-x: 1rem;
	}

	.trunk {
		position: relative;
		list-style: none;
		margin: 0;
		padding: var(--trunk-pad-start) 0 var(--trunk-pad-end) calc(var(--trunk-x) + var(--reach));
		display: flex;
		flex-direction: column;
		gap: 2.5rem;

		/* The trunk: fading in at the crown, full strength down to the ground. */
		&::before {
			content: '';
			position: absolute;
			inset-block: 0;
			inset-inline-start: calc(var(--trunk-x) - var(--trunk-width) / 2);
			inline-size: var(--trunk-width);
			border-radius: var(--trunk-width);
			background: linear-gradient(to bottom, transparent, var(--bark) 4rem);
		}
	}

	/*
	 * Every item of every list here starts flush. Web Awesome's native styles
	 * indent each `li` by 1.125em, which pushed the right-hand boughs 18px clear
	 * of the connector meant to join them to the trunk, and set every leaf and
	 * twig line 18px off the centre of the icon or marker it hangs from.
	 */
	.trunk > li,
	.leaves > li,
	.twigs > li {
		margin: 0;
	}

	.ground {
		block-size: 3px;
		margin-inline: 0 auto;
		inline-size: calc(var(--trunk-x) * 2 + 4rem);
		border-radius: 3px;
		background: linear-gradient(to right, transparent, var(--bark) 20%, var(--bark) 80%, transparent);
	}

	.bough {
		position: relative;
		min-inline-size: 0;
	}

	.branch-head {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		scroll-margin-block: 5rem;

		/* The bough: from the trunk's centre to the head's icon. */
		&::before {
			content: '';
			position: absolute;
			inset-inline-end: 100%;
			inset-block-start: calc(var(--branch-icon-size) / 2 - 1.5px);
			inline-size: var(--reach);
			block-size: 3px;
			background: var(--bark);
		}

		/* The stem from the icon down to the first leaf. The head's text runs
		   longer than the icon is tall, and the leaves' line starts under the
		   text, so without this the two never met. */
		&::after {
			content: '';
			position: absolute;
			inset-inline-start: calc(var(--branch-icon-size) / 2 - var(--line) / 2);
			/* A pixel past the head, into the first leaf's line down. */
			inset-block: var(--branch-icon-size) -1px;
			border-inline-start: var(--line) solid var(--line-color);
		}

		/* A flex item stops shrinking at its longest word unless told
		   otherwise, and "Customisation" in the display face is wider than a
		   phone's column once the trunk and icon have had theirs. */
		.branch-text {
			min-inline-size: 0;
			overflow-wrap: anywhere;
		}

		h2 {
			margin: 0;
			font-family: var(--font-display);
			font-size: 1.6rem;
			line-height: 1.1;
			color: var(--accent-color);
		}

		p {
			margin: 0.15rem 0 0;
			font-size: var(--wa-font-size-s);
			color: var(--wa-color-text-quiet);
		}
	}

	.branch-icon {
		flex: none;
		align-self: flex-start;
		display: grid;
		place-items: center;
		inline-size: var(--branch-icon-size);
		block-size: var(--branch-icon-size);
		box-sizing: border-box;
		border-radius: 50%;
		border: 3px solid var(--bark);
		background: var(--wa-color-surface-default);
		color: var(--accent-color);
		font-size: 1.15rem;
	}

	/*
	 * Leaves and twigs: the classic CSS tree, in three stretches per item, so
	 * each can be dimmed on its own when the legend hides what it leads to:
	 *
	 * - above (the item's ::before): the vertical from the line above down to
	 *   where this item's elbow bends off. It leads to this item and to every
	 *   one after it.
	 * - elbow (the node's ::before): the bend, and the run across to the
	 *   marker. It leads to this item and its twigs only.
	 * - onward (the item's ::after, all but the last): the vertical from the
	 *   bend on down to the next item. It leads to the items after this one.
	 *
	 * Each overlaps the next by a pixel, and the bend overlaps the vertical it
	 * leaves, so no join shows a hairline seam. That is only sound because a
	 * hidden stretch is drawn solid and underneath (see the end of this
	 * sheet). The list itself is inset so the verticals run from the centre
	 * of the node above.
	 */
	.leaves,
	.twigs {
		list-style: none;
		margin: 0;
		padding: 0;

		> li {
			/* Where the elbow starts to bend: its horizontal ends level with
			   the centre of the marker, one radius below. */
			--bend-y: calc(var(--gap) + 0.5lh - var(--elbow-radius));

			position: relative;
			padding-block-start: var(--gap);
			padding-inline-start: var(--indent);

			&::before,
			&::after,
			> :global(.node)::before {
				content: '';
				position: absolute;
				box-sizing: border-box;
				/* Every side coloured, only the drawn ones given a width, so
				   moving a line to the other side (a bough the packing puts on
				   the left) changes widths and not colours. With one side set,
				   the other's colour was currentColor, and the transition
				   below faded each moved line in from the text's cream. */
				border: 0 solid var(--line-color);
				border-inline-start-width: var(--line);
				transition: border-color 0.15s ease;
			}

			&::before,
			&::after {
				inset-inline-start: 0;
			}

			&::before {
				inset-block-start: 0;
				block-size: calc(var(--bend-y) + 1px);
			}

			/* On a pixel past the item, into the next one's line down. */
			&::after {
				inset-block: var(--bend-y) -1px;
			}

			&:last-child::after {
				content: none;
			}

			/* Placed against the node (positioned in RoadmapNode), which
			   starts exactly one indent in: the run across ends on the
			   marker's edge, no further, and the marker is drawn over it. */
			> :global(.node)::before {
				inset-inline-start: calc(-1 * var(--indent));
				inset-block-start: calc(0.5lh - var(--elbow-radius));
				inline-size: var(--indent);
				block-size: var(--elbow-radius);
				border-block-end-width: var(--line);
				border-end-start-radius: var(--elbow-radius);
			}
		}
	}

	.leaves {
		--gap: 0.9rem;
		--indent: 1.5rem;
		margin-inline-start: calc(var(--branch-icon-size) / 2 - var(--line) / 2);

		/* A leaf with twigs: a stem from under its marker down past its
		   summary to the first twig, for the same reason as the head's. It
		   is placed against the node, which is positioned already (see
		   RoadmapNode). It starts at the marker's lower edge rather than its
		   centre because, as the node's own ::after, it paints over
		   everything else in the node, the marker included. */
		> li:has(> .twigs) > :global(.node) {
			&::after {
				content: '';
				position: absolute;
				inset-inline-start: calc(var(--leaf-marker-size) / 2 - var(--line) / 2);
				/* A pixel past the node, into the first twig's line down. */
				inset-block: calc(0.5lh + var(--leaf-marker-size) / 2) -1px;
				border-inline-start: var(--line) solid var(--line-color);
				transition: border-color 0.15s ease;
			}
		}
	}

	.twigs {
		--gap: 0.45rem;
		--indent: 1.2rem;
		/* Under the leaf's marker rather than its text. */
		margin-inline-start: calc(var(--leaf-marker-size) / 2 - var(--line) / 2);
		font-size: var(--wa-font-size-s);
	}

	/*
	 * Wide screens: the trunk up the middle and the boughs alternating either
	 * side of it, the left-hand ones mirrored.
	 *
	 * Until the script packs them, each bough spans two grid rows and the next
	 * starts one row down on the other side, so they still stagger up the
	 * trunk. Once packed, each is placed absolutely at the `--y` the script
	 * measured for it.
	 */
	@media (min-width: 720px) {
		.tree {
			--trunk-x: 50%;
		}

		.trunk {
			display: grid;
			grid-template-columns: 1fr 1fr;
			column-gap: calc(var(--reach) * 2);
			row-gap: 2.5rem;
			padding-inline: 0;
		}

		.bough {
			grid-row: var(--row) / span 2;
			/* Its own height, not the rows it spans: the script measures it. */
			align-self: start;

			&[data-side='end'] {
				grid-column: 2;
			}

			&[data-side='start'] {
				grid-column: 1;
				text-align: end;

				.branch-head {
					flex-direction: row-reverse;

					&::before {
						inset-inline: 100% auto;
					}

					&::after {
						inset-inline: auto calc(var(--branch-icon-size) / 2 - var(--line) / 2);
					}
				}

				.leaves {
					margin-inline: 0 calc(var(--branch-icon-size) / 2 - var(--line) / 2);

					> li:has(> .twigs) > :global(.node)::after {
						inset-inline: auto calc(var(--leaf-marker-size) / 2 - var(--line) / 2);
					}
				}

				.twigs {
					margin-inline: 0 calc(var(--leaf-marker-size) / 2 - var(--line) / 2);
				}

				.leaves,
				.twigs {
					> li {
						padding-inline: 0 var(--indent);

						&::before,
						&::after,
						> :global(.node)::before {
							border-inline-start-width: 0;
							border-inline-end-width: var(--line);
						}

						&::before,
						&::after {
							inset-inline: auto 0;
						}

						> :global(.node)::before {
							inset-inline: auto calc(-1 * var(--indent));
							border-end-start-radius: 0;
							border-end-end-radius: var(--elbow-radius);
						}
					}
				}

				/* The node's marker on the trunk side, its text flowing away. */
				:global(.node) {
					flex-direction: row-reverse;
				}

				:global(.node .text) {
					justify-content: flex-end;
				}
			}
		}

		.ground {
			margin-inline: auto;
			inline-size: 12rem;
		}

		/* Last, as the most specific rules here. */
		.trunk.packed {
			display: block;
			/* The boughs are out of flow now, so the list takes its height
			   from them by hand. */
			box-sizing: content-box;
			block-size: var(--packed-height);

			> .bough {
				position: absolute;
				inset-block-start: calc(var(--trunk-pad-start) + var(--y, 0px));
				/* A grid column's width: half, less half the gap. */
				inline-size: calc(50% - var(--reach));

				&[data-side='end'] {
					inset-inline-start: calc(50% + var(--reach));
				}

				&[data-side='start'] {
					inset-inline-end: calc(50% + var(--reach));
				}
			}
		}
	}

	/*
	 * Dimming, last: these have to win over the mirrored wide-screen rules
	 * above, and are scoped under `.tree .bough` to outrank them.
	 *
	 * A hidden stretch of connector is drawn in the solid dim colour, and
	 * underneath everything else in the tree. Where it joins a shown stretch,
	 * the shown one is on top, so the join reads as part of the line that is
	 * still in use; a hidden sibling further down can never be drawn over the
	 * branch of one above it that is shown. See the leaves-and-twigs block
	 * above for which stretch is which, and the script for when each is
	 * dimmed.
	 */
	.tree .bough .leaves > li,
	.tree .bough .twigs > li {
		&.dim-above::before,
		&.dim-onward::after,
		&.dim-elbow > :global(.node)::before,
		&.dim-stem > :global(.node)::after {
			z-index: -1;
			border-color: var(--line-color-dim);
		}
	}

	/* A branch with everything in it hidden: its head, and the bough and stem
	   that lead only to it. Never the trunk, which carries every branch — and
	   which the bough, underneath it, now joins without dimming its edge. */
	.tree .trunk > li.bough.dim-all .branch-head {
		.branch-icon,
		.branch-text {
			opacity: var(--dim-opacity);
		}

		&::before {
			z-index: -1;
			background: var(--bark-dim);
		}

		&::after {
			z-index: -1;
			border-color: var(--line-color-dim);
		}
	}
</style>
