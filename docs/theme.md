# Theme

Every page wears the landing page's look: the rust wash, a halftone line
screen fading out down the page, grain, amber accents, Rethink Sans for text
and Muddy Tractor for page titles. The landing page draws its texture with
WebGL (see [page-effects.md](page-effects.md)); everywhere else it is CSS.

| Where                              | What                                                                  |
| ---------------------------------- | --------------------------------------------------------------------- |
| `src/lib/theme.css`                | The fonts, the palette as Web Awesome tokens, the wash, the texture   |
| `src/routes/+layout.svelte`        | Imports it, after `src/lib/webawesome.ts` imports Web Awesome's own   |
| `src/app.html`                     | `class="wa-dark"` on `<html>`, and the browser `theme-color`          |
| `src/routes/(public)/+page.svelte` | Sets `--page-texture: none`, since its effects draw the texture       |
| `e2e/theme.spec.ts`                | The cascade on real pages: dark class, texture on and off, title face |

## Always dark

`<html>` carries `wa-dark` unconditionally; the app no longer follows
`prefers-color-scheme`. Every surface sits on the dark rust wash, so the light
theme's near-black text would be unreadable on it, and there is no light
version of the landing page to take a light theme from.

## The palette is Web Awesome's tokens

Components never name a colour of this palette. They use Web Awesome's
semantic tokens — `--wa-color-surface-default`, `--wa-color-text-quiet`,
`--wa-color-brand-fill-loud` and the rest — and `theme.css` sets those, in Web
Awesome's last cascade layer (`wa-theme-overrides`). A later layer beats an
earlier one regardless of specificity, so this wins over Web Awesome's dark
theme without being unlayered, where it would also beat every component's own
`::part()` rules.

- **Brand is the landing page's amber** (`--accent-color`, `#ffac00`), with
  dark rust on it rather than Web Awesome's white, which is illegible on amber.
  `variant="brand" appearance="outlined"` is the landing page's CTA: amber
  border, amber text. Login and signup's buttons use it.
- **Neutrals are re-hued warm.** The whole `--wa-color-neutral-*` scale is
  replaced, so everything Web Awesome derives from it — input borders, neutral
  buttons, dividers — belongs to the palette. A filled neutral button is a
  rust slab with cream text; Web Awesome's own is a pale cream block.
- **Surfaces are opaque and darker than the wash.** Components paint
  `--wa-color-surface-default` under things that must hide what is behind them
  (a sticky footer's fade, a reaction pill over a bubble), so a translucent
  surface would let content show through.
- **`--wa-color-text-danger`** is defined here as a light red: Web Awesome
  has no token by that name, and the old value, red-40, vanished on rust.
- `h1` is Muddy Tractor in amber. Only `h1`: at section-heading sizes the
  distressed face turns to noise, so smaller headings are Rethink Sans bold.

## The texture

Two pseudo-elements of `<body>`, both soft-lit like the landing page's effects
canvas, where 50% grey is the identity:

- `body::before` is the halftone: a 195° repeating gradient — lines 15° from
  horizontal, 8 px apart, the landing page's settings — at opacity 0.35, masked
  to fade out from 300 px to 800 px down the page. It scrolls with a public
  page; the app shell's body does not scroll, so there it stays at the top of
  the window.
- `body::after` is the grain: an SVG `feTurbulence` tile, desaturated and
  squeezed around 50% grey, fixed to the window.

Both sit at `z-index: -1` in a `<body>` made a stacking context with
`isolation: isolate`, so they are in front of the body's background and behind
everything on it. Without the stacking context a negative z-index goes under
the body's background too.

**Why CSS, not the landing page's pipeline.** The landing page screens a
SnapDOM capture of itself and holds that frame until the next capture — right
for a page that sits still. A page people type into would have its screen lag
its content, and a VFX pass over every app page would put a full-viewport
WebGL blend under every scroll. Under the content, as here, the texture never
needs recapturing and never screens anything a person reads.

**Calibrated against a screenshot of the landing page**, not by eye:

- The grain's filter uses `color-interpolation-filters='sRGB'`. SVG filters
  default to linearRGB, which turns the noise's 0.5 midpoint into about 0.73 on
  output — lighter than soft-light's neutral — and the grain lifted the whole
  page by some 25 levels rather than only texturing it.
- Its slope (0.55) gives a standard deviation of about 6 levels on the dark
  wash, the landing page's.
- The halftone's opacity is 0.35 rather than the landing page's 0.4: this
  gradient is a plain triangle with no clipped flats, and at 0.4 it measured
  harder than the real screen.

**`--page-texture: none` switches both off.** The landing page sets it,
because its effects draw the halftone and grain already; drawn twice, the
grain doubled and the halftone showed a moiré against its own screen.

## Adding to it

A new component reaches for the semantic tokens, never a hex value. A new
colour the palette does not have yet goes in `theme.css` as a token first.
A fallback on a token (`var(--wa-color-…, #…)`) is only ever reached when the
token is misspelt, which is exactly when it should be noticed, so leave it off.
