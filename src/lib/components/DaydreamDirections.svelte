<script lang="ts">
	import type { DaydreamStory } from '$lib/daydream/story.svelte';
	import OverflowScroller from './OverflowScroller.svelte';

	/**
	 * The buttons above the composer for steering without typing: Continue,
	 * which is always there, and the ones the story offers for where it is
	 * now — slower, crueler, skip ahead, sometimes "Surprise me" — which the
	 * model adds and removes passage by passage (`currentDirections`).
	 * Pressing one is recorded as a turn, so the story remembers what was
	 * asked for.
	 *
	 * They stay on one row and scroll sideways when there are more than fit,
	 * with a faded end and a chevron wherever there is more beyond it.
	 */
	let { story }: { story: DaydreamStory } = $props();
</script>

<OverflowScroller chevrons>
	<div class="directions">
		<wa-button
			size="s"
			appearance="outlined"
			variant="brand"
			pill
			disabled={story.busy}
			onclick={() => void story.continueStory()}
		>
			<wa-icon slot="start" name="forward" variant="solid"></wa-icon>
			Continue
		</wa-button>
		{#each story.directions as direction (direction.id)}
			<wa-button
				size="s"
				appearance="outlined"
				pill
				disabled={story.busy}
				onclick={() => void story.direct(direction)}
			>
				{#if direction.id === 'surprise-me'}<wa-icon slot="start" name="wand-magic-sparkles" variant="solid"></wa-icon>{/if}
				{direction.label}
			</wa-button>
		{/each}
	</div>
</OverflowScroller>

<style>
	.directions {
		display: flex;
		inline-size: max-content;
		gap: 0.375rem;
	}
</style>
