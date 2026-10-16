<script lang="ts">
	import type { DaydreamStory } from '$lib/daydream/story.svelte';
	import type { PassageMeta } from '$lib/sealed-kinds/daydreams';

	/**
	 * A roll the story offers at an uncertain moment: what it decides, what
	 * each face means, and a button that rolls a fair die in this browser
	 * (`dice.ts`). Ignoring it is fine — writing anything else moves past it.
	 * Rolling again means carrying on from the passage that offered it, which
	 * is a branch of its own, in the open.
	 */
	let {
		story,
		turnId,
		proposal
	}: {
		story: DaydreamStory;
		turnId: string;
		proposal: NonNullable<PassageMeta['roll']>;
	} = $props();

	const range = (min: number, max: number) => (min === max ? String(min) : `${min}–${max}`);
</script>

<wa-card class="roll">
	<div class="body">
		<p class="prompt"><wa-icon name="dice" variant="solid"></wa-icon> {proposal.prompt}</p>
		<ul class="outcomes">
			{#each proposal.outcomes as outcome (outcome.min)}
				<li><span class="faces">{range(outcome.min, outcome.max)}</span> {outcome.label}</li>
			{/each}
		</ul>
		<wa-button
			size="s"
			appearance="filled"
			variant="brand"
			disabled={story.busy}
			onclick={() => void story.rollFor(turnId, proposal)}
		>
			Roll a d{proposal.sides}
		</wa-button>
	</div>
</wa-card>

<style>
	.roll {
		align-self: flex-start;
		max-inline-size: 90%;
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: flex-start;
	}

	.prompt {
		margin: 0;
		font-weight: 600;
	}

	.outcomes {
		margin: 0;
		padding-inline-start: 1rem;
		font-size: 0.875rem;

		.faces {
			display: inline-block;
			min-inline-size: 2.5rem;
			font-variant-numeric: tabular-nums;
			color: var(--wa-color-text-quiet);
		}
	}
</style>
