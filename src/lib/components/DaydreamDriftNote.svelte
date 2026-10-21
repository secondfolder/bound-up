<script lang="ts">
	import { ModelWatch } from '$lib/daydream/model-watch.svelte';
	import type { DaydreamStory } from '$lib/daydream/story.svelte';
	import type { SuggestFailure } from '$lib/daydream/suggest';
	import type { CatchUp } from '$lib/daydream/suggestions';
	import DaydreamCatchUpDialog from './DaydreamCatchUpDialog.svelte';
	import ModelProgress from './ModelProgress.svelte';
	import SuggestionProblem from './SuggestionProblem.svelte';

	/**
	 * Under the passage that said the story has moved on from its setup: the
	 * offer to bring the idea up to date (docs/daydreams.md, "When the story
	 * moves on"). "Update the idea" asks for the changes and shows them to
	 * accept or edit; "Not now" puts the offer away until the story has gone a
	 * few passages further (`driftOffer`).
	 */
	let {
		story,
		turnId,
		debug = false
	}: { story: DaydreamStory; turnId: string; debug?: boolean } = $props();

	let asking = $state(false);
	/** How the ask is going, while it is out (`ModelProgress`). */
	let watching: ModelWatch | null = $state(null);
	let problem: SuggestFailure | null = $state(null);
	let proposed: CatchUp | null = $state(null);

	async function ask() {
		asking = true;
		problem = null;
		const watch = new ModelWatch(debug);
		watching = watch;
		const answer = await story.catchUp(turnId, watch.watch);
		asking = false;
		watching = null;
		if (answer.ok) {
			proposed = answer.value;
		} else {
			problem = answer;
		}
	}
</script>

<li class="drift-note" data-turn-id={turnId}>
	<span>The story has moved on from its idea.</span>
	<wa-button size="s" appearance="outlined" disabled={asking} onclick={() => void ask()}>
		{asking ? 'Looking at the story…' : 'Update the idea'}
	</wa-button>
	<wa-button size="s" appearance="plain" disabled={asking} onclick={() => story.answerDrift(turnId)}>
		Not now
	</wa-button>
	{#if watching}<div class="progress"><ModelProgress watch={watching} /></div>{/if}
	{#if problem}<SuggestionProblem {problem} {debug} />{/if}
	{#if proposed && story.setup}
		<DaydreamCatchUpDialog
			setup={story.setup}
			{proposed}
			onsave={(accepted) => story.applyCatchUp(turnId, accepted)}
			onclose={() => {
				proposed = null;
			}}
		/>
	{/if}
</li>

<style>
	.drift-note {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		font-size: 0.8125rem;
		font-style: italic;
		color: var(--wa-color-text-quiet);

		wa-button {
			--wa-form-control-height: 1.75rem;

			font-style: normal;
		}

		/* A line of its own under the buttons, the live chat full width. */
		.progress {
			flex-basis: 100%;
			font-style: normal;
		}
	}
</style>
