<script lang="ts">
	import type { DaydreamStory } from '$lib/daydream/story.svelte';
	import { describeMove } from '$lib/daydream/trackers';

	/**
	 * Under a passage that moved what the story keeps track of: what moved,
	 * and from what to what — "Submission 40 → 55" — so the readout above the
	 * buttons never changes without saying where (docs/daydreams.md,
	 * "Trackers"). Nothing for a passage that moved none.
	 */
	let { story, turnId }: { story: DaydreamStory; turnId: string } = $props();

	const moves = $derived(story.trackerMovesAt(turnId));
</script>

{#if moves.length > 0}
	<li class="tracker-note" data-turn-id={turnId}>
		<wa-icon name="chart-simple" variant="solid"></wa-icon>
		<span>{moves.map(describeMove).join(' · ')}</span>
	</li>
{/if}

<style>
	.tracker-note {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.375rem;
		font-size: 0.8125rem;
		font-style: italic;
		color: var(--wa-color-text-quiet);
	}
</style>
