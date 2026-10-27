<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import LandingFeatures from '$lib/components/landing/LandingFeatures.svelte';
	import RoadmapHighlights from '$lib/components/roadmap/RoadmapHighlights.svelte';
	import ShareMeta from '$lib/components/ShareMeta.svelte';
	import { GrainEffect } from '$lib/effects/grain-effect.svelte';
	import { HalftoneLinesEffect } from '$lib/effects/halftone-lines-effect.svelte';
	import { mix, SOFT_LIGHT_NEUTRAL } from '$lib/effects/mix.svelte';
	import VfxPageSnapshot from '$lib/vfx/VfxPageSnapshot.svelte';
	import VfxProvider from '$lib/vfx/VfxProvider.svelte';

	// The root layout whitelists this — `locals.user` itself never crosses.
	const user = $derived(page.data.user);

	// The halftone shows at 0.4 and fades out from 300px down the page; the
	// grain runs the whole length of the page at full strength. The halftone
	// fades to mid-grey, not to the page, because the canvas is soft-lit over
	// the page and grey is soft-light's identity — see SOFT_LIGHT_NEUTRAL.
	// Soft-light is linear in the blend layer either side of that grey, so
	// mixing toward it at 0.4 is exactly the halftone layer at CSS opacity 0.4.
	const halftone = mix(
		new HalftoneLinesEffect({ pattern: 'line', angle: 15, contrast: 0.4, cellSize: 8 }),
		{ toward: SOFT_LIGHT_NEUTRAL, opacity: 0.4 }
	);
	const grain = new GrainEffect({ strength: 1.3 });

	$effect(() => {
		halftone.fade = { from: 300, to: 800 };
	});
</script>

<svelte:head>
	<title>Bound Up</title>
	<!-- The wash is the app-wide one (src/lib/theme.css). Only the CSS
	     texture is switched off here: the effects below draw this page's
	     halftone and grain, and the two drawn together doubled the grain. -->
	<style>
	:root {
		--page-texture: none;
	}
</style>
</svelte:head>
<ShareMeta
	title="Bound Up"
	description="Explore your kinks and manage your dynamics. Either with a partner or solo."
/>

<svelte:window />

<!-- pixelRatio 1: one canvas pixel per CSS px, the unit the screen's cell size
     and the grain are calibrated in. autoplay off: the page draws once per
     capture and holds still after, rather than re-blending the whole viewport
     every frame — which kept Firefox's GPU process near 40% CPU. -->
<VfxProvider pixelRatio={1} autoplay={false} blend="soft-light">
	<VfxPageSnapshot effect={[halftone, grain]} />
</VfxProvider>

<div class="landing">
	<header>
		<!-- The tag is left out of the page capture: it stamps itself on as the
		     page arrives, and a capture taken mid-stamp would screen a ghost of
		     it at the wrong size. Absolutely placed, so removing it from the
		     clone moves nothing else. It stays under the effects canvas, so the
		     grain still covers it. -->
		<h1>Bound Up <span class="beta" data-vfx-capture-ignore="true">beta</span></h1>
		<div class="subtitle">
			Explore your kinks and manage your dynamics. Either with a partner or solo.
		</div>
	</header>

	<!-- Above the effects: z-index 10000 beats the effects canvas's 9999 — everything else on
		     the page stays under the effect, this one element floats on it.
		     It is also excluded from the page capture (the attribute is
		     PAGE_SNAPSHOT_IGNORE_ATTRIBUTE in $lib/vfx/snapshot), so the button is not
		     screened twice — once live and once as a static ghost under it. -->
	<div class="cta" data-vfx-capture-ignore="true">
		{#if user}
			<a class="big" href={resolve('/(auth-required)/(app)/today')}>Open</a>
		{:else}
			<!-- The aria-label says where the big "Sign up" goes, since on its own
			     the word is a verb with no object for anyone navigating by link
			     list. -->
			<a class="big" href={resolve('/(public)/signup')} aria-label="Sign up for Bound Up">
				Sign up
			</a>
			<a class="small" href={resolve('/(public)/login')}>Log in</a>
		{/if}
	</div>

	<!-- Everything after the CTA is left out of the page capture, like the CTA
	     itself, but stays under the effects canvas (which has pointer-events:
	     none, so its links take clicks) — the grain carries on over it. It has
	     to be left out because the capture drops the CTA from its clone
	     altogether (`excludeMode: 'remove'`, see VfxPageSnapshot), so
	     everything after the CTA sits a CTA's height higher in the clone than
	     on the page: screened, the roadmap section left a ghost of itself up
	     behind the "Sign up" button. One wrapper rather than an attribute per
	     section, so a section added here later cannot forget it. The halftone
	     has all but faded out by this depth anyway. -->
	<div class="below-cta" data-vfx-capture-ignore="true">
		<LandingFeatures />
		<RoadmapHighlights />
	</div>
</div>

<style>
	/* Both faces are declared app-wide, in src/lib/theme.css. */

	.landing {
		/* Transparent: the wash behind the halftone overlay lives on the body
		   (the app-wide one in src/lib/theme.css) so it fills the whole page, header
		   included, not just this column. */
		display: flex;
		flex-direction: column;
		/* Header toward the top; the CTA takes the space below it. */
		justify-content: flex-start;
		padding-block-start: 6vh;
		/* Fills the layout container, which is already viewport-tall from the
		   (public) body rule. A hard 100svh here would add the header block
		   back in and push the page into a scroll on pages that have one. */
		flex: 1 1 auto;

		text-align: center;

		color: var(--accent-color);
		font-family: var(--wa-font-family-body);

		header {
			display: flex;
			flex-direction: column;
			align-items: center;
			text-align: center;
			gap: 1rem;

			h1 {
				/* Was a flat 5rem, which ran off both edges of a phone. The vw
				   term keeps the desktop size and shrinks it to fit below that. */
				font-family: var(--font-display);
				font-weight: 900;
				font-variation-settings: var(--font-display-variation);
				font-size: clamp(2.5rem, 10vw, 7em);
				margin: 0;
				/* Never wraps, so the page capture cannot wrap it either. The
				   header centres its children, so the h1 is exactly as wide as
				   its text, and SnapDOM pins its clone to that fractional width.
				   Firefox measured the cloned text a hair wider, pushed "Up" onto
				   a second line, and the screened title sat as a two-line ghost
				   under the real one. */
				white-space: nowrap;
				/* Anchors the beta tag. */
				position: relative;

				/* Absolutely positioned so it takes no width: the header centres
				   the h1 by its box, and an inline tag would pull "Bound Up" off
				   centre by its own width. Sized in em of the h1, so it follows
				   the clamp down to a phone. */
				.beta {
					position: absolute;
					top: 0.1em;
					left: 100%;
					margin-left: -0.8em;
					padding: 0.15em 0.4em;
					font-family: var(--wa-font-family-body);
					/* With a floor: 0.18em of a phone's 40px title is 7px. */
					font-size: max(0.18em, 0.6875rem);
					font-weight: 700;
					letter-spacing: 0.08em;
					line-height: 1;
					text-transform: uppercase;
					border: 2px solid var(--accent-color);
					border-radius: 0.3em;
					rotate: 8deg;

					/* Stamped on, like ink on paper: dropped from above the page
					   at a slant, overshooting its own size as it lands. */
					@media (prefers-reduced-motion: no-preference) {
						animation: stamp 0.45s cubic-bezier(0.3, 1.6, 0.5, 1) 0.4s both;
					}
				}
			}
			.subtitle {
				font-size: clamp(1.25rem, 4vw, 2rem);
				/* Not --wa-color-text-secondary: that token is the light-theme
				   near-black, which is illegible on the dark rust wash and makes
				   the halftone overlay look like it skips the subtitle — black
				   ink over near-black text is imperceptible, so the subtitle
				   reads as floating above the effect. A light tint from the h1's
				   family instead. */
				line-height: 1.1;
				font-weight: 700;
				max-width: 100%;
				width: 700px;
			}
		}
	}

	.cta {
		/* Positioned only so the z-index applies. */
		position: relative;
		z-index: 10000;
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		gap: 0.75rem;
		margin-block-start: 4em;
		/* Was 50vw, when the CTA was the last thing on the page and the margin
		   only gave the halftone's fade room to play out. The roadmap section
		   under it does that now, and a half-screen gap would leave it looking
		   like the page had ended. */
		margin-block-end: 6rem;
		font-weight: 700;
	}

	.small {
		/* The tint rather than the amber: this sits high on the wash, where the
		   amber measures about 4:1 against it. */
		color: var(--accent-tint);
		text-decoration: underline;
		white-space: nowrap;
		margin-top: 1em;
		font-weight: bold;
		font-size: 1.2em;
		transition: color 0.1s ease;

		&:hover {
			color: var(--wa-color-text-normal);
		}

		&:focus-visible {
			outline: 2px solid var(--wa-color-focus);
			outline-offset: 3px;
		}
	}

	/*
	 * The one thing on the page to do, so a solid amber pill: the brand's loud
	 * fill with its dark rust on it. It was a thin outline, which made the
	 * landing page's main action quieter than the passkey button on the log-in
	 * page. (An earlier version drew a distressed pill through a turbulence
	 * filter on a ::before; that pseudo-element was gone long before this, and
	 * the comment describing it had outlived it.)
	 */
	.big {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.25em 0.8em 0.3em;
		line-height: 1;
		color: var(--wa-color-brand-on-loud);
		background: var(--wa-color-brand-fill-loud);
		box-shadow: 0 8px 28px rgb(0 0 0 / 0.45);
		font-size: clamp(1.5rem, 20vw, 3em);
		font-weight: 700;
		text-decoration: none;
		border-radius: 999px;

		&:hover {
			background: var(--wa-color-brand-70);
		}

		&:focus-visible {
			outline: 2px solid var(--wa-color-focus);
			outline-offset: 4px;
		}

		/* Leans in under the pointer and gives a little under a press. On the
		   whole pill, where it used to be on the label alone, so hovering the
		   button's edge did nothing. */
		@media (prefers-reduced-motion: no-preference) {
			transition:
				scale 0.15s ease,
				background-color 0.15s ease;

			&:hover {
				scale: 1.04;
			}

			&:active {
				scale: 0.98;
			}
		}
	}

	@keyframes stamp {
		from {
			opacity: 0;
			scale: 1.8;
			rotate: -4deg;
		}
		to {
			opacity: 1;
			scale: 1;
			rotate: 8deg;
		}
	}
</style>
