<script lang="ts">
	import type { RoadmapBranch, RoadmapItem, RoadmapStatus, RoadmapTwig } from '$lib/roadmap';
	import Tree from '../tree/Tree.svelte';
	import RoadmapNode from './RoadmapNode.svelte';

	type Props = {
		branches: RoadmapBranch[];
		/** Statuses the legend has filtered out; their nodes are dimmed. */
		hidden?: ReadonlySet<RoadmapStatus>;
		/** An item or branch that must not be folded out of sight: the one the drawer shows. */
		reveal?: string;
	};

	let { branches, hidden = new Set(), reveal }: Props = $props();

	type Entry = RoadmapBranch | RoadmapItem | RoadmapTwig;

	function isBranch(entry: Entry): entry is RoadmapBranch {
		return 'items' in entry;
	}

	function children(entry: Entry): readonly Entry[] {
		if (isBranch(entry)) {
			return entry.items;
		}
		return 'children' in entry ? (entry.children ?? []) : [];
	}

	/*
	 * Filtering, drawn (by Tree). A hidden item's marker and text are dimmed,
	 * and so is every stretch of connector that leads *only* to hidden items.
	 * A branch has no status of its own, so it counts as hidden, and it dims
	 * only when everything in it does.
	 */
	function isHidden(entry: Entry): boolean {
		return isBranch(entry) || hidden.has(entry.status);
	}
</script>

<!-- The tree, its connectors, packing and folding are Tree's; this is what
     sits on it. See docs/roadmap.md and docs/tree.md. -->
<div class="roadmap-tree">
	<Tree
		roots={branches}
		{children}
		key={(entry) => entry.id}
		label={(entry) => entry.title}
		hidden={isHidden}
		reveal={reveal ? [reveal] : []}
		spread
		ground
	>
		{#snippet content(entry, { depth, hidden: dimmed, allHidden })}
			{#if isBranch(entry)}
				<div class="branch-head" class:dimmed={allHidden} id={entry.id}>
					<span class="branch-icon" aria-hidden="true">
						<wa-icon name={entry.icon} variant="solid"></wa-icon>
					</span>
					<div class="branch-text">
						<h2>{entry.title}</h2>
						<p>{entry.summary}</p>
					</div>
				</div>
			{:else}
				<RoadmapNode item={entry} twig={depth > 2} {dimmed} />
			{/if}
		{/snippet}
	</Tree>
</div>

<style>
	.roadmap-tree {
		--branch-icon-size: 2.75rem;
		--tree-dim-opacity: 0.3;

		/* Per depth: a branch head (its icon is its marker), a leaf, a twig.
		   Each is inherited by the depths under it, so a leaf puts the
		   marker's centre back on its first line. */
		:global(.tree-branch[data-depth='1']) {
			--tree-marker-size: var(--branch-icon-size);
			--tree-marker-y: calc(var(--branch-icon-size) / 2);
		}

		:global(.tree-branch[data-depth='2']) {
			--tree-marker-size: 1.25rem;
			--tree-marker-y: 0.5lh;
			--tree-gap: 0.9rem;
			--tree-indent: 1.5rem;
		}

		:global(.tree-branch[data-depth='3']) {
			--tree-marker-size: 0.85rem;
			--tree-gap: 0.45rem;
			--tree-indent: 1.2rem;
			font-size: var(--wa-font-size-s);
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
		border: 3px solid var(--tree-bark, var(--wa-color-brand-30));
		background: var(--wa-color-surface-default);
		color: var(--accent-color);
		font-size: 1.15rem;
	}

	.branch-head {
		display: flex;
		flex-direction: var(--tree-row, row);
		align-items: center;
		gap: 0.75rem;
		scroll-margin-block: 5rem;

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

		/* A branch with everything in it hidden. Tree dims its bough and stem. */
		&.dimmed {
			.branch-icon,
			.branch-text {
				opacity: var(--tree-dim-opacity);
			}
		}
	}
</style>
