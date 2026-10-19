<script lang="ts">
	import { untrack } from 'svelte';
	import { PICTURE_SIZE } from '$lib/daydream/image-prompt';
	import type { DaydreamStory } from '$lib/daydream/story.svelte';
	import DaydreamPicturePrompt from './DaydreamPicturePrompt.svelte';

	/**
	 * A passage's picture (docs/daydreams.md, "Pictures"): a skeleton the
	 * picture's shape while it is made or opened, then the picture. A passage
	 * that describes one not made yet offers to make it; one that could not be
	 * made, opened or kept says so beside a way to try again — nothing the
	 * story asked for is lost.
	 */
	let {
		story,
		turnId,
		debug = false
	}: {
		story: DaydreamStory;
		turnId: string;
		/** Debug mode is on on this device: tapping the picture shows what it was made from. */
		debug?: boolean;
	} = $props();

	const picture = $derived(story.pictureFor(turnId));
	const content = $derived(story.content(turnId));
	const description = $derived(content?.type === 'text' ? (content.meta?.image ?? null) : null);
	let showingPrompt = $state(false);

	$effect(() => {
		// A stored picture is opened once it is drawn; untracked, because
		// opening it writes the state this reads.
		if (picture?.status === 'opening') {
			untrack(() => void story.openPicture(turnId));
		}
	});
</script>

{#if showingPrompt && description}
	<DaydreamPicturePrompt
		{description}
		request={story.pictureRequest(turnId)}
		onclose={() => {
			showingPrompt = false;
		}}
	/>
{/if}

{#if picture}
	<!-- `data-kept` says when a picture is stored for good: tests wait on it. -->
	<div
		class="picture"
		style:--ratio="{PICTURE_SIZE.width} / {PICTURE_SIZE.height}"
		data-kept={picture.status === 'ready' ? picture.kept : undefined}
	>
		{#if picture.status === 'generating' || picture.status === 'opening'}
			<wa-skeleton effect="sheen" class="frame"></wa-skeleton>
			<span class="wa-visually-hidden">
				{picture.status === 'generating' ? 'Making a picture' : 'Opening the picture'}
			</span>
		{:else if picture.status === 'ready'}
			{#if debug && description}
				<!-- A native button: it wraps a picture, which wa-button's control
				     cannot lay out. -->
				<button type="button" class="show-prompt" onclick={() => {
					showingPrompt = true;
				}}>
					<img class="frame" src={picture.url} alt="This moment in the story" />
					<span class="wa-visually-hidden">Show the picture prompt</span>
				</button>
			{:else}
				<img class="frame" src={picture.url} alt="This moment in the story" />
			{/if}
			{#if picture.kept === 'failed'}
				<p class="note">
					This picture couldn’t be kept.
					<wa-button size="s" appearance="outlined" onclick={() => void story.keepPicture(turnId)}>
						Keep it
					</wa-button>
				</p>
			{/if}
		{:else if picture.status === 'failed'}
			<p class="note" role="status">
				{picture.error}
				{#if !picture.refused}
					<wa-button size="s" appearance="outlined" onclick={() => void story.retryPicture(turnId)}>
						Try again
					</wa-button>
				{/if}
			</p>
		{:else}
			<wa-button size="s" appearance="outlined" onclick={() => void story.illustrate(turnId)}>
				<wa-icon slot="start" name="image" variant="regular"></wa-icon>
				Picture this
			</wa-button>
		{/if}
	</div>
{/if}

<style>
	.picture {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.375rem;
	}

	/* A width of its own, not a share of the passage's: a passage is a bubble
	   as wide as its text, and a short one made the picture a sliver. Within
	   the bubble's own cap (90% of the thread) on any screen. */
	.frame {
		display: block;
		inline-size: min(22rem, 70vw);
		aspect-ratio: var(--ratio);
		block-size: auto;
		border-radius: var(--wa-border-radius-l);
		object-fit: cover;
	}

	wa-skeleton.frame {
		--border-radius: var(--wa-border-radius-l);

		/* The shimmer is its own part, a line high by default: without this the
		   frame was the picture's size and showed nothing. */
		&::part(indicator) {
			block-size: 100%;
		}
	}

	.show-prompt {
		display: block;
		block-size: auto;
		margin: 0;
		padding: 0;
		border: 0;
		background: none;
		cursor: zoom-in;

		.frame {
			inline-size: 100%;
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}
	}

	.note {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		color: var(--wa-color-text-quiet);
		font-size: var(--wa-font-size-s);
	}
</style>
