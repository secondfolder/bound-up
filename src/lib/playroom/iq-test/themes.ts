import { effectiveVibe, looksThemed, type SettingsLike, type Vibe } from './settings';

/**
 * How the IQ test looks, per level and vibe.
 *
 * The page sits outside both app shells and should not look like Bound Up,
 * but the root layout's `theme.css` still applies to everything. Rather than
 * fight it rule by rule, the page's wrapper redefines the Web Awesome tokens
 * the app's theme sets: a declaration on the wrapper beats anything it would
 * inherit, whatever layer that came from. See docs/playroom.md.
 */

/** Web Awesome palette names this file maps the brand and neutrals onto. */
type Palette = 'blue' | 'pink' | 'red' | 'purple' | 'gray' | 'orange' | 'cyan';

export type Theme = {
	scheme: 'light' | 'dark';
	brand: Palette;
	/** The page background: a colour or a gradient. Also painted on `<html>`. */
	background: string;
	/** A solid colour for the overscroll area, where a gradient cannot go. */
	canvas: string;
	fontBody: string;
	fontHeading: string;
	/** 1 is Web Awesome's own rounding; lower is squarer. */
	radiusScale: number;
};

const SYSTEM_SANS = '"Helvetica Neue", Arial, ui-sans-serif, system-ui, sans-serif';

const CLINICAL: Theme = {
	scheme: 'light',
	brand: 'blue',
	background: '#f4f6f9',
	canvas: '#f4f6f9',
	fontBody: SYSTEM_SANS,
	fontHeading: 'Georgia, "Times New Roman", ui-serif, serif',
	radiusScale: 0.4
};

const VIBE_THEMES: Record<Vibe, Theme> = {
	// Screen glow in a dark room: the light a gooner spends the evening in.
	gooner: {
		scheme: 'dark',
		brand: 'cyan',
		background: 'radial-gradient(ellipse at 50% 0%, #06343f 0%, #04121a 55%, #020509 100%)',
		canvas: '#03090e',
		fontBody: SYSTEM_SANS,
		fontHeading: '"Avenir Next Condensed", "Arial Narrow", "Helvetica Neue", sans-serif',
		radiusScale: 0.5
	},
	bambi: {
		scheme: 'light',
		brand: 'pink',
		background: 'linear-gradient(160deg, #ffe6f3 0%, #ffc8e4 55%, #ffb0d8 100%)',
		canvas: '#ffd6eb',
		fontBody: '"Trebuchet MS", "Avenir Next", ui-rounded, sans-serif',
		fontHeading: '"Chalkboard SE", "Comic Sans MS", "Marker Felt", ui-rounded, cursive',
		radiusScale: 2.5
	},
	misogyny: {
		scheme: 'light',
		brand: 'red',
		background: 'linear-gradient(180deg, #fbf4ea 0%, #f5e6d3 100%)',
		canvas: '#f8eddf',
		fontBody: 'Georgia, ui-serif, serif',
		fontHeading: '"Brush Script MT", "Snell Roundhand", "Apple Chancery", cursive',
		radiusScale: 1
	},
	denial: {
		scheme: 'dark',
		brand: 'purple',
		background: 'radial-gradient(ellipse at top, #2a1640 0%, #120a1c 70%)',
		canvas: '#120a1c',
		fontBody: SYSTEM_SANS,
		fontHeading: '"Avenir Next Condensed", "Arial Narrow", sans-serif',
		radiusScale: 0.6
	},
	feminisation: {
		scheme: 'light',
		brand: 'pink',
		background: 'linear-gradient(180deg, #fff3f8 0%, #fde1ee 100%)',
		canvas: '#fde9f2',
		fontBody: '"Avenir Next", "Segoe UI", sans-serif',
		fontHeading: 'Didot, "Bodoni 72", "Bodoni MT", ui-serif, serif',
		radiusScale: 1.5
	},
	degradation: {
		scheme: 'dark',
		brand: 'red',
		background: '#0b0b0b',
		canvas: '#0b0b0b',
		fontBody: SYSTEM_SANS,
		fontHeading: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
		radiusScale: 0
	}
};

/**
 * The theme for a run: its vibe's when the run wears it (`looksThemed`),
 * clinical otherwise. The same on every stage, results included.
 */
export function themeFor(settings: SettingsLike): Theme {
	const vibe = effectiveVibe(settings);
	return vibe !== null && looksThemed(settings) ? VIBE_THEMES[vibe] : CLINICAL;
}

const STEPS = ['95', '90', '80', '70', '60', '50', '40', '30', '20', '10', '05'] as const;

/**
 * The class that makes Web Awesome re-derive its semantic tokens on the wrapper.
 *
 * Not `wa-dark` for a dark theme, though that is what it is: `theme.css`
 * re-declares the brand, surface and neutral tokens on anything carrying
 * `wa-dark`, in a later layer than Web Awesome's, so a wrapper with that class
 * came out in the app's rust and amber whatever its palette said. Web
 * Awesome's own `.wa-dark .wa-theme-default` selector gives the same dark
 * tokens on an element `theme.css` does not name. `wa-light` has no such
 * clash: the app never styles it.
 */
export function schemeClass(theme: Theme): string {
	return theme.scheme === 'light' ? 'wa-light' : 'wa-theme-default';
}

/**
 * The wrapper's inline custom properties, used together with `schemeClass`.
 *
 * Web Awesome's semantic tokens (`--wa-color-brand-fill-loud` and the rest) are
 * resolved where they are declared, so redefining the palette on the wrapper
 * alone would change nothing: they would arrive from `<html>` already
 * computed in the app's amber. The scheme class re-declares them on the
 * wrapper, and these inline values are what they then resolve against.
 *
 * Neutrals go back to Web Awesome's own greys (the app re-hues them toward its
 * rust), the brand is mapped onto the theme's palette, and the fonts, rounding
 * and quiet text the app sets globally are replaced.
 */
export function themeStyle(theme: Theme): string {
	const declarations = [
		...STEPS.map((step) => `--wa-color-brand-${step}: var(--wa-color-${theme.brand}-${step})`),
		`--wa-color-brand: var(--wa-color-${theme.brand})`,
		`--wa-color-brand-on: var(--wa-color-${theme.brand}-on)`,
		...STEPS.map((step) => `--wa-color-neutral-${step}: var(--wa-color-gray-${step})`),
		`--wa-color-text-quiet: var(--wa-color-neutral-${theme.scheme === 'light' ? '40' : '60'})`,
		'--wa-color-text-link: var(--wa-color-brand-on-quiet)',
		'--wa-color-focus: var(--wa-color-brand-60)',
		`--wa-font-family-body: ${theme.fontBody}`,
		`--wa-font-family-heading: ${theme.fontHeading}`,
		`--wa-border-radius-scale: ${theme.radiusScale}`,
		`--iq-background: ${theme.background}`,
		`--iq-canvas: ${theme.canvas}`
	];
	return declarations.join('; ');
}
