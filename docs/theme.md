# Theme

Every page wears the landing page's look: the rust wash, a halftone line
screen fading out down the page, grain, amber accents, Rethink Sans for text
and a distressed Rubik Black for page titles. The landing page draws its texture with
WebGL (see [page-effects.md](page-effects.md)); everywhere else it is CSS.

| Where                              | What                                                                  |
| ---------------------------------- | --------------------------------------------------------------------- |
| `src/lib/theme.css`                | The fonts, the palette as Web Awesome tokens, the wash, the texture   |
| `src/routes/+layout.svelte`        | Imports it, after `src/lib/webawesome.ts` imports Web Awesome's own   |
| `src/app.html`                     | `class="wa-dark"` on `<html>`, and the browser `theme-color`          |
| `src/routes/(public)/+page.svelte` | Sets `--page-texture: none`, since its effects draw the texture       |
| `e2e/theme.spec.ts`                | The cascade on real pages: dark class, texture on and off, title face |
| `scripts/generate-brand-images.ts` | The icons and share card in `static/`; `npm run brand-images`         |

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
  `variant="brand" appearance="outlined"` — amber border, amber text — is an
  idle save or submit button, and `appearance="accent"` the same button once
  there is something valid to send (AGENTS.md). The landing page's CTA is a
  solid pill in the same loud fill, drawn by hand with the brand tokens.
- **Amber on the brightest wash is about 4:1.** The top-left of the wash is
  the lightest it gets, so a link drawn there (the auth pages' and the
  roadmap's "Back to Bound Up", the landing page's "Log in") uses
  `--accent-tint` instead, which clears AA.
- **Neutrals are re-hued warm.** The whole `--wa-color-neutral-*` scale is
  replaced, so everything Web Awesome derives from it — input borders, neutral
  buttons, dividers — belongs to the palette. A filled neutral button is a
  rust slab with cream text; Web Awesome's own is a pale cream block.
- **Surfaces are opaque and darker than the wash.** Components paint
  `--wa-color-surface-default` under things that must hide what is behind them
  (a sticky footer's fade, a reaction pill over a bubble), so a translucent
  surface would let content show through.
- **`--page-wash-floor`** is the flat colour the wash settles on from 800px
  down, behind most of any long page. Something drawn solid that has to read
  as translucent mixes toward it: the roadmap's dimmed connectors, which
  cannot be translucent because they overlap (see
  [roadmap.md](roadmap.md)).
- **`--wa-color-text-danger`** is defined here as a light red: Web Awesome
  has no token by that name, and the old value, red-40, vanished on rust.
- `h1` is the title face in amber (see [The title face](#the-title-face)).
  Only `h1`: at section-heading sizes the distressed face turns to noise, so
  smaller headings are Rethink Sans bold.
  Its size is `--page-title-size`, a clamp that scales with the viewport: at
  a fixed size one long word ("Notifications") overflowed a 360px phone. The
  landing page's hero and the home screen's title are the only bigger ones.
- **`--wa-color-text-quiet` is 85% lightness**, not the 80% it started at,
  so it holds 4.5:1 on the brightest part of the wash, top left, where every
  page's description line sits (it measured 4.0:1 there).
- **Placeholders and select carets are warm.** Web Awesome's placeholder is a
  cool grey and its native select caret a lavender SVG blended into what is
  behind it; both were the only cold colours on a page. The placeholder is the
  quiet text colour, faded, and the caret one unblended copy in the quiet
  colour (as a literal: a data URI cannot read a custom property).

## Page layout

Every signed-in page's root is a column centred in `<main>`, one of three
widths, and every page's content sits one gutter in from that column's edge.

| Token                  | Value                | For                                                  |
| ---------------------- | -------------------- | ---------------------------------------------------- |
| `--page-width-narrow`  | 40rem                | Settings, admin, history: rows and lines of text     |
| `--page-width`         | 50rem                | Lists, forms, details, stories, conversations        |
| `--page-width-wide`    | 72rem                | The debug tooling's side-by-side panes               |
| `--card-column-width`  | 30rem                | The home and partner cards, a scan list              |
| `--page-gutter`        | `l`, `m` under 40rem | Between a column's edge and its content              |

- **A page root fills `<main>`'s width.** `<main>` is a flex column, and a
  root centred with `margin-inline: auto` is a flex item with auto margins,
  which turns stretching off: it shrank to its content, so sibling pages with
  the same `max-width` came out different widths, a page changed width with
  its data, and an unwrappable title pushed the partner page off a phone. The
  app layout gives every root `inline-size: 100%`, so `max-width` is the width.
- **The header and the content share the gutter.** `NestedPageHeader` is
  inset by `--page-gutter` as a margin, so its divider is exactly as wide as
  the content below and the back link, the title and the cards start at one
  edge. A page's content pads its sides with the same token.
- **A list's indent is its padding, not its items' margin.** Web Awesome gives
  every `li` a start margin, which a bullet-less list that zeroed its own
  padding still inherited, so every such list sat 18px in from its heading.
  `theme.css` moves the indent onto `ul`/`ol` padding in Web Awesome's last
  layer: a bulleted list keeps it, and a list that zeroes its padding is flush.
- **One exception to the widths:** the kink list's home is 60rem, for its two
  answer columns (see [kink-list.md](kink-list.md)).
- **Errors have pages.** `(auth-required)/(app)/+error.svelte` keeps the app
  shell and offers a way back (to the partner when the route has one, else
  home); the root `+error.svelte` covers everything else. Both name the
  status in words (`src/lib/error-page.ts`) and show the thrown message,
  which the code writes for the person reading it.

## The title face

`static/fonts/bound-up-title.woff2` is **Bound Up Title**: Rubik Black
(SIL OFL 1.1) with two variation axes of its own, built by
`scripts/title-font/build.py` from Rubik's Glyphs sources at a pinned commit.
`npm run title-font` rebuilds it, given `uv`; the output is committed and
byte-for-byte reproducible, so it only changes when the design does.

- **`ROUG`, roughness (0–100)** erodes the outline into chips and nicks, as a
  worn rubber stamp prints. Each point of a flattened outline moves into the
  ink by fractal noise, capped at a third of the stroke's local thickness, so
  a stroke is nicked but never cut through.
- **`WOBL`, wobble (0–100)** turns each letter up to 4.5°, nudges it off the
  baseline and scales it a touch, as hand-set type sits.
- **Every letter and digit has three stamps** (default, `.alt1`, `.alt2`),
  each with its own chips and tilt, and `calt` cycles them along a word, so a
  doubled letter is never the same twice. They join the kerning groups of the
  letter they vary, so spacing is Rubik's.
- **Set the look with `--font-display-variation`** (`'ROUG' 70, 'WOBL' 100`)
  in `theme.css`. A face's axes default to clean, so anything that uses
  `--font-display` sets that token and `font-weight: 900` with it, as the
  `h1` rule does.

It replaced Muddy Tractor, whose file was the personal-use demo: it could not
ship in an open-source repo, and it drew a "PERSONAL USE DEMO" stamp in place
of `?`, `&`, `’` and `·`. Its source and licence are
`static/fonts/bound-up-title-source.txt` and `bound-up-title-OFL.txt`; the
brand images (`npm run brand-images`) are drawn in it too.

## The texture

Two pseudo-elements of `<body>`, both soft-lit like the landing page's effects
canvas, where 50% grey is the identity:

- `body::before` is the halftone: a 195° repeating gradient — lines 15° from
  horizontal, 8 px apart, the landing page's settings — at opacity 0.35, masked
  to fade out from 300 px to 800 px down the page. It scrolls with a public
  page, and is never taller than the body (`min(800px, 100%)`): at a flat
  800px it outgrew a short page on a short screen, which then scrolled into a
  band of bare grain. The app shell pins it `position: fixed`, because there
  the body has no height at all and the layer was the only thing giving the
  document any: anything that scrolled an element into view scrolled the
  whole document, cutting off the page's top. `fitVisualViewport` also resets
  a stray window scroll on the window's own `scroll` event.
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

## The icons

The favicons, the Apple touch icon and the manifest's icons are a "B" in the
title face on the wash, under the landing page's halftone and grain.
`npm run brand-images` draws them all into `static/`, along with the share
card below; rerun it after changing the wash, the title face or colour, the
landing page's copy, or its effect parameters.

- **Drawn from the source, not a copy of it.** Chromium renders an `h1` over
  `theme.css`, so the letter and wash are the theme's own, and the filter is
  the CPU reference model in `src/lib/halftone.ts` and `src/lib/grain.ts`
  that the page's shaders are generated from. Only the effect parameters are
  copied, from the landing page, so they have to be kept in step by hand.
- **Every size is its own render.** The screen is a line pattern, and a large
  icon scaled down to 16 px averages it into a flat tint. Each icon is a
  64 CSS px tile of the page, drawn at that icon's device scale factor. That
  puts eight lines across every size.
- **The manifest icons have a smaller letter.** They are `maskable`, and a
  platform may crop one to a circle 80% of its width, so the whole letter has
  to fit inside that circle.
- **There is no SVG favicon.** The old one was a PNG wrapped in SVG, and the
  browser picked it over the size-specific PNGs. That scaled one bitmap to
  every size, which is the problem the per-size renders avoid.

## The share card

`static/og-image.jpg` is the image a link preview shows — a pasted invite
link, above all. It is the top 1200 × 630 px of the landing page as a desktop
browser draws it: the title and subtitle on the wash, through the same
halftone (with its fade from 300 px down) and grain, at one pixel per CSS px,
which is what the effects are calibrated in. The copy is duplicated from the
landing page in the script, so a change to one is a change to both.

It is a JPEG because grain is noise, which PNG cannot compress: the PNG was
several times the size for no visible difference, and some previewers give up
on large images.

`src/lib/components/ShareMeta.svelte` emits the Open Graph and Twitter tags
that point at it. A page people are expected to paste into a chat — the
landing page, `/roadmap`, `/invite/[token]` — renders it with its own title
and description. It is per page rather than in a layout on purpose: a page's
tags would otherwise sit beside the layout's, and previewers disagree on which
duplicate wins. The image URL is made absolute from the request's own origin,
which is one more reason the self-hosted build needs `ORIGIN` behind a proxy.
`e2e/share-previews.spec.ts` reads the pages with JavaScript off, as a
previewer does.

## Skeletons

A loading placeholder for anything bigger than a line is **built from several
small `wa-skeleton`s, not one big one**: a title line and a few text lines of
different widths for a block of text, one skeleton per row for a list. That
also shows the shape of what is coming, which a single block cannot.

One block-sized `wa-skeleton` is the trap. Its shimmer is the `indicator`
part, a line high and **fully rounded by default**, and no custom property on
the host reaches its radius, so stretched to a block it draws one giant pill
with huge round ends. This has shipped more than once (the notebook's loading
entry, and before it the daydream picture's frame). Where a single block
really is right, a picture's frame being the one case so far, size and round
the part itself, as `DaydreamPicture.svelte` does:

```css
wa-skeleton::part(indicator) {
	block-size: 100%;
	border-radius: var(--wa-border-radius-l);
}
```

## Invalid fields

A field whose value is wrong says so the same way everywhere: the control
carries `aria-invalid="true"`, which `theme.css` turns red (its border and its
focus ring, through Web Awesome's own custom properties, for `wa-input`,
`wa-textarea` and `wa-select`), and `FieldError.svelte` sits under it with the
message, announced as it appears. `InputField` does both from its form's
errors; anything else sets the attribute and renders `FieldError` itself, as
the menu item's number does.

A number someone types is read by `readNumberText` (`$lib/number-text`):
empty is none, anything else that is not a finite number is the error. Such a
field is a text box with `inputmode="decimal"`, not `type="number"`, whose
control quietly throws away what it cannot read and reports an empty value,
so a mistake looked the same as nothing typed.

## Side panels

A page with a panel at its right that can be put away (the scene's ideas and
prompts) is `SidePanelLayout.svelte`, the same way at every width:

- **Beside the page** once the screen is 60rem wide: the page narrows to
  make room, the panel sticks at the top as the page scrolls, and whether it
  is there is remembered on the device (`storageKey`).
- **Over the page** where it is narrower: the panel comes out of the page's
  flow (`position: fixed`) and slides in over everything the page's
  scroller shows, top to bottom, so over all the page but not the app's nav
  below it. It never takes the whole width (`--side-panel-strip`, 3rem,
  stays showing), and a backdrop dims the rest of the page; a press
  anywhere outside the panel, or Escape, puts it away before anything under
  it is touched. It always starts away there, whatever it was beside a
  wider page, since it would cover the page someone came to see.
- **Which of the two is a media query**, not the layout's own width: a
  container query would make the layout contain fixed-position boxes, and
  the panel over the page is one. Where the page scrolls (`<main>`, which no
  viewport unit measures) is measured by the component and handed to the
  CSS as `--side-panel-area-*`.
- **It slides** in and out either way, and the page's width eases with it
  beside it (none with reduced motion).
- **The button that shows it is a tab on the screen's right edge**, a third
  of the way down what the page shows, fixed there so it is in reach however
  far the page is scrolled; the panel's own header has the button that
  hides it. It runs on a little past the screen's edge, so it reads as
  the end of something tucked away there. It is an icon until the screen is wide enough for the tab's
  words to sit beside the widest page (92rem: `--page-width-wide` and about
  10rem each side), and then says what it opens. When what it opens
  changes (the scene's ideas becoming a menu's options as the caret goes
  into one), it nudges in and back out, so the change is noticed with the
  panel away.
- `--side-panel-width` (20rem), `--side-panel-gap` and `--side-panel-speed`
  can be set by the page.

It replaced a column that folded to a strip on a wide screen and became a
sheet from a floating button on a narrow one: two ways to do one thing.

## Lists of items

Tasks, rewards and their histories are lists of lines, the way a to-do app
shows them, built from two generic components:

- **`ItemRow`** is one item, an `<li>`: something to act on at the start (a
  circle, a clock), the title and one quiet line of meta under it, and
  a number at the end in tabular figures (an award, a cost). Its `onopen` makes
  the title a native button that opens the item's detail, which is where its
  description and other actions live. Rows are divided by a hairline, not
  boxed: border, padding and a heading per item were what made a card per task
  fill a phone with two of them.
  A row can be `quiet` (greyed: not doable yet), `dimmed` (inactive) or
  `selected` (lit in amber while its detail is open). The title's button
  covers the whole row with a pseudo-element, so a tap anywhere opens it,
  while the row's own controls (a circle, a `WhoseTime`) sit above it.
- **`ItemGroup`** is a labelled run of rows ("Ready", "Saving up", a day): a
  small uppercase heading with its count in a round badge — a bare number
  where a heading meets the right-hand column read, at a skim, as one more
  row's credits — or with `collapsed` a closed `wa-details` for what most
  people do not need to see (the inactive ones), or `headless` where
  something else already names the rows (a heading). Callers leave out an empty
  group.

Around them: `CreditBalances`, the balances a page's items pay into, as a row
of `CreditPill`s labelled by a coins icon at its start, a partner's marked with
their picture and any the viewer may set editable in place; `ItemsTabs`, the
Tasks | Rewards pair of links at the top of both pages, drawn as the same pill
as a segmented control but plain links with `aria-current`, since each is a
page with its own URL and sheets; and `WhoseTime`, "Jun's time" with a tooltip
giving the zone and both people's time, for any time that belongs to someone
else's clock. Times a list shows are informal — "9am", "Tomorrow 6:30pm" —
through `src/lib/informal-time.ts`. Adding to a list is a dashed row at its
top (`QuickAddLink`, "Add a task").

`SegmentedTabs`, a pill-shaped segmented control with a count on each tab, for
a page split two or three ways that should read as one thing from different
sides (native buttons with the ARIA tab pattern, since `wa-button` forwards no
`aria-selected`), has no user since the partner tasks and rewards pages'
"For you" / "For them" tabs gave way to the To do and Set for others lists. It
is kept, with its test, on purpose: there are plans for it, so do not delete
it as dead code.

An item's detail is a `ResponsiveDialog`
([docs/dialogs.md](dialogs.md)).

## Space colours

Who a thing belongs to is a colour wherever spaces meet: the context switcher
and the chip on each row of an Everyone list ([contexts.md](contexts.md)).

- `--space-colour-me` is your own space, always the accent amber.
- `--space-colour-teal`, `-violet`, `-blue`, `-pink`, `-green` and `-lime` are
  the partner colours each viewer chooses from (`SPACE_COLOURS` in
  `space-colours.ts`). They are light and saturated enough to stand apart from
  the amber and from each other on the dark surfaces, at lightnesses that keep
  the same dark ink legible on every one.
- `--space-colour-ink` (the brand's on-loud rust) is what is drawn on them:
  initials, the person glyph.
- `--space-colour-gap` (the lowered surface) parts the slices of the
  Everyone avatar, so two neighbouring colours do not blur into one.

## Adding to it

A new component reaches for the semantic tokens, never a hex value. A new
colour the palette does not have yet goes in `theme.css` as a token first.
A fallback on a token (`var(--wa-color-…, #…)`) is only ever reached when the
token is misspelt, which is exactly when it should be noticed, so leave it off.
