<script lang="ts">
	import Tree from '$lib/components/tree/Tree.svelte';
	import { longestChild } from '$lib/tree';

	/**
	 * Tree with the plainest possible nodes, for its own tests: a marker that
	 * follows the contract (at the inline-start, `--tree-marker-size`,
	 * centred `--tree-marker-y` down) and a label.
	 */
	export type HarnessNode = { id: string; kids?: HarnessNode[]; hidden?: boolean };

	let {
		roots,
		trunk = false,
		reveal = []
	}: { roots: HarnessNode[]; trunk?: boolean; reveal?: string[] } = $props();

	const children = (node: HarnessNode) => node.kids ?? [];
	const main = longestChild(children);
</script>

<div class="harness">
	<Tree
		{roots}
		{children}
		key={(node) => node.id}
		label={(node) => node.id}
		hidden={(node) => node.hidden === true}
		main={trunk ? (kids) => main(kids) : undefined}
		{reveal}
	>
		{#snippet content(node, { hidden })}
			<span class="item" class:hidden={hidden} data-id={node.id}>
				<span class="marker"></span>
				<span class="text">{node.id}</span>
			</span>
		{/snippet}
	</Tree>
</div>

<style>
	.harness {
		inline-size: 30rem;
		line-height: 1.5;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		/* One line tall, so the marker centres on the first line. */
		min-block-size: 1lh;
	}

	.marker {
		flex: none;
		inline-size: var(--tree-marker-size, 1.25rem);
		block-size: var(--tree-marker-size, 1.25rem);
		box-sizing: border-box;
		border-radius: 50%;
		border: 2px solid currentColor;
		background: Canvas;
	}

	.hidden > * {
		opacity: var(--tree-dim-opacity, 0.3);
	}
</style>
