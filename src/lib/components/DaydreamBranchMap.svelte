<script lang="ts">
	import type { DaydreamStory } from '$lib/daydream/story.svelte';
	import type { DaydreamTreeNodeView } from '$lib/types';

	/**
	 * Every branch of the story at once: an outline where a run of turns one
	 * after another reads as a line, and the story forks into nested lists
	 * wherever there is more than one way it went. The branch being read is
	 * marked, and so are bookmarks. Picking a turn moves to the branch through
	 * it, where it was last left; "carry on from here" makes that turn the
	 * place to continue from.
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

	/** A run of turns that follow one another without forking, starting at `node`. */
	function run(node: DaydreamTreeNodeView): {
		nodes: DaydreamTreeNodeView[];
		forks: readonly DaydreamTreeNodeView[];
	} {
		const nodes = [node];
		let kids = story.children(node.id);
		while (kids.length === 1) {
			const [only] = kids;
			if (!only) {
				break;
			}
			nodes.push(only);
			kids = story.children(only.id);
		}
		return { nodes, forks: kids };
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

{#snippet branch(start: DaydreamTreeNodeView)}
	{const branchRun = $derived(run(start))}
	<ol class="run">
		{#each branchRun.nodes as node (node.id)}
			<li class:on-path={onPath.has(node.id)} class:current={node.id === story.activeTurnId} class={node.role}>
				<button type="button" class="node" disabled={story.busy} onclick={() => jump(node, false)}>
					{#if marked.has(node.id)}<wa-icon name="bookmark" variant="solid" label="Bookmarked"></wa-icon>{/if}
					<span>{label(node)}</span>
				</button>
				{#if node.id !== story.activeTurnId}
					<wa-button size="s" appearance="plain" pill disabled={story.busy} onclick={() => jump(node, true)}>
						<wa-icon name="code-branch" variant="solid" label={`Carry on from “${label(node)}”`}></wa-icon>
					</wa-button>
				{/if}
			</li>
		{/each}
	</ol>
	{#if branchRun.forks.length > 1}
		<ul class="forks">
			{#each branchRun.forks as fork (fork.id)}
				<li>{@render branch(fork)}</li>
			{/each}
		</ul>
	{/if}
{/snippet}

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
		<ul class="forks roots">
			{#each story.children(null) as root (root.id)}
				<li>{@render branch(root)}</li>
			{/each}
		</ul>
	{/if}
</wa-drawer>

<style>
	.forks {
		list-style: none;
		margin: 0;
		padding-inline-start: 0.75rem;
		border-inline-start: 1px solid var(--wa-color-surface-border);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;

		&.roots {
			padding-inline-start: 0;
			border: 0;
		}
	}

	/* A list entry that moves somewhere: a native button, styled as a row. */
	.node {
		flex: 1 1 auto;
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

	.run {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;

		li {
			display: flex;
			align-items: center;
			gap: 0.25rem;
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
		}

		wa-button {
			--wa-form-control-height: 1.75rem;
		}
	}

	.empty {
		color: var(--wa-color-text-quiet);
	}
</style>
