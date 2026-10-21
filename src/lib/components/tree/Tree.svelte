<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import {
		forcedOpen,
		type LaidBranch,
		type LaidNode,
		layoutTree,
		type TreeNodeContext
	} from '$lib/tree';

	/**
	 * A tree drawn in CSS: a trunk, boughs off it, and branches off those,
	 * each joined by connectors hung off the element they lead to. Any
	 * parent/children data will do; `main` decides which child carries a line
	 * straight on. The roadmap and the daydream branch map both draw with it.
	 * See docs/tree.md.
	 */
	type Props = {
		roots: readonly T[];
		children: (node: T) => readonly T[];
		key: (node: T) => string;
		/** Names a node in its fold toggle's accessible name. */
		label: (node: T) => string;
		main?: (children: readonly T[], parent: T | null) => T | undefined;
		hidden?: (node: T) => boolean;
		/**
		 * Wide screens: the trunk up the middle with the boughs packed either
		 * side of it. Only for a bare trunk (no `main` root); one with nodes on
		 * it stays one-sided, since its nodes' text would run into the boughs.
		 */
		spread?: boolean;
		/** The ground line under the trunk. */
		ground?: boolean;
		/** The keys of the folded nodes. */
		collapsed?: SvelteSet<string>;
		/** Folds a node the first time it appears. */
		initiallyCollapsed?: (node: T) => boolean;
		/** False for a node that must never fold. */
		collapsible?: (node: T) => boolean;
		/** Keys that must stay on screen: whatever would fold them away stays open. */
		reveal?: readonly string[];
		/**
		 * Draws one node. Its marker goes at the inline-start (the inline-end
		 * on a mirrored bough: flex rows can follow `--tree-row`), sized
		 * `--tree-marker-size` and centred `--tree-marker-y` down.
		 */
		content: Snippet<[T, TreeNodeContext]>;
	};

	let {
		roots,
		children,
		key,
		label,
		main,
		hidden,
		spread = false,
		ground = false,
		collapsed = $bindable(new SvelteSet<string>()),
		initiallyCollapsed,
		collapsible,
		reveal = [],
		content
	}: Props = $props();

	const uid = $props.id();

	const layout = $derived(layoutTree({ roots, children, key, main, hidden }));
	const open = $derived(forcedOpen(layout, reveal));
	// Packing measures the boughs as one column a side, which a trunk with
	// nodes on it cannot have.
	const packable = $derived(spread && layout.trunk.length === 0);

	// Folds each node `initiallyCollapsed` picks, once, when it first appears:
	// unfolding it again must stick.
	const seen = new Set<string>();
	$effect(() => {
		if (!initiallyCollapsed) {
			return;
		}
		for (const [nodeKey, { laid }] of layout.byKey) {
			if (!seen.has(nodeKey)) {
				seen.add(nodeKey);
				if (laid.folds > 0 && initiallyCollapsed(laid.node)) {
					collapsed.add(nodeKey);
				}
			}
		}
	});

	function canFold(laid: LaidNode<T>): boolean {
		return laid.folds > 0 && (collapsible?.(laid.node) ?? true);
	}

	function isFolded(laid: LaidNode<T>): boolean {
		return canFold(laid) && collapsed.has(laid.key) && !open.has(laid.key);
	}

	/**
	 * Whether a line runs on down from a node: to its forks, or to the next
	 * node on its line. Never on the trunk, which is the line there. A folded
	 * node keeps the line on to the next one unless it starts its branch, in
	 * which case the rest of the line is folded too.
	 */
	function hasBelow(laid: LaidNode<T>, onTrunk: boolean, last: boolean): boolean {
		if (onTrunk) {
			return false;
		}
		const folded = isFolded(laid);
		return (laid.forks.length > 0 && !folded) || !(last || (laid.start && folded));
	}

	function toggle(laid: LaidNode<T>) {
		if (collapsed.has(laid.key)) {
			collapsed.delete(laid.key);
		} else {
			collapsed.add(laid.key);
		}
	}

	function context(laid: LaidNode<T>, onTrunk: boolean): TreeNodeContext {
		return {
			depth: laid.depth,
			onTrunk,
			hidden: laid.hidden,
			allHidden: laid.allHidden,
			folded: isFolded(laid)
		};
	}

	const foldId = (laid: LaidNode<T>) => `${uid}-fold-${laid.key}`;
	const forksId = (laid: LaidNode<T>) => `${uid}-forks-${laid.key}`;
	const boughId = (branch: LaidBranch<T>) => `${uid}-bough-${branch.key}`;

	/** What a node's toggle shows and hides. */
	function controls(laid: LaidNode<T>, onTrunk: boolean): string {
		if (onTrunk) {
			return laid.forks.map(boughId).join(' ');
		}
		return laid.start ? foldId(laid) : forksId(laid);
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
	 * left one side of the roadmap a thousand pixels longer than the other,
	 * since its branches differ so much in size.
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
		if (!(list && packable)) {
			packedHeight = null;
			packedSides = null;
			return;
		}
		// Re-run when the boughs change, so new ones are observed.
		void layout;
		const wide = matchMedia('(min-width: 720px)');
		let frame = 0;

		const pack = () => {
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
			frame = requestAnimationFrame(pack);
		};

		// Positioning a bough never resizes it (its width is the same packed or
		// not), so this cannot feed itself. Folding one does, and re-packs.
		const observer = new ResizeObserver(schedule);
		for (const bough of list.children) {
			observer.observe(bough);
		}
		wide.addEventListener('change', schedule);
		pack();

		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			wide.removeEventListener('change', schedule);
		};
	});
</script>

<!--
	One node and its fold toggle. `last` is whether it ends its line, which
	decides whether the line carries on down from it.
-->
{#snippet nodeRow(laid: LaidNode<T>, onTrunk: boolean, last: boolean)}
	{const folded = $derived(isFolded(laid))}
	<div class="tree-node" class:below={hasBelow(laid, onTrunk, last)} class:dim-below={laid.dim.below}>
		<div class="tree-content">{@render content(laid.node, context(laid, onTrunk))}</div>
		{#if canFold(laid)}
			<!-- A native button: it is a disclosure, and wa-button does not
			     forward aria-expanded to its inner <button> (see AGENTS.md).
			     Disabled while folding would hide something that has to stay
			     on screen (`reveal`). -->
			<button
				type="button"
				class="tree-toggle"
				aria-expanded={!folded}
				aria-controls={folded ? undefined : controls(laid, onTrunk)}
				disabled={open.has(laid.key)}
				onclick={() => toggle(laid)}
			>
				<!-- One chevron, turned rather than swapped, so opening and closing
				     is a motion rather than a cut (see `.tree-toggle wa-icon`). -->
				<wa-icon name="chevron-right" variant="solid" aria-hidden="true"></wa-icon>
				{#if folded}<span class="tree-count" aria-hidden="true">+{laid.folds}</span>{/if}
				<span class="wa-visually-hidden">
					{folded ? `Show ${laid.folds} more under` : `Hide ${laid.folds} under`}
					{label(laid.node)}
				</span>
			</button>
		{/if}
	</div>
{/snippet}

<!-- The branches off a node, hung from a stem under its marker. `through`:
     the node's line carries on past them. -->
{#snippet forks(laid: LaidNode<T>, through: boolean)}
	{#if laid.forks.length > 0}
		<ul class="tree-forks" class:through={through} class:dim-through={laid.dim.through} id={forksId(laid)}>
			{#each laid.forks as branch (branch.key)}
				{@render branchItem(branch, false, 0)}
			{/each}
		</ul>
	{/if}
{/snippet}

<!-- A branch: a bough off the trunk, or an elbow off the line above. Its
     first node, then (unless that is folded) everything after it. `--row`
     is for the grid that stands in until boughs are packed: each spans two
     rows, so each starts halfway down the one before it on the other side. -->
{#snippet branchItem(branch: LaidBranch<T>, bough: boolean, index: number)}
	{const first = $derived(branch.line.at(0))}
	{const rest = $derived(branch.line.slice(1))}
	<li
		class="tree-branch"
		class:bough
		class:dim-above={branch.dim.above}
		class:dim-elbow={branch.dim.elbow}
		class:dim-onward={branch.dim.onward}
		id={bough ? boughId(branch) : undefined}
		data-depth={branch.depth}
		data-side={bough && packable ? sideOf(index) : undefined}
		style:--row={bough && packable ? index + 1 : undefined}
	>
		{#if first}
			{@render nodeRow(first, false, rest.length === 0)}
			{#if !isFolded(first)}
				<div class="tree-fold" id={foldId(first)}>
					{@render forks(first, rest.length > 0)}
					{#each rest as laid, at (laid.key)}
						<div class="tree-step" class:dim-into={laid.dim.into}>
							{@render nodeRow(laid, false, at === rest.length - 1)}
						</div>
						{#if !isFolded(laid)}
							{@render forks(laid, at < rest.length - 1)}
						{/if}
					{/each}
				</div>
			{/if}
		{/if}
	</li>
{/snippet}

<!--
	Every connector is a border or background on the element it leads to, so
	none of them can drift out of line, and the markup is ordinary nested
	lists that read in order without the picture. Only the boughs' vertical
	positions on a wide screen are measured (see above).
-->
<div class="tree" class:spread={packable}>
	<ol
		class="trunk"
		class:packed={packedHeight !== null}
		style:--packed-height={packedHeight === null ? undefined : `${packedHeight}px`}
		bind:this={trunk}
	>
		{#each layout.crown as branch, index (branch.key)}
			{@render branchItem(branch, true, index)}
		{/each}
		{#each layout.trunk as laid (laid.key)}
			<li class="trunk-step" data-depth="0">{@render nodeRow(laid, true, false)}</li>
			{#if !isFolded(laid)}
				{#each laid.forks as branch (branch.key)}
					{@render branchItem(branch, true, 0)}
				{/each}
			{/if}
		{/each}
	</ol>
	{#if ground}
		<div class="ground" aria-hidden="true"></div>
	{/if}
</div>

<style>
	/*
	 * Sizes and colours. A consumer sets the public `--tree-*` properties: the
	 * global ones anywhere above the tree, the per-depth ones (marker, gap,
	 * indent) on `.tree-branch[data-depth]` or `.trunk-step`. Each is read
	 * into a private `--_*` here, so the defaults never need out-specifying.
	 */
	.tree {
		/* How far a bough reaches from the trunk's centre to its first node. */
		--_reach: var(--tree-reach, 1.5rem);
		--_trunk-width: var(--tree-trunk-width, 6px);
		--_bough-width: var(--tree-bough-width, 3px);
		--_trunk-gap: var(--tree-trunk-gap, 2.5rem);
		--_line: var(--tree-line, 2px);
		/* Opaque: two connectors overlap where a vertical meets its elbow, and a
		   translucent colour would show the join as a darker patch. */
		--_line-color: var(--tree-line-color, var(--wa-color-brand-40));
		--_bark: var(--tree-bark, var(--wa-color-brand-30));
		/* How far a hidden item and its connectors fade: the one level there
		   is, besides full strength. */
		--_dim-opacity: var(--tree-dim-opacity, 0.3);
		/*
		 * Hidden connectors are drawn solid, in the colour the line would be
		 * at the dim opacity over the page (mixed in sRGB, which is how the
		 * browser composites opacity), rather than translucent. Connectors
		 * overlap where they join, and two translucent lines over each other
		 * add up to a third, darker level; a hidden one over a shown one
		 * showed as a notch at the join. Solid, an overlap is invisible.
		 */
		--_line-color-dim: color-mix(
			in srgb,
			var(--_line-color) calc(var(--_dim-opacity) * 100%),
			var(--page-wash-floor)
		);
		--_bark-dim: color-mix(
			in srgb,
			var(--_bark) calc(var(--_dim-opacity) * 100%),
			var(--page-wash-floor)
		);
		--_elbow-radius: var(--tree-elbow-radius, 0.6rem);
		--_pad-start: var(--tree-trunk-pad-start, 1rem);
		--_pad-end: var(--tree-trunk-pad-end, 2rem);
		/* One-sided: the trunk runs down the inline-start gutter. */
		--_trunk-x: var(--tree-trunk-x, 1rem);

		position: relative;
		/* Its own stacking context, so a hidden connector's z-index of -1
		   (see the end of this sheet) puts it under the shown ones and the
		   markers, and no further. */
		isolation: isolate;
	}

	/* Per depth, so read again on every level's own element. A marker's
	   centre sits `--tree-marker-y` down its node: half a line by default,
	   which is where a marker slot one line tall centres it. */
	.tree-branch,
	.trunk-step {
		--_size: var(--tree-marker-size, 1.25rem);
		--_y: var(--tree-marker-y, 0.5lh);
		--_gap: var(--tree-gap, 0.9rem);
		--_step-gap: var(--tree-step-gap, var(--_gap));
		--_indent: var(--tree-indent, 1.5rem);
	}

	.trunk {
		position: relative;
		list-style: none;
		margin: 0;
		padding: var(--_pad-start) 0 var(--_pad-end) calc(var(--_trunk-x) + var(--_reach));
		display: flex;
		flex-direction: column;
		gap: var(--_trunk-gap);

		/* The trunk: fading in at the crown, full strength down to the ground. */
		&::before {
			content: '';
			position: absolute;
			inset-block: 0;
			inset-inline-start: calc(var(--_trunk-x) - var(--_trunk-width) / 2);
			inline-size: var(--_trunk-width);
			border-radius: var(--_trunk-width);
			background: linear-gradient(to bottom, transparent, var(--_bark) 4rem);
		}
	}

	/*
	 * Every item of every list here starts flush. Web Awesome's native styles
	 * indent each `li` by 1.125em, which pushed the right-hand boughs 18px clear
	 * of the connector meant to join them to the trunk, and set every leaf and
	 * twig line 18px off the centre of the icon or marker it hangs from.
	 */
	.trunk > li,
	.tree-forks > li {
		margin: 0;
	}

	/* A node on the trunk: its marker centred on it. */
	.trunk > .trunk-step {
		margin-inline-start: calc(-1 * var(--_reach) - var(--_size) / 2);
	}

	.ground {
		block-size: 3px;
		margin-inline: 0 auto;
		inline-size: calc(var(--_trunk-x) * 2 + 4rem);
		border-radius: 3px;
		background: linear-gradient(
			to right,
			transparent,
			var(--_bark) 20%,
			var(--_bark) 80%,
			transparent
		);
	}

	.bough {
		position: relative;
		min-inline-size: 0;
	}

	/*
	 * A node, and its fold toggle beside it. Positioned, so a marker in it
	 * paints over the connectors that end on it, which are positioned
	 * pseudo-elements on the elements around it; the elbows end on a marker's
	 * edge, and this is what keeps them from showing inside its ring.
	 */
	.tree-node {
		position: relative;
		display: flex;
		align-items: flex-start;
		gap: 0.35rem;
	}

	/* `--tree-content-grow: 1` stretches the consumer's content across the
	   column, which puts every fold toggle on one line at the column's outer
	   edge; left shrink-wrapped, each toggle followed the end of its own
	   node's widest line, and no two sat in the same place. */
	.tree-content {
		flex: var(--tree-content-grow, 0) 1 auto;
		min-inline-size: 0;
	}

	.tree-toggle {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.2rem;
		block-size: 1.5rem;
		min-inline-size: 1.5rem;
		box-sizing: border-box;
		/* Level with the marker, wherever the consumer put its centre. */
		margin-block-start: calc(var(--_y) - 0.75rem);
		padding: 0 0.35rem;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--wa-color-text-quiet);
		font: inherit;
		cursor: pointer;
		/* Anchors the larger hit area below. */
		position: relative;

		/* A finger-sized target on a touch screen, drawn as an invisible
		   margin rather than a bigger button: a taller toggle would push its
		   row's height about, and the 1.5rem one was a third of a fingertip. */
		@media (pointer: coarse) {
			&::after {
				content: '';
				position: absolute;
				inset: -0.6rem;
			}
		}

		wa-icon {
			font-size: 0.8rem;
			/* Points outward folded (mirrored on a bough left of the trunk) and
			   turns down as it opens. */
			transform: scaleX(var(--tree-flip, 1)) rotate(90deg);

			@media (prefers-reduced-motion: no-preference) {
				transition: transform 0.15s ease-out;
			}
		}

		&[aria-expanded='false'] wa-icon {
			transform: scaleX(var(--tree-flip, 1));
		}

		&:hover:not(:disabled) {
			background: var(--wa-color-surface-lowered, transparent);
			color: var(--wa-color-text-normal);
		}

		&:disabled {
			cursor: default;
			opacity: 0.4;
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}
	}

	.tree-count {
		font-size: var(--wa-font-size-2xs);
		font-variant-numeric: tabular-nums;
	}

	/* A bough: from the trunk's centre to its first node's marker. */
	.bough > .tree-node::before {
		content: '';
		position: absolute;
		inset-inline-end: 100%;
		inset-block-start: calc(var(--_y) - var(--_bough-width) / 2);
		inline-size: var(--_reach);
		block-size: var(--_bough-width);
		background: var(--_bark);
	}

	/*
	 * Branches off a line: the classic CSS tree, in three stretches per
	 * branch, so each can be dimmed on its own when what it leads to is
	 * hidden:
	 *
	 * - above (the item's ::before): the vertical from the line above down to
	 *   where this branch's elbow bends off. It leads to this branch and to
	 *   every one after it.
	 * - elbow (the first node's ::before): the bend, and the run across to the
	 *   marker. It leads to this branch only.
	 * - onward (the item's ::after, all but the last): the vertical from the
	 *   bend on down to the next branch. It leads to the branches after it.
	 *
	 * A line of more than one node adds three more, on the elements between
	 * one node and the next:
	 *
	 * - below (a node's ::after): from under its marker down past its text,
	 *   to its forks or the next node. Also the stem a node's forks hang from.
	 * - through (the forks list's ::before): past the forks, when the line
	 *   carries on after them.
	 * - into (a later node's step ::before): down to its marker.
	 *
	 * Each overlaps the next by a pixel, and a bend overlaps the vertical it
	 * leaves, so no join shows a hairline seam. That is only sound because a
	 * hidden stretch is drawn solid and underneath (see the end of this
	 * sheet). A forks list is inset so its verticals run from the centre of
	 * the marker above.
	 */
	.tree-forks {
		position: relative;
		list-style: none;
		margin: 0;
		margin-inline-start: calc(var(--_size) / 2 - var(--_line) / 2);
		padding: 0;

		> .tree-branch {
			/* Where the elbow starts to bend: its horizontal ends level with
			   the centre of the marker, one radius below. */
			--_bend: calc(var(--_gap) + var(--_y) - var(--_elbow-radius));

			position: relative;
			padding-block-start: var(--_gap);
			padding-inline-start: var(--_indent);
		}
	}

	.tree-forks > .tree-branch::before,
	.tree-forks > .tree-branch::after,
	.tree-forks > .tree-branch > .tree-node::before,
	.tree-node.below::after,
	.tree-step::before,
	.tree-forks.through::before {
		content: '';
		position: absolute;
		box-sizing: border-box;
		/* Every side coloured, only the drawn ones given a width, so moving a
		   line to the other side (a bough the packing puts on the left)
		   changes widths and not colours. With one side set, the other's
		   colour was currentColor, and the transition below faded each moved
		   line in from the text's cream. */
		border: 0 solid var(--_line-color);
		border-inline-start-width: var(--_line);
		transition: border-color 0.15s ease;
	}

	/* From the marker's lower edge rather than its centre: as the node's own
	   ::after, it paints over everything else in the node, the marker
	   included. A pixel past the node, into what comes next. */
	.tree-node.below::after {
		inset-inline-start: calc(var(--_size) / 2 - var(--_line) / 2);
		inset-block: calc(var(--_y) + var(--_size) / 2) -1px;
	}

	.tree-forks.through::before {
		inset-inline-start: 0;
		inset-block: 0 -1px;
	}

	/* A later node on a line: the gap above it, and the line down through
	   it to its marker's centre, under the marker. */
	.tree-step {
		position: relative;
		padding-block-start: var(--_step-gap);

		&::before {
			inset-inline-start: calc(var(--_size) / 2 - var(--_line) / 2);
			inset-block-start: 0;
			block-size: calc(var(--_step-gap) + var(--_y));
		}
	}

	.tree-forks > .tree-branch {
		&::before,
		&::after {
			inset-inline-start: 0;
		}

		&::before {
			inset-block-start: 0;
			block-size: calc(var(--_bend) + 1px);
		}

		/* On a pixel past the item, into the next one's line down. */
		&::after {
			inset-block: var(--_bend) -1px;
		}

		&:last-child::after {
			content: none;
		}

		/* Placed against the node, which starts exactly one indent in: the
		   run across ends on the marker's edge, no further, and the marker is
		   drawn over it. */
		> .tree-node::before {
			inset-inline-start: calc(-1 * var(--_indent));
			inset-block-start: calc(var(--_y) - var(--_elbow-radius));
			inline-size: var(--_indent);
			block-size: var(--_elbow-radius);
			border-block-end-width: var(--_line);
			border-end-start-radius: var(--_elbow-radius);
		}
	}

	/*
	 * Wide screens: the trunk up the middle and the boughs alternating either
	 * side of it, the left-hand ones mirrored. A node's own content mirrors
	 * itself by following `--tree-row` (and the inherited text-align).
	 *
	 * Until the script packs them, each bough spans two grid rows and the next
	 * starts one row down on the other side, so they still stagger up the
	 * trunk. Once packed, each is placed absolutely at the `--y` the script
	 * measured for it.
	 */
	@media (min-width: 720px) {
		.tree.spread {
			--_trunk-x: 50%;
		}

		.spread .trunk {
			display: grid;
			grid-template-columns: 1fr 1fr;
			column-gap: calc(var(--_reach) * 2);
			row-gap: var(--_trunk-gap);
			padding-inline: 0;
		}

		.spread .bough {
			grid-row: var(--row) / span 2;
			/* Its own height, not the rows it spans: the script measures it. */
			align-self: start;

			&[data-side='end'] {
				grid-column: 2;
			}

			&[data-side='start'] {
				--tree-row: row-reverse;
				--tree-justify: flex-end;
				--tree-flip: -1;

				grid-column: 1;
				text-align: end;

				.tree-node {
					flex-direction: row-reverse;
				}

				> .tree-node::before {
					inset-inline: 100% auto;
				}

				.tree-node.below::after,
				.tree-step::before {
					inset-inline: auto calc(var(--_size) / 2 - var(--_line) / 2);
				}

				.tree-forks {
					margin-inline: 0 calc(var(--_size) / 2 - var(--_line) / 2);
				}

				.tree-forks.through::before {
					inset-inline: auto 0;
				}

				.tree-forks > .tree-branch::before,
				.tree-forks > .tree-branch::after,
				.tree-forks > .tree-branch > .tree-node::before,
				.tree-node.below::after,
				.tree-step::before,
				.tree-forks.through::before {
					border-inline-start-width: 0;
					border-inline-end-width: var(--_line);
				}

				.tree-forks > .tree-branch {
					padding-inline: 0 var(--_indent);

					&::before,
					&::after {
						inset-inline: auto 0;
					}

					> .tree-node::before {
						inset-inline: auto calc(-1 * var(--_indent));
						border-end-start-radius: 0;
						border-end-end-radius: var(--_elbow-radius);
					}
				}
			}
		}

		.spread .ground {
			margin-inline: auto;
			inline-size: 12rem;
		}

		/* Last, as the most specific rules here. */
		.spread .trunk.packed {
			display: block;
			/* The boughs are out of flow now, so the list takes its height
			   from them by hand. */
			box-sizing: content-box;
			block-size: var(--packed-height);

			> .bough {
				position: absolute;
				inset-block-start: calc(var(--_pad-start) + var(--y, 0px));
				/* A grid column's width: half, less half the gap. */
				inline-size: calc(50% - var(--_reach));

				&[data-side='end'] {
					inset-inline-start: calc(50% + var(--_reach));
				}

				&[data-side='start'] {
					inset-inline-end: calc(50% + var(--_reach));
				}
			}
		}
	}

	/*
	 * Dimming, last. A hidden stretch of connector is drawn in the solid dim
	 * colour, and underneath everything else in the tree. Where it joins a
	 * shown stretch, the shown one is on top, so the join reads as part of
	 * the line that is still in use; a hidden sibling further down can never
	 * be drawn over the branch of one above it that is shown. The trunk
	 * never dims: it carries everything. See $lib/tree for when each
	 * stretch is dimmed.
	 */
	.tree .tree-forks > .tree-branch {
		&.dim-above::before,
		&.dim-onward::after,
		&.dim-elbow > .tree-node::before {
			z-index: -1;
			border-color: var(--_line-color-dim);
		}
	}

	.tree .tree-node.dim-below::after,
	.tree .tree-step.dim-into::before,
	.tree .tree-forks.dim-through::before {
		z-index: -1;
		border-color: var(--_line-color-dim);
	}

	.tree .trunk > .bough.dim-elbow > .tree-node::before {
		z-index: -1;
		background: var(--_bark-dim);
	}
</style>
