<script lang="ts">
	import { untrack } from 'svelte';
	import { PICTURE_SIZE } from '$lib/daydream/image-prompt';
	import { FALLBACK_PICTURE_ESTIMATE_MS, pictureProgress } from '$lib/daydream/picture-progress';
	import type { DaydreamStory } from '$lib/daydream/story.svelte';
	import DaydreamPicturePrompt from './DaydreamPicturePrompt.svelte';

	/**
	 * A passage's picture (docs/daydreams.md, "Pictures"): a placeholder the
	 * picture's shape while it is made or opened — a skeleton, over the last
	 * picture blurred when there is one — then the picture. A passage
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

	/*
	 * How long a picture has been in the making, and the ring drawn against
	 * how long one usually takes here (`picture-progress.ts`). Ticks a few
	 * times a second, which the ring's own transition smooths between.
	 */
	const making = $derived(picture?.status === 'generating' ? picture : null);
	let now = $state(Date.now());
	$effect(() => {
		if (making === null) {
			return;
		}
		now = Date.now();
		const tick = setInterval(() => {
			now = Date.now();
		}, 250);
		return () => clearInterval(tick);
	});
	const elapsedMs = $derived(making ? Math.max(0, now - making.startedAt) : 0);
	const waited = $derived(Math.floor(elapsedMs / 1000));
	const progress = $derived(
		making ? pictureProgress(elapsedMs, making.estimateMs ?? FALLBACK_PICTURE_ESTIMATE_MS) : 0
	);
	/** The picture before this one on its branch, for the placeholder to be drawn from. */
	const previous = $derived(
		picture?.status === 'generating' || picture?.status === 'opening'
			? story.previousPictureUrl(turnId)
			: null
	);

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
			<div class="pending frame">
				{#if previous}
					<!-- The last picture, blurred past recognising: the next one
					     tends to share its colours and light, so this is a better
					     guess at it than grey. Decorative, so no alt. -->
					<img class="echo" src={previous} alt="" />
					<wa-skeleton effect="pulse" class="veil"></wa-skeleton>
				{:else}
					<wa-skeleton effect="sheen"></wa-skeleton>
				{/if}
				<!-- A circle round the ring, words only for a screen reader: the
				     stage never changes while the ring is up, so naming it on screen
				     said the same thing for the whole wait. -->
				<div class="stage">
					{#if making}
						<wa-progress-ring value={progress * 100} label="Estimated progress">
							<!-- For the eye: a reader would have it read out every few seconds. -->
							<span class="waited" aria-hidden="true">{waited}s</span>
						</wa-progress-ring>
						<span class="wa-visually-hidden">Making the picture</span>
					{:else}
						<wa-spinner></wa-spinner>
						<span class="wa-visually-hidden">Opening the picture</span>
					{/if}
				</div>
			</div>
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
	   as wide as its text, and a short one made the picture a sliver. Capped
	   in both directions, by working out the width a height cap allows from
	   the picture's ratio: setting a max height beside a fixed width would
	   crop the picture rather than shrink it. Within the bubble's own cap
	   (90% of the thread) on a phone, and short of the whole window on a
	   short one. */
	.frame {
		display: block;
		inline-size: min(15rem, 70vw, calc(min(22rem, 60dvh) * var(--ratio)));
		aspect-ratio: var(--ratio);
		block-size: auto;
		border-radius: var(--wa-border-radius-l);
		object-fit: cover;
	}

	.pending {
		position: relative;
		display: grid;
		overflow: hidden;

		> * {
			grid-area: 1 / 1;
		}
	}

	wa-skeleton {
		/* The shimmer is its own part, a line high by default: without this the
		   frame was the picture's size and showed nothing. Its radius is the
		   part's too, a pill by default, and no custom property reaches it: a
		   `--border-radius` on the host did nothing, and a picture-sized pill
		   is an oval. */
		&::part(indicator) {
			block-size: 100%;
			border-radius: var(--wa-border-radius-l);
		}
	}

	/* Blurred well past anything recognisable, the way a BlurHash looks, and
	   scaled up so the blur's soft, see-through edge falls outside the frame. */
	.echo {
		inline-size: 100%;
		block-size: 100%;
		object-fit: cover;
		filter: blur(1.75rem) saturate(1.2) brightness(0.85);
		transform: scale(1.3);
	}

	/* The skeleton's pulse over the last picture, kept faint. The pulse fades
	   the veil between full and 40% opacity, which Web Awesome's own
	   animation sets and nothing outside can tune, so its depth is the veil's
	   own: thin enough that the colours barely breathe. The steady dimming
	   is the picture's own `brightness` instead, which does not pulse. */
	wa-skeleton.veil {
		--color: color-mix(in oklab, var(--wa-color-surface-default) 30%, transparent);
	}

	/* Positioned so it paints over the echo, whose transform lifts it above
	   anything left in flow: without this the ring sat under the blur. */
	.stage {
		position: relative;
		display: grid;
		place-items: center;
		align-self: center;
		justify-self: center;
		color: var(--wa-color-text-normal);
	}

	wa-progress-ring {
		--size: 4.5rem;
		--track-width: 4px;
		--indicator-color: var(--wa-color-brand-fill-loud);
		/* About one tick, so the ring moves on steadily between them. */
		--indicator-transition-duration: 250ms;

		/* A soft shadow rather than a panel behind it, so it reads over a
		   bright patch of the last picture without hiding it. On the host, so
		   the track and the indicator both get it. */
		filter: drop-shadow(0 0 0.25rem rgb(0 0 0 / 0.45));
	}

	wa-spinner {
		font-size: 2.5rem;
	}

	/* Its own shadow as well as the ring's, which a drop shadow gives the
	   glyphs only faintly. */
	.waited {
		font-size: var(--wa-font-size-m);
		font-variant-numeric: tabular-nums;
		text-shadow: 0 0 0.25rem rgb(0 0 0 / 0.7);
	}

	.show-prompt {
		display: block;
		block-size: auto;
		margin: 0;
		padding: 0;
		border: 0;
		background: none;
		cursor: zoom-in;

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
