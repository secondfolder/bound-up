<script lang="ts">
	import { asset } from '$app/paths';
	import RoadmapRecent from '$lib/components/roadmap/RoadmapRecent.svelte';

	// The screenshots are real screens, staged and captured by
	// `npm run screenshots:landing` (e2e/landing-screenshots.capture.ts), so
	// they can be retaken whenever the screens change rather than going stale.
	// Each one's alt describes what it shows, since for a screen reader the
	// picture is the only evidence behind the claim beside it.
	const features = [
		{
			id: 'partners',
			icon: 'link',
			title: 'Link up with a partner',
			body: 'Invite your partner with a link and agree who is in control. Everything the two of you share lives on one page: messages, tasks and rewards.',
			image: 'partner',
			alt: "Morgan's page as Riley sees it: Riley's Mistress, with cards for their messages, tasks and rewards."
		},
		{
			id: 'tasks',
			icon: 'list-check',
			title: 'Tasks that earn credits',
			body: 'Set tasks for yourself, or have your partner set them for you. One-off or on a schedule, each worth credits once it is done.',
			image: 'tasks',
			alt: "Morgan's task list for Riley: kneel at the door for two credits, and a morning check-in for one."
		},
		{
			id: 'rewards',
			icon: 'gift',
			title: 'Rewards worth working for',
			body: 'Spend those credits on rewards you or your partner set aside, from picking the movie to a whole night off.',
			image: 'rewards',
			alt: 'Rewards from Morgan with 5 credits to spend: a night off needs 8, and breakfast in bed is ready to claim.'
		},
		{
			id: 'messages',
			icon: 'message',
			title: 'Messages just for the two of you',
			body: 'Threads with rich text, link previews and photos that self-destruct. Messages are encrypted on your device before they are sent, so the server only ever stores ciphertext.',
			image: 'messages',
			alt: 'A message thread: Morgan asks how the outfit went, Riley says they wore it all day, and Morgan replies "Good. Three credits, well earned."'
		}
	] as const;
</script>

<section class="features" aria-labelledby="features-heading">
	<h2 id="features-heading">Features</h2>

	<ul class="overview">
		{#each features as feature (feature.id)}
			<li>
				<figure>
					<img
						src={asset(`/landing/${feature.image}.jpg`)}
						alt={feature.alt}
						width="390"
						height="780"
						loading="lazy"
						decoding="async"
					/>
				</figure>
				<div class="copy">
					<wa-icon name={feature.icon} variant="solid" aria-hidden="true"></wa-icon>
					<h3>{feature.title}</h3>
					<p>{feature.body}</p>
				</div>
			</li>
		{/each}
	</ul>

	<RoadmapRecent />
</section>

<style>
	.features {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2rem;
		inline-size: 100%;
		margin-block-end: 6rem;
		/* The rows lay themselves out from this section's width: the public
		   column is capped at 800px, so the window's width says little. */
		container-type: inline-size;

		h2 {
			margin: 0;
			font-family: var(--font-display);
			font-size: clamp(2rem, 8vw, 3rem);
			color: var(--accent-color);
		}
	}

	.overview {
		display: flex;
		flex-direction: column;
		gap: 3rem;
		inline-size: 100%;
		list-style: none;
		margin: 0;
		padding: 0;

		> li {
			/* Web Awesome's native styles indent every `li` by 1.125em. */
			margin: 0;
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 1.25rem;
			text-align: center;
		}
	}

	figure {
		margin: 0;
		flex: 0 0 auto;
		inline-size: min(16rem, 70%);
	}

	/* A phone-shaped frame, so a screenshot reads as the app on a phone
	   rather than as part of this page. */
	img {
		display: block;
		inline-size: 100%;
		block-size: auto;
		border: 1px solid var(--wa-color-brand-border-quiet);
		border-radius: var(--wa-border-radius-l);
		box-shadow: 0 12px 36px rgb(0 0 0 / 0.45);
	}

	.copy {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		max-inline-size: 26rem;

		wa-icon {
			font-size: 1.75rem;
			color: var(--accent-color);
		}

		h3 {
			margin: 0;
			font-size: var(--wa-font-size-2xl);
			color: var(--wa-color-text-normal);
			line-height: 1.15;
		}

		p {
			margin: 0;
			color: var(--wa-color-text-quiet);
			line-height: 1.5;
		}
	}

	/* Side by side once there is room, alternating which side the picture
	   is on so the eye zigzags down the list. */
	@container (min-width: 36rem) {
		.overview > li {
			flex-direction: row;
			justify-content: center;
			gap: 2.5rem;
			text-align: start;

			&:nth-child(even) {
				flex-direction: row-reverse;
			}
		}

		figure {
			inline-size: 15rem;
		}

		.copy {
			align-items: flex-start;
			flex: 1 1 0;
		}
	}
</style>
