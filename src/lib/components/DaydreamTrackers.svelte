<script lang="ts">
	import type { DaydreamStory } from '$lib/daydream/story.svelte';
	import { METER_MAX, valueIn } from '$lib/daydream/trackers';
	import OverflowScroller from './OverflowScroller.svelte';

	/**
	 * What the story keeps track of, as it stands where the user is reading
	 * (docs/daydreams.md, "Trackers"): a meter as a bar, a count, a list's
	 * items, a line. Above the steering buttons, so it is in view as the
	 * story moves it. Display only — the user moves one by asking the story
	 * to, in their own words. Nothing for an idea with no trackers.
	 */
	let { story }: { story: DaydreamStory } = $props();

	const trackers = $derived(story.setup?.idea.trackers ?? []);
</script>

{#if trackers.length > 0}
	<OverflowScroller>
		<ul class="trackers" aria-label="What the story keeps track of">
			{#each trackers as tracker (tracker.id)}
				{const value = $derived(valueIn(tracker, story.trackers))}
				<li class="tracker" data-tracker={tracker.name}>
					<span class="name">{tracker.name}</span>
					{#if tracker.kind === 'meter' && typeof value === 'number'}
						<wa-progress-bar value={value} label={tracker.name} class="meter"></wa-progress-bar>
						<span class="value">{value}<span class="out-of">/{METER_MAX}</span></span>
					{:else if Array.isArray(value)}
						{#each value as item (item)}
							<span class="item">{item}</span>
						{:else}
							<span class="value quiet">none</span>
						{/each}
					{:else}
						<span class="value">{value === '' ? '—' : value}</span>
					{/if}
				</li>
			{/each}
		</ul>
	</OverflowScroller>
{/if}

<style>
	.trackers {
		display: flex;
		inline-size: max-content;
		gap: 1rem;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 0.8125rem;
	}

	.tracker {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		white-space: nowrap;
	}

	.name {
		color: var(--wa-color-text-quiet);
	}

	.meter {
		--track-height: 0.375rem;

		inline-size: 4.5rem;
	}

	.value {
		font-variant-numeric: tabular-nums;
	}

	.out-of,
	.quiet {
		color: var(--wa-color-text-quiet);
	}

	.item {
		padding: 0.0625rem 0.5rem;
		border-radius: var(--wa-border-radius-pill);
		background: var(--wa-color-surface-raised);
		border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
	}
</style>
