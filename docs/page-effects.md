# Page effects

The logged-out landing page is drawn over by WebGL effects: the page is
captured to a bitmap, run through a chain of effects — a grayscale halftone
line screen, then grain — and composited back over itself with
`mix-blend-mode: soft-light`. The effects run on
[VFX-JS](https://github.com/fand/vfx-js), so any of its library effects
(`@vfx-js/effects`: bloom, dither, scanline, chromatic aberration, vignette …)
chains with ours.

| Where                                 | What                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `src/lib/vfx/`                        | The Svelte layer over VFX-JS: provider, context, attachment, page snapshot    |
| `src/lib/effects/`                    | Our effects — `HalftoneLinesEffect`, `GrainEffect` — and `mix()`              |
| `src/lib/halftone.ts`                 | The screen's model: a CPU reference renderer plus the GLSL generated from it  |
| `src/lib/grain.ts`                    | The grain's model, likewise                                                   |
| `src/lib/halftone.test.ts`, `grain.test.ts` | Regressions against the Affinity reference exports                      |
| `src/lib/effects/*.svelte.test.ts`    | Each effect's GPU half against its CPU reference, through a real VFX instance |
| `src/lib/vfx/VfxProvider.svelte.test.ts` | When VFX is asked to draw, against a stand-in                              |
| `src/lib/testing/halftone-fixtures/`  | The Affinity exports, one directory per thing being calibrated                |
| `e2e/landing.spec.ts`                 | The whole pipeline on the real page: capture, placement, pixels, draw count   |

## The pipeline

```
<body> ──SnapDOM──▶ source <canvas> ──VFX-JS──▶ [mix(HalftoneLines), Grain] ──▶ VFX canvas ──soft-light──▶ page
```

On the landing page:

```svelte
<VfxProvider pixelRatio={1} autoplay={false} blend="soft-light">
	<VfxPageSnapshot effect={[halftone, grain]} />
</VfxProvider>
```

### Why VFX-JS

It is an effects framework rather than a set of effects: an `Effect` is an
object with `init` / `update` / `render` / `dispose` hooks and an optional
`outputRect`, effects chain (`effect: [a, b, c]`), each stage reads the last
one's output as `ctx.src`, and `autoplay: false` plus `vfx.render()` draws on
demand. Canvas UI, the other candidate, is a set of standalone components
whose page-reading effects need Chromium's HTML-in-Canvas origin trial, and
which do not chain. The more popular options were worse fits: pmndrs
`postprocessing` brings three.js (~300 kB gzipped), Paper Shaders is one shader
per canvas, and `shaders` (shaders.com) is proprietary and WebGPU-only.

VFX-JS is young and has few users, so it is pinned exactly: treat an upgrade as
a change that needs the page opened, in all three engines.

Its library `HalftoneEffect` is RGB/CMYK dots, not the calibrated line screen,
which is why the screen is ours (**Halftone Lines**, named apart from it). It
has no grain or noise effect at all, which is why the grain is ours too.

### The Svelte layer (`src/lib/vfx/`)

Modelled on `@vfx-js/react` — one shared instance from a provider, elements
opted in with `VFXProps` — but in Svelte's idiom rather than a copy of it.

- **`VfxProvider`** creates the `VFX` instance in `onMount`, importing
  `@vfx-js/core` dynamically so it never enters the SSR graph or the worker.
  Without WebGL2 its children render with no effects. VFX draws everything
  into one viewport-sized canvas, which the provider has it put (its `wrapper`
  option) in a `.vfx-layer` covering the body with `overflow: hidden`. On
  `<body>` itself the canvas widened the page when the window shrank: VFX sizes
  its scroll padding from `body.scrollWidth`, which counted the canvas's own
  old width, so it stayed wider than the window. The layer carries the capture-
  ignore attribute, `blend` and `opacity`, and fades in once an element is
  registered — on the layer, not the canvas, because the layer's z-index makes
  it a stacking context and a blend inside one reaches only its own empty
  backdrop. Safari gets `brightness(0.9)` on a soft-light layer: its soft-light
  reads punchier than Chromium's and Firefox's.
- **`context.svelte.ts`** holds `VfxHost`, reached with `getVfx()`
  (`createContext`). `invalidate()` draws once on the next frame however many
  times it is asked; `rerender(el)` re-reads an element's pixels.
- **`host.attach(() => options)`** is an attachment for any element, in place of
  React's component per tag. It takes a getter so changing options does not
  tear it down: a new `effect` chain swaps in place (`vfx.updateEffects()`),
  keeping the source texture and every unchanged effect's state; every other
  option is read when the element is added.
- **`VfxPageSnapshot`** is the one component. It captures `<body>` with
  SnapDOM into a canvas laid over the body and attaches that canvas, once the
  first capture has landed. It does its own capture because VFX's clones an
  element into a `foreignObject` without its web fonts — the title came back in
  the fallback face.

### Drawing on demand

**A still page draws nothing.** The provider runs with VFX's loop off and draws
once per capture, per parameter change, and per scroll or resize (VFX's canvas
tracks the viewport). It runs the loop only while an attached effect reports
`animating` — `HalftoneLinesEffect` with a non-zero `speed`. The canvas is
soft-light blended over the whole viewport, so a loop that redrew an unchanging
frame kept Firefox's GPU process at 25–40% CPU on a page where nothing moves.
The e2e suite counts WebGL2 draw calls to hold this.

**Parameters are `$state`.** Our effects' parameters are reactive fields
(`halftone.contrast = 0.5`), each effect's `track()` reads them, and the
attachment tracks them in an effect: assigning one redraws exactly once.
Library effects are not reactive — after `setParams()` on one, call
`getVfx().invalidate()`.

### The capture

SnapDOM clones the live elements with their computed styles into an SVG
`foreignObject` and has the browser paint it, caching fonts and resources
between captures. Measured on this page in Firefox against a screenshot of the
live page:

| Library                           | Per capture | Mean difference from the live page |
| --------------------------------- | ----------- | ---------------------------------- |
| SnapDOM                           | 11–20 ms    | 0.00 levels, at every size tried   |
| html2canvas-pro (the previous)    | 70–80 ms    | 0.13, a pixel or two off           |
| modern-screenshot, reused context | ~160 ms     | 5.08, layout visibly wrong         |

html2canvas re-implements CSS painting itself and, for every capture, builds a
fresh iframe holding a copy of the whole document and its stylesheets — about
60 of its 70 ms. Its API offers no way to keep that clone and only resize it.

Four options matter:

- **`excludeMode: 'remove'`.** The snapshot's own clip and anything marked
  `data-vfx-capture-ignore="true"` (the effects canvas, and the CTA, which sits
  above the effect rather than being screened by it) are excluded. SnapDOM's
  default leaves an invisible spacer in each excluded element's place, and in
  this flex `<body>` the spacers are laid out: they pushed the title down the
  page and widened the bitmap, which is what once got SnapDOM rejected here as
  inaccurate.
- **`reconcile: true`.** Measures the clone against the live layout and pins
  whatever diverges. Without it, text in an inline element (the subtitle) keeps
  its natural width and could re-wrap, and SnapDOM says so with a console
  warning — which the e2e fixture fails a run on. It costs nothing measurable
  on this page.
- **`clip` set to the body's own box.** Left to itself SnapDOM widens the
  capture to take in content overflowing the body — on a 150 px window the
  title overhangs a body the scrollbar has narrowed to 133 px — and a bitmap
  wider than the clip, centred in it, put every glyph half the overhang to the
  left. The overhang goes unscreened instead.
- **`dpr: 1`.** One bitmap pixel per CSS pixel, the unit the screen's
  `cellSize` and the grain are calibrated in — which is also why the provider
  runs at `pixelRatio={1}`.

The first capture waits for `document.fonts.ready`, since the fallback face's
metrics move everything below the title, and a font that loads later
(`document.fonts` `loadingdone`) recaptures.

### Placement and resizing

**VFX draws an effect wherever its element's box is**, so placement is the
source canvas's. It sits in a clip that covers the body — the snapshot sets
`body { position: relative }` through `svelte:head` to be the clip's containing
block — and a one-cell grid centres the canvas in the clip at its captured size
(`place-items: unsafe center`, so an oversized canvas overflows both edges
equally). The canvas itself is invisible; VFX draws the effect in its place.

**A resize never blanks the effect and never stretches it.** Until the
recapture lands, the last frame stays centred, so its screen, grain and centred
content stay on the page's centre line. `HalftoneLinesEffect` draws a 240 px
bleed past its element on every side (its `outputRect`), seen only while the
window grows faster than recaptures land. Past the capture there is nothing to
screen, so the shader clamps its texture lookup and stretches the page's edge
pixels outwards — right for this page, whose edges are background — while the
screen and grain, being functions of position alone, simply continue. The
clip's `overflow: hidden` stops an outgrown canvas holding the document open at
its old size.

**Recaptures run back to back.** A `ResizeObserver` on the body and the
window's `resize` request one when the body's box changes. There is no
throttle: one capture is in flight at a time, any request made meanwhile is
folded into a single follow-up that starts the moment it lands, and a capture
the page moved under is still shown before the next is taken. During a
window-edge drag that is about 54 captures a second in Firefox, each drawn
exactly once, for CPU that lasts only as long as the drag.

Chromium's HTML-in-Canvas API (`drawElementImage`, VFX's `addHTML`) would skip
the capture entirely, but it is Chromium-only and behind an origin trial.

## Per-effect opacity and fade: `mix()`

VFX-JS has no per-effect opacity. Its one opacity setting, `overlay`, dims the
*source* element, and every element draws into one shared canvas, so CSS can
only fade all of them together. `mix(effect, { opacity, fade, toward })` adds
one, for our effects and the library's alike:

- `opacity` (0..1) and `fade` (`{ from, to }` in CSS px down from the element's
  top: full strength above `from`, none below `to`, smoothstep between) are
  `$state`, so they redraw once like any other parameter. The landing page
  shows the halftone at 0.4 and fades it out from 300px down the page, over
  35% of the window's height, while the grain runs the whole page at full
  strength.
- **`toward` says what "none of the effect" is.** The default, `'input'`, is
  the effect's own input — right for grain and most library effects. The
  halftone fades to `SOFT_LIGHT_NEUTRAL`, 50% grey, instead: its output is soft-lit
  over the page, and grey is soft-light's identity (`Cs = 0.5 ⇒ B = Cb`), where
  mixing back to the capture would soft-light the page over itself and boost
  its contrast. The grain after it then lands on neutral grey, so below the
  fade the page gets the grain alone.
- **Mixing toward grey is exact CSS opacity for a soft-lit layer.** Soft-light
  is linear in the blend colour on either side of 0.5, and mixing toward 0.5
  never crosses it, so the halftone at `opacity: 0.4` composites exactly as a
  separate halftone layer at CSS `opacity: 0.4` would. That is what lets one
  effect in the chain be faint while the grain after it is not; the provider's
  own `opacity` would fade both.
- It is three chain stages rather than a wrapper around the inner effect's
  `render()` — a tap that keeps a copy of the input (only with `toward:
  'input'`), the inner effect as an ordinary stage, and a blend. An effect that
  draws to its stage's default target would bypass a wrapper's context, while
  as a stage any effect works; `mix.svelte.test.ts` wraps the library's
  `HalftoneEffect` and `BloomEffect` to hold that. The `vfx` attachment
  flattens a `mix()` group into the chain.

## Adding an effect

A library effect goes straight into the chain:

```ts
import { VignetteEffect } from '@vfx-js/effects';
<VfxPageSnapshot effect={[halftone, grain, new VignetteEffect()]} />
```

It must be constructed per element (VFX-JS throws on a shared instance), and
before relying on constructing it during SSR, confirm with `npm run preview`
that `@vfx-js/effects` stays out of the worker bundle; if it does not,
construct it in `onMount`. Our own effects import only types from
`@vfx-js/core` and touch no GPU state in their constructors, which is what
makes them safe to build in a page's script.

A new effect of ours goes in `src/lib/effects/`: a class implementing VFX's
`Effect` with its parameters as `$state` and a `track()` that reads them. Its
shader is GLSL 300 es against VFX's default vertex shader — `uvContent` is
0..1 over the element, `uvSrc` samples the input, and positions are
element-local buffer pixels from `uvContent`, not `gl_FragCoord`, because the
final stage draws into a viewport offset inside VFX's shared canvas. VFX
composites premultiplied alpha. If it has a CPU model, keep the two in step
and compare them in a browser test through `$lib/testing/vfx`.

A shader that fails to compile throws inside `render()`, which VFX turns into a
console warning and a passthrough of the input — the effect silently vanishes
from the page, and the e2e fixture's console net is what fails the run.

## The halftone screen

The target is the **Halftone filter in Affinity by Canva**, in line-screen
mode. The whole filter was reverse-engineered from the fixtures below and
turned out to be four lines of arithmetic; the previous implementation was a
hand-fitted pile of spline constants that matched nothing in particular.

The page runs it as `[HalftoneLinesEffect, GrainEffect]`, where it used to be
one shader. The screen's value is clamped before the grain is added, so the two
passes are the same arithmetic (to 8-bit rounding between them); a screenshot
of the landing page before and after the move to VFX-JS differs by at most one
level where the halftone is at full strength.

### The model

```
tone   = 0.299·R + 0.587·G + 0.114·B
coord  = (x − cx)·sin θ + (y − cy)·cos θ
screen = triangle(coord / cellSize)                    // 0..1, 0 at the cell centre
out    = clamp01( tone + tan(π/2 · contrast) · (screen − (1 − tone)) )
```

Each part is pinned by a specific reference, and each is worth stating because
the plausible alternative is wrong:

- **Rec.601 luma on sRGB values, not linearised.** The contrast-0 export is the
  filter's grayscale pass with the screen switched off, and it turns solid
  `#FFC621` into 196/255. Rec.601 gives 196.2; Rec.709 gives 198.2, the channel
  mean gives 162, and a linear-light round trip gives 211.

- **The screen is a symmetric triangle, not a sine.** A triangle wave is
  uniformly distributed, so thresholding it at `1 − tone` inks exactly `1 − tone`
  of the area: the screen reproduces tone linearly. The contrast-100 export
  confirms it directly — a 0.7695 tone leaves an 18 px black band in each 80 px
  cell, and 80 · (1 − 0.7695) = 18.4.

- **Phase zero is the image centre.** In the 500 px contrast strip the troughs
  land on rows 9.5 + 80k, and 249.5 is one of them.

- **Angle is measured from horizontal with y running down.** At 0° the lines are
  horizontal. The shader has to mirror y because its positions run up; it gets
  away with flipping only the sine term because the triangle is even.

- **Contrast is the tangent slope law.** Measuring the screen's slope in the
  cell-80 sweep gives 0.4165, 0.9945 and 2.431 at contrast 25, 50 and 75 —
  tan(22.5°), tan(45°) and tan(67.5°) to within a quantisation step. Contrast 0
  collapses to a plain grayscale pass and contrast 100 to a hard threshold, so
  the ends need no special case (the slope is only capped at 1e6 to keep the
  shader's float finite).

- **The pivot is the ink threshold.** Whatever the contrast, the output equals
  the tone at the point where the screen crosses `1 − tone`, which is why every
  curve in the sweep passes through the same two rows of each cell.

- **Tone is read per pixel — there is no pre-blur.** This is the one worth
  repeating, because pre-blurring along the screen axis is the intuitive thing
  to do and a previous version did it. Removing it is most of what took the
  33.6 px references from visibly wrong to 1.6/255 RMSE.

The `circle` pattern has no Affinity reference. It reuses the same screen and
contrast law with `coord` as the radius from the centre.

### What is deliberately not reproduced

Affinity's screen picks up a linear offset within roughly a cell of the canvas
edge. It is the screen and not the tone that moves there: solving the model for
a screen offset gives the same number at every contrast level, while solving it
for a tone change does not. That is an artefact of a filter running on a bounded
canvas, and the effect covers a whole viewport, so the tests exclude a border
margin rather than the code imitating it.

## The grain

`GrainEffect`, calibrated against the Noise control of the same filter: a
monochrome triangular deviation of ±40/255 at full strength, added equally to
all three channels. Triangular because at 50% strength the reference grain
spans exactly ±20/255 with a standard deviation of 8.12/255, and 20/√6 = 8.16.
It is a filter on whatever precedes it in the chain; on the landing page that
is the halftone, and it runs the whole length of the page.

The hash behind it has one non-obvious constraint: **it has to be white in
float32, not just in float64.** The usual `fract(sin(dot(p, k)) * 43758.5453)`
is not — by the time `p` is a full-page fragment coordinate the argument to
`sin` is around 150000 radians, and on the GPU that loses most of its mantissa.
Measured against the real WebGL context in Chromium it gave grain with a
standard deviation of 44/255 instead of 52/255, with visible vertical streaks,
while the same code in Node looked perfect. The hash in use instead mixes by
multiplication only, keeping every intermediate under 100, so float32 keeps
the field white; it measures 52.15/255 with autocorrelation under 0.006 at every lag on
both paths. `grain.test.ts` asserts that whiteness directly, because a
distribution check alone passes a structured hash.

The grain is measured from the image centre, rounded down to a whole pixel
(`grainOrigin()`), as the screen is. The landing page is laid out from
its centre line, and a grain anchored to a corner stayed still while a resize
slid the content over it; measured from the centre, widening the window adds
grain at both edges. The rounding matters: hashing a coordinate shifted by
half a pixel gives an unrelated field, so an exact centre would reshuffle all
the grain whenever the width went between odd and even. Half of every image
therefore hashes negative coordinates, which is why the whiteness test
straddles the origin and also checks the grain is not mirrored about it.

Strengths above 1 are allowed and just scale the deviation, but be aware they
interact with the screen's clipping: once the grain is wide enough to push the
troughs below 0 and the crests past 1, it only survives in the middle of each
band and starts to read as the band pattern rather than as grain.

White in float32 is not the same as *identical* in float32 and float64: a
rounding difference early in the hash is amplified by its mixing steps, so the
GPU and CPU fields agree at about 0.8 correlation rather than pixel for pixel.
`grain-effect.svelte.test.ts` compares them that way; a mis-mapped field (the
wrong mirror, an origin off by a pixel) correlates at 0.

## The fixtures

`src/lib/testing/halftone-fixtures/`. Every directory pairs an unfiltered
source with one or more filtered exports. **These settings are the only record
of how each file was produced — keep this table current when adding one.**

| Directory     | Source                        | Output(s)                                 | Filter settings                                                                       |
| ------------- | ----------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `shape-2/`    | `without-halftone-filter.png` | `with-halftone-filter-{0,15,45}-deg.png`  | Line, cell size **33.6**, contrast **75**, angle **0 / 15 / 45°** per filename        |
| `shape/`      | `without-halftone-filter.png` | `with-halftone-filter.png`                | Line, cell size **50**, contrast **50**, angle **0**                                  |
| `soft-light/` | `without-halftone-filter.png` | `with-halftone-filter-and-soft-light.png` | As `shape/`, **plus** the page's soft-light blend                                     |
| `contrast/`   | `no-filter.png`               | `filter-{0,25,50,75,100}-contrast.png`    | Line, cell size **80**, angle **0**, contrast **0 / 25 / 50 / 75 / 100** per filename |
| `noise/`      | `no-noise.png`                | `50-percent-noise.png`                    | Noise **50** only — no halftone filter                                                |

No soft-light blend and no grain anywhere except where the table says so.

`shape/` and `soft-light/` do not reproduce at their recorded settings: fitting
the model to them lands on cell 52.2 / contrast 43.5 rather than 50 / 50, and
their whole 100 px frame sits inside the edge artefact. They are kept as a
soft-light blend check, rendered with the fitted screen so the assertion is
about the blend. `shape-2/` and `contrast/` are the authoritative pair — fitting
cell size and contrast freely against `shape-2/` recovers exactly 33.6 and 75.

## Accuracy

Interior RMSE of the shipped renderer against the references, in 0-255 levels:

| Reference             | RMSE |
| --------------------- | ---- |
| contrast 0            | ~0   |
| contrast 25 / 50 / 75 | ~2.5 |
| shape-2 at 0°         | 1.6  |
| shape-2 at 45°        | 2.4  |
| shape-2 at 15°        | 5.0  |

Contrast 100 is compared loosely: a hard threshold disagrees by a full 255
wherever the crossing row is ambiguous, which one row per cell inevitably is.
15° is the worst angle because its bands cross pixel rows at the shallowest
slope, so a sub-pixel disagreement smears along the longest run.
