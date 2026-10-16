<script lang="ts" module>
	import type { Intensity, SettingsLike, Toggle, Vibe } from '$lib/playroom/iq-test/settings';

	/** The options whose effect is easier seen than read, and so get a picture in their info. */
	export const ILLUSTRATED_TOGGLES: readonly Toggle[] = ['themedLook', 'porn', 'subliminals'];

	/**
	 * The settings for an info button's picture: the page with one option
	 * ticked or unticked and everything else that shows off — so the picture
	 * is about that one option — except the vibe's look, which every example
	 * keeps but its own. At the slider's level, so the porn is spaced as it
	 * would be.
	 */
	export function exampleSettings(
		toggle: Toggle,
		on: boolean,
		vibe: Vibe,
		intensity: Intensity
	): SettingsLike {
		return {
			intensity,
			vibe,
			themedLook: true,
			porn: false,
			subliminals: false,
			hypno: false,
			[toggle]: on
		};
	}
</script>

<script lang="ts">
	import { brandFor } from '$lib/playroom/iq-test/copy';
	import { darkPreference } from '$lib/playroom/iq-test/dark-preference.svelte';
	import { flashes, playsBackdrop, playsHypno, showsPorn } from '$lib/playroom/iq-test/settings';
	import { schemeClass, themeFor, themeStyle } from '$lib/playroom/iq-test/themes';

	/**
	 * The test page in miniature, as it would look under some settings: the
	 * vibe's background, fonts and title (or the clinical look), porn either
	 * side, a porn background, a flash thrown over it, the hypno's tab. Drawn
	 * rather than a screenshot, so it follows the vibe chosen and stays current
	 * as the page changes, and asks the same helpers the page does (`themeFor`,
	 * `showsPorn` and the rest), so it cannot disagree with it.
	 *
	 * The porn and the flashes are abstract tiles: a settings dialog is no
	 * place for the real thing. Decoration only — the options beside it say
	 * the same in words — so hidden from a screen reader.
	 *
	 * `large` is the settings' own preview, beside the options; small, it is
	 * an info button's example (`exampleSettings`). Everything is sized in `em`, so the one
	 * drawing scales.
	 */
	let {
		settings,
		large = false,
		testid
	}: {
		settings: SettingsLike;
		large?: boolean;
		testid?: string;
	} = $props();

	const theme = $derived(themeFor(settings, darkPreference.current));
	const brand = $derived(brandFor(settings));
	const porn = $derived(showsPorn(settings));
	const packed = $derived(settings.intensity >= 4);
	const backdrop = $derived(playsBackdrop(settings));
	const flash = $derived(flashes(settings));
	const hypno = $derived(playsHypno(settings));
</script>

{#snippet band(first: boolean)}
	<div class="band">
		{#if packed}
			<span class="tile" class:tall={first}></span><span class="tile"></span><span
				class="tile"
				class:tall={!first}
			></span>
		{:else}
			<span class="tile" class:tall={first}></span><span class="tile" class:tall={!first}></span>
		{/if}
	</div>
{/snippet}

<div
	class="preview {schemeClass(theme)}"
	class:large
	class:packed
	style={themeStyle(theme)}
	aria-hidden="true"
	data-testid={testid}
>
	{#if backdrop}
		<span class="backdrop"></span>
	{/if}
	{#if porn}
		{@render band(true)}
	{/if}
	<div class="page">
		<span class="title">{brand.title}</span>
		{#if large}
			<span class="tagline">{brand.tagline}</span>
		{/if}
		<div class="sheet">
			<span class="line"></span>
			<span class="line short"></span>
			<span class="answers"><span></span><span></span><span></span></span>
		</div>
		{#if hypno && large}
			<span class="dock"><span class="spiral"></span>Hypno</span>
		{/if}
	</div>
	{#if porn}
		{@render band(false)}
	{/if}
	{#if flash}
		<div class="flash"><span class="tile"></span><strong>Obey</strong></div>
	{/if}
</div>

<style>
	/* A page in miniature: the vibe's background and title over a card with a
	   question and three answers, all in the vibe's tokens. */
	.preview {
		position: relative;
		isolation: isolate;
		display: flex;
		gap: 0.3em;
		block-size: 5.5em;
		padding: 0.3em;
		overflow: hidden;
		border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-m);
		background: var(--iq-background);
		color: var(--wa-color-text-normal);
		font-family: var(--wa-font-family-body);
		font-size: 1rem;

		/* Level 4 packs it tight, as the page does. */
		&.packed {
			gap: 0.15em;
		}

		&.large {
			font-size: 1.5rem;
			block-size: 6em;
		}
	}

	.page {
		flex: 1;
		min-inline-size: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15em;
	}

	.title,
	.tagline {
		max-inline-size: 100%;
		overflow: hidden;
		line-height: 1.2;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.title {
		font-family: var(--wa-font-family-heading);
		font-size: 0.55em;
		font-weight: 700;
	}

	.tagline {
		font-size: 0.25em;
		color: var(--wa-color-text-quiet);
	}

	.sheet {
		align-self: stretch;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.2em;
		padding: 0.3em;
		border-radius: var(--wa-border-radius-s);
		background: var(--wa-color-surface-default);
		box-shadow: var(--wa-shadow-s);
	}

	.line {
		block-size: 0.2em;
		border-radius: 1px;
		background: var(--wa-color-text-quiet);
		opacity: 0.6;

		&.short {
			inline-size: 60%;
		}
	}

	.answers {
		display: flex;
		gap: 0.15em;
		margin-block-start: auto;

		span {
			flex: 1;
			block-size: 0.55em;
			border: 1px solid var(--wa-color-brand-border-loud);
			border-radius: var(--wa-border-radius-s);
		}
	}

	/* The hypno's tab at the foot, as the dock has it. */
	.dock {
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		padding: 0.1em 0.4em;
		border-radius: 0.3em 0.3em 0 0;
		margin-block-end: -0.3em;
		background: var(--wa-color-surface-raised);
		font-size: 0.25em;
	}

	.spiral {
		inline-size: 0.9em;
		block-size: 0.9em;
		border-radius: 50%;
		background: repeating-conic-gradient(var(--wa-color-brand-fill-loud) 0 25%, transparent 0 50%);
	}

	.band {
		flex: none;
		inline-size: 1.6em;
		display: flex;
		flex-direction: column;
		gap: inherit;
	}

	/* Porn, abstracted: warm, soft tiles with no picture in them. */
	.tile {
		flex: 1;
		border-radius: 2px;
		background: linear-gradient(150deg, #f2b8a0, #c0705c 60%, #6e3434);

		&.tall {
			flex: 1.6;
		}
	}

	/* Level 4's porn background, under the page's own colour. */
	.backdrop {
		position: absolute;
		inset: 0;
		z-index: -1;
		background:
			linear-gradient(color-mix(in oklab, var(--iq-canvas) 55%, transparent)),
			linear-gradient(150deg, #f2b8a0, #c0705c 60%, #6e3434);
	}

	/* A flash in progress: a picture and a word thrown over the page. */
	.flash {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		background: rgb(0 0 0 / 0.35);

		.tile {
			position: absolute;
			inset: 16% 30%;
			opacity: 0.85;
		}

		strong {
			position: relative;
			color: #fff;
			font-size: 1em;
			letter-spacing: 0.05em;
			text-transform: uppercase;
			text-shadow: 0 1px 3px rgb(0 0 0 / 0.7);
		}
	}
</style>
