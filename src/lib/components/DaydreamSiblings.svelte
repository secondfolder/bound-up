<script lang="ts">
	import type { DaydreamStory } from '$lib/daydream/story.svelte';

	/**
	 * `‹ 2/3 ›` under a turn that has others beside it: another take on a
	 * passage, or a different thing said at the same point. Moving to one
	 * shows the branch through it, where it was last left (`showBranch`). The
	 * whole story stays one daydream; this is how its branches are reached
	 * without leaving the page.
	 */
	let { story, turnId }: { story: DaydreamStory; turnId: string } = $props();

	const siblings = $derived(story.siblings(turnId));
	const index = $derived(siblings.findIndex((node) => node.id === turnId));
</script>

{#if siblings.length > 1}
	<div class="siblings">
		<wa-button
			size="s"
			appearance="plain"
			pill
			disabled={index <= 0 || story.busy}
			onclick={() => {
				const previous = siblings[index - 1];
				if (previous) {
					void story.showBranch(previous.id);
				}
			}}
		>
			<wa-icon name="chevron-left" variant="solid" label="Previous version"></wa-icon>
		</wa-button>
		<span class="count">{index + 1}/{siblings.length}</span>
		<wa-button
			size="s"
			appearance="plain"
			pill
			disabled={index >= siblings.length - 1 || story.busy}
			onclick={() => {
				const next = siblings[index + 1];
				if (next) {
					void story.showBranch(next.id);
				}
			}}
		>
			<wa-icon name="chevron-right" variant="solid" label="Next version"></wa-icon>
		</wa-button>
	</div>
{/if}

<style>
	.siblings {
		display: inline-flex;
		align-items: center;
		gap: 0.125rem;
		color: var(--wa-color-text-quiet);
		font-size: 0.8125rem;

		wa-button {
			--wa-form-control-height: 1.75rem;
		}
	}
</style>
