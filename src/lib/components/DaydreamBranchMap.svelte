<script lang="ts">
	import type { DaydreamStory } from '$lib/daydream/story.svelte';
	import { longestChild } from '$lib/tree';
	import type { DaydreamTreeNodeView } from '$lib/types';
	import divergeIcon from './icons/diverge.svg';
	import Tree from './tree/Tree.svelte';

	/**
	 * Every branch of the story at once, drawn as a tree. The trunk is the
	 * longest way the story has gone; wherever it forked, the other ways grow
	 * off it, each the longest way on from there, with their own forks off
	 * them. The branch being read is marked, and so are bookmarks. Picking a
	 * turn moves to the branch through it, where it was last left; "carry on
	 * from here" makes that turn the place to continue from.
	 *
	 * "Carry on from here" sits on a rule under its turn, at the drawer's
	 * edge, rather than in the turn's row: in the row it read as either
	 * keeping that turn or starting before it. Under it, the new branch
	 * plainly keeps everything above the line.
	 *
	 * Labels are the first words of each turn, opened when the map is; until
	 * then a turn shows who wrote it.
	 */
	let {
		story,
		onclose,
		onjump
	}: {
		story: DaydreamStory;
		onclose: () => void;
		/** Called with the turn picked, after moving there, for the page to scroll to it. */
		onjump: (turnId: string) => void;
	} = $props();

	let drawer: (HTMLElement & { open: boolean }) | undefined = $state();
	const onPath = $derived(new Set(story.path.map((node) => node.id)));
	const marked = $derived(
		new Set(
			story.marks.filter((mark) => mark.content?.type === 'bookmark').map((mark) => mark.turnId)
		)
	);

	// The longest way on from each fork carries the line. A tie goes to the
	// branch being read, so the trunk is the one on screen where it can be,
	// then to the newest.
	// Made again whenever the tree changes: it remembers each turn's height.
	const main = $derived.by(() => {
		void story.index;
		return longestChild(
			(node: DaydreamTreeNodeView) => story.children(node.id),
			(a, b) =>
				Number(onPath.has(b.id)) - Number(onPath.has(a.id)) ||
				b.createdAt.getTime() - a.createdAt.getTime()
		);
	});

	$effect(() => {
		// The newest few hundred: enough for any map someone reads, without
		// opening every turn of a very long story.
		void story.ensureLoaded(story.tree.slice(-300).map((node) => node.id));
	});

	const SAFETY_LABELS = { red: 'Stopped', yellow: 'Eased off', resume: 'Carried on' } as const;

	function label(node: DaydreamTreeNodeView): string {
		const content = story.content(node.id);
		if (!content) {
			return node.role === 'user' ? 'You…' : 'The story…';
		}
		switch (content.type) {
			case 'text':
				return content.text.length > 70 ? `${content.text.slice(0, 70).trimEnd()}…` : content.text;
			case 'direction':
				return `→ ${content.label}`;
			case 'steer':
				return `→ ${content.action === 'more' ? 'More of this' : 'Not this'}`;
			case 'roll':
				return `Rolled ${content.result}`;
			case 'safety':
				return SAFETY_LABELS[content.signal];
			default:
				return '…';
		}
	}

	async function jump(node: DaydreamTreeNodeView, carryOnHere: boolean) {
		if (carryOnHere) {
			await story.rewindTo(node.id);
		} else {
			await story.showBranch(node.id);
		}
		if (drawer) {
			drawer.open = false;
		}
		onjump(node.id);
	}
</script>

<wa-drawer
	bind:this={drawer}
	label="Branches"
	open
	light-dismiss
	onwa-after-hide={(event: Event) => event.target === drawer && onclose()}
>
	{#if story.tree.length === 0}
		<p class="empty">Nothing yet.</p>
	{:else}
		<div class="map">
			<Tree
				roots={story.children(null)}
				children={(node) => story.children(node.id)}
				key={(node) => node.id}
				{label}
				main={(kids) => main(kids)}
				reveal={story.activeTurnId ? [story.activeTurnId] : []}
			>
				{#snippet content(node)}
					<div
						class="turn {node.role}"
						class:on-path={onPath.has(node.id)}
						class:current={node.id === story.activeTurnId}
					>
						<span class="marker" aria-hidden="true"></span>
						<span class="rule" class:to-edge={node.id === story.activeTurnId} aria-hidden="true"></span>
						<button type="button" class="node" disabled={story.busy} onclick={() => jump(node, false)}>
							{#if marked.has(node.id)}<wa-icon name="bookmark" variant="solid" label="Bookmarked"></wa-icon>{/if}
							<span>{label(node)}</span>
						</button>
						{#if node.id !== story.activeTurnId}
							<wa-button size="s" appearance="plain" pill disabled={story.busy} onclick={() => jump(node, true)}>
								<wa-icon src={divergeIcon} label={`Carry on from “${label(node)}”`}></wa-icon>
							</wa-button>
						{/if}
					</div>
				{/snippet}
			</Tree>
		</div>
	{/if}
</wa-drawer>

<style>
	/* The drawer is narrow: a slimmer tree than the roadmap's, with every
	   row one control tall and its marker centred on it. */
	.map {
		--row: 1.75rem;
		--tree-trunk-x: 0.6rem;
		--tree-trunk-width: 4px;
		--tree-bough-width: 2px;
		--tree-reach: 1rem;
		--tree-trunk-gap: 0.25rem;
		--tree-trunk-pad-start: 0.5rem;
		--tree-trunk-pad-end: 0.5rem;
		--tree-marker-size: 0.75rem;
		--tree-marker-y: calc(var(--row) / 2);
		--tree-gap: 0.25rem;
		--tree-step-gap: 0.25rem;
		--tree-indent: 1rem;
		--tree-elbow-radius: 0.4rem;
		/* The carry-on button, which straddles the rule under its turn. */
		--carry-on-size: var(--row);

		/* On the trunk: a touch larger, over the wider bark. */
		:global(.trunk-step) {
			--tree-marker-size: 0.9rem;
		}

		/* Off by just enough not to start under the drawer's own padding. */
		margin-inline-start: -0.25rem;
	}

	/* A list entry that moves somewhere: a native button, styled as a row. */
	.node {
		flex: 0 1 auto;
		display: flex;
		align-items: center;
		gap: 0.375rem;
		min-inline-size: 0;
		padding: 0.25rem 0.5rem;
		border: 0;
		border-radius: 0.4rem;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: 0.875rem;
		text-align: start;
		cursor: pointer;

		span {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		&:hover:not(:disabled) {
			background: var(--wa-color-surface-lowered, transparent);
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}
	}

	.turn {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		min-block-size: var(--row);
		min-inline-size: 0;
		color: var(--wa-color-text-quiet);

		&.on-path {
			color: var(--wa-color-text-normal);
		}

		&.current .node {
			font-weight: 600;
			background: var(--wa-color-brand-fill-quiet);
		}

		&.user .node {
			font-style: italic;
		}

		/* Clear of the carry-on buttons above and below, which overhang the
		   row at the drawer's edge. */
		padding-inline-end: calc(var(--carry-on-size) + 0.25rem);

		/* Placed against the tree's own row (positioned, and as wide as the
		   drawer), not this one, which is only as wide as its label. Raised,
		   so the next row, positioned too and later, does not take its
		   lower half's clicks. */
		wa-button {
			--wa-form-control-height: var(--carry-on-size);
			position: absolute;
			inset-inline-end: 0;
			inset-block-end: calc(-1 * var(--tree-step-gap) / 2 - var(--carry-on-size) / 2);
			z-index: 1;

			wa-icon {
				font-size: 1rem;
			}
		}
	}

	/* Opaque, so the lines that run into it stop at its edge. Filled on the
	   branch being read; ringed in the accent on the turn being read. */
	.marker {
		flex: none;
		inline-size: var(--tree-marker-size);
		block-size: var(--tree-marker-size);
		box-sizing: border-box;
		border-radius: 50%;
		border: 2px solid var(--tree-line-color, var(--wa-color-brand-40));
		background: var(--wa-color-surface-default);

		.on-path & {
			background: var(--tree-line-color, var(--wa-color-brand-40));
		}

		.current & {
			border-color: var(--accent-color);
			background: var(--accent-color);
			box-shadow: 0 0 0 2px color-mix(in oklab, var(--accent-color) 35%, transparent);
		}
	}

	/* The line between one turn and the next, from just past the marker to
	   the carry-on button; to the edge on the turn being read, which has
	   none. */
	.rule {
		position: absolute;
		inset-block-end: calc(-1 * var(--tree-step-gap) / 2);
		/* Up to the icon, a hair short of it: the button is wider than its icon. */
		inset-inline: calc(var(--tree-marker-size) + 0.25rem) calc(var(--carry-on-size) / 2 + 0.65rem);
		border-block-end: 1px solid var(--wa-color-surface-border);

		&.to-edge {
			inset-inline-end: 0;
		}
	}

	.empty {
		color: var(--wa-color-text-quiet);
	}
</style>
