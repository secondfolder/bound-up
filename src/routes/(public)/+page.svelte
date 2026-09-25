<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
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
	<!-- Page-scoped body rule, in the layout's idiom: each shell sets the body
	     rules it needs through svelte:head so they mount and unmount with it.
	     On both body and html — the html one is what paints the overscroll
	     area, and without it dragging past the top reveals the default white. -->
	<style>
	html,
	body {
		background:
			linear-gradient(
				to bottom,
				transparent,
				oklch(from #943700 calc(l * 0.7) c h) 300px,
				oklch(from #711500 calc(l * 0.6) c h) 800px
			),
			linear-gradient(to right, #943700 10%, #711500 100%);
	}
</style>
</svelte:head>

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
		<h1>Bound Up</h1>
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
			<a class="big" href={resolve('/(auth-required)/(app)/home')}><span>Open</span></a>
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

	/* Self-hosted rather than linked from Google Fonts, as Muddy Tractor is:
	   no request to a third party for every visitor, and a same-origin file
	   the page snapshot can embed in its capture without a CORS round trip.
	   One variable file covers every weight; the latin subset is all this
	   page's copy needs. Source in static/fonts/rethink-sans-source.txt. */
	@font-face {
		font-family: 'Rethink Sans';
		src: url('/fonts/rethink-sans-latin.woff2') format('woff2');
		font-weight: 400 800;
		font-display: swap;
	}

	.landing {
		/* Transparent: the wash behind the halftone overlay lives on the body
		   (see the svelte:head style) so it fills the whole page, header
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
		font-family: 'Rethink Sans', var(--wa-font-family-body);

		header {
			display: flex;
			flex-direction: column;
			align-items: center;
			text-align: center;
			gap: 1rem;

			h1 {
				/* Was a flat 5rem, which ran off both edges of a phone. The vw
				   term keeps the desktop size and shrinks it to fit below that. */
				font-family: 'Muddy Tractor', var(--wa-font-family-body);
				font-size: clamp(2.5rem, 10vw, 7em);
				margin: 0;
				/* Never wraps, so the page capture cannot wrap it either. The
				   header centres its children, so the h1 is exactly as wide as
				   its text, and SnapDOM pins its clone to that fractional width.
				   Firefox measured the cloned text a hair wider, pushed "Up" onto
				   a second line, and the screened title sat as a two-line ghost
				   under the real one. */
				white-space: nowrap;
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
		margin-block-end: 50vw;
		font-weight: 700;
	}

	.small {
		color: var(--accent-color);
		text-decoration: underline;
		white-space: nowrap;
		margin-top: 1em;
		font-weight: bold;
		font-size: 1.2em;
		transition: color 0.1s ease;

		&:hover {
			color: var(--accent-color);
		}

		&:focus-visible {
			outline: 2px solid #ffcf7a;
			outline-offset: 3px;
		}
	}

	.big {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.2em 0.4em;
		/* Separate the text from the distorted shape: the second turbulence pass
		   is supposed to chew the outline, and when the filter lived on the
		   anchor it mostly showed up as wobble in the glyphs and shadow instead.
		   The decorative ::before pill now carries the filter; the label stays
		   crisp and all of the displacement budget is spent on the silhouette. */
		isolation: isolate;
		line-height: 1;
		color: #ffac00;
		text-shadow: 0 6px 24px rgba(0, 0, 0, 0.55);
		font-size: clamp(1.5rem, 20vw, 3em);
		font-weight: 700;
		text-decoration: none;
		border-radius: 0.2em;
		border: #ffac00 2px solid;

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
