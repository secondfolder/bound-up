<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import HalftoneOverlay from '$lib/components/HalftoneOverlay.svelte';

	// The root layout whitelists this — `locals.user` itself never crosses.
	const user = $derived(page.data.user);
</script>

<svelte:head>
	<!-- Page-scoped body rule, in the layout's idiom: each shell sets the body
	     rules it needs through svelte:head so they mount and unmount with it.
	     On both body and html — the html one is what paints the overscroll
	     area, and without it dragging past the top reveals the default white. -->
	<style>
	html,
	body {
		background: linear-gradient(to right, #943700 10%, #711500 100%);
	}
</style>
</svelte:head>

<HalftoneOverlay
	pattern="line"
	angle={15}
	contrast={0.4}
	cellSize={6}
	noiseStrength={1.3}
	speed={0}
/>

<div class="landing">
	<header>
		<h1>Bound Up</h1>
		<span class="subtitle">Your Kink Companion</span>
	</header>

	<!-- Dead centre, above the overlay: the rings radiate from the centre of
		     the captured <body>, and this stack is placed at 50%/50% of the same
		     box (the overlay makes <body> positioned, so it is the containing
		     block here too) so the button sits on the rings' origin.
		     z-index 10000 beats the overlay's 9999 — everything else on
		     the page stays under the effect, this one element floats on it.
		     It is also excluded from the halftone capture, so the button is not
		     screened twice — once live and once as a static ghost under it. -->
	<div class="cta" data-halftone-ignore="true">
		{#if user}
			<a class="big" href={resolve('/(auth-required)/(app)/home')}><span>Start</span></a>
		{:else}
			<!-- The aria-label says where the big "Sign up" goes, since on its own
			     the word is a verb with no object for anyone navigating by link
			     list. -->
			<a class="big" href={resolve('/(public)/signup')} aria-label="Sign up for Bound Up">
				<span>Sign up</span>
			</a>
			<a class="small" href={resolve('/(public)/login')}>Log in</a>
		{/if}
	</div>
</div>

<style>
	@font-face {
		font-family: 'Muddy Tractor';
		src: url('/fonts/muddy-tractor.woff2') format('woff2');
		font-display: swap;
	}

	.landing {
		/* Transparent: the wash behind the halftone overlay lives on the body
		   (see the svelte:head style) so it fills the whole page, header
		   included, not just this column. */
		display: flex;
		flex-direction: column;
		/* Header toward the top rather than centred: the centre of the page
		   belongs to the CTA, which sits on the rings' origin point. */
		justify-content: flex-start;
		padding-block-start: 6vh;
		/* Fills the layout container, which is already viewport-tall from the
		   (public) body rule. A hard 100svh here would add the header block
		   back in and push the page into a scroll on pages that have one. */
		flex: 1 1 auto;

		text-align: center;

		header {
			h1 {
				/* Was a flat 5rem, which ran off both edges of a phone. The vw
				   term keeps the desktop size and shrinks it to fit below that. */
				font-family: 'Muddy Tractor', var(--wa-font-family-body);
				font-size: clamp(2.5rem, 10vw, 5rem);
				margin: 0;
				color: #ffac00;
			}
			.subtitle {
				font-size: clamp(1.25rem, 6vw, 2rem);
				/* Not --wa-color-text-secondary: that token is the light-theme
				   near-black, which is illegible on the dark rust wash and makes
				   the halftone overlay look like it skips the subtitle — black
				   ink over near-black text is imperceptible, so the subtitle
				   reads as floating above the effect. A light tint from the h1's
				   family instead. */
				color: #ffac00;
				line-height: 1.1;
			}
		}
	}

	.cta {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 10000;
		/* The button, not the whole logged-out stack, owns the page centre.
		   The small login link sits visually under it but is taken out of flow,
		   otherwise it makes the centred flex column taller and pushes the sign
		   up button upward off the rings' origin. */
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.small {
		position: absolute;
		top: calc(100% + 0.75rem);
		left: 50%;
		transform: translateX(-50%);
		color: #ffcf7a;
		text-decoration: underline;
		white-space: nowrap;
		margin-top: 1em;
		font-weight: bold;
		font-size: 1.2em;
		transition: color 0.1s ease;

		&:hover {
			color: #ffac00;
		}

		&:focus-visible {
			outline: 2px solid #ffcf7a;
			outline-offset: 3px;
		}
	}

	/* Short viewports: dead-centring the CTA puts it on top of the title, so
	   give the centre back and let the stack flow under the header instead.
	   After the base `.cta` and `.small` rules on purpose: same specificity,
	   so only a later rule can override them.
	   The rings' origin is still the page centre — the CTA just no longer
	   claims it. */
	@media (max-height: 30em) {
		.cta {
			position: static;
			transform: none;
			margin-block-start: 2.5em;
		}

		.small {
			position: static;
			transform: none;
			margin-block-start: 0.75rem;
		}
	}

	.big {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.1em 0.8em 0.2em;
		/* Separate the text from the distorted shape: the second turbulence pass
		   is supposed to chew the outline, and when the filter lived on the
		   anchor it mostly showed up as wobble in the glyphs and shadow instead.
		   The decorative ::before pill now carries the filter; the label stays
		   crisp and all of the displacement budget is spent on the silhouette. */
		isolation: isolate;
		color: #ffac00;
		text-shadow: 0 6px 24px rgba(0, 0, 0, 0.55);
		font-family: var(--wa-font-family-body);
		font-size: clamp(1.5rem, 20vw, 4em);
		font-weight: 700;
		text-decoration: none;

		&::before {
			content: '';
			position: absolute;
			inset: 0;
			z-index: -1;
			border-radius: 999px;
			border: #ffac00 2px solid;
			background: #ffac004d;
			box-shadow: 0 6px 24px rgb(0 0 0 / 0.35);
		}

		span {
			position: relative;
			z-index: 1;
			transition: scale 0.1s ease;

			&:hover {
				scale: 1.03;
			}
		}

		&:focus-visible {
			outline: 2px solid #ffcf7a;
			outline-offset: 3px;
		}
	}
</style>
