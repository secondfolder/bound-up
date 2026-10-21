<script lang="ts">
	import type { DaydreamStory } from '$lib/daydream/story.svelte';
	import { describeSettings } from '$lib/daydream/story-settings';

	/**
	 * Under a passage that changed a setting because the user asked for it
	 * ("make these longer"): what is set now, so the change is never made
	 * behind their back, and Undo while it still stands
	 * (docs/daydreams.md, "Settings the story changes"). The Dials show the
	 * new values too. Nothing at all for a passage that changed none.
	 */
	let { story, turnId }: { story: DaydreamStory; turnId: string } = $props();

	const changed = $derived(story.settingsChangedBy(turnId));
	let undoing = $state(false);
	let problem: string | null = $state(null);

	async function undo() {
		undoing = true;
		problem = await story.undoSettings(turnId);
		undoing = false;
	}
</script>

{#if changed}
	<li class="settings-note" data-turn-id={turnId}>
		<wa-icon name="sliders" variant="solid"></wa-icon>
		<span>{describeSettings(changed.settings)}</span>
		{#if changed.inEffect}
			<wa-button size="s" appearance="plain" disabled={undoing} onclick={() => void undo()}>
				Undo
			</wa-button>
		{/if}
		{#if problem}<span class="problem" role="alert">{problem}</span>{/if}
	</li>
{/if}

<style>
	.settings-note {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.375rem;
		font-size: 0.8125rem;
		font-style: italic;
		color: var(--wa-color-text-quiet);

		wa-button {
			--wa-form-control-height: 1.75rem;

			font-style: normal;
		}

		.problem {
			color: var(--wa-color-text-danger);
		}
	}
</style>
