# Move the landing-page halftone onto VFX-JS, with grain as its own effect

## Context

`HalftoneOverlay.svelte` is a single custom component: it captures the page with
SnapDOM, sets up WebGL by hand, and runs one shader that does both the line
screen and the grain. Adding any other effect means writing more custom WebGL.
The goal is to rebuild it on an existing effects framework so that:

- halftone and grain become separate effects that can be chained, and
- the framework's own effects (bloom, dither, scanline, chromatic, vignette…)
  can be added alongside them.

### Library choice: VFX-JS, not Canvas UI

| | Canvas UI | **VFX-JS (`@vfx-js/core` 1.1 + `@vfx-js/effects` 1.3)** | Paper Shaders | pixi-filters / pmndrs postprocessing |
|---|---|---|---|---|
| Distribution | Copies source into the repo (shadcn registry) | npm, MIT | npm | npm |
| Effects that read page content | Only through HTML-in-Canvas, which is a Chrome origin trial. Firefox and Safari get only the effects that don't need the page | Any `<canvas>` / `<img>` / element. `addHTML` uses HTML-in-Canvas when it's there and falls back otherwise | Takes image URLs, not the DOM | Need their own renderer (Pixi / three.js). No DOM path |
| Composition | Components stand alone; none are chained | `effect: [a, b, c]` chains, plus a public `Effect` interface for custom effects | Each shader stands alone | Filter arrays or an EffectComposer |
| Halftone | None | `HalftoneEffect`, but RGB/CMYK dots, not our Affinity line screen | Dots / CMYK | Dot filter |
| Grain / noise | Only inside the VHS component | **None**, so we write our own (as asked) | Grain is a gradient generator, not a filter | NoiseFilter |
| Licence | MIT + Commons Clause | MIT | not checked | MIT |

Canvas UI is a set of standalone showcase components rather than a framework,
and in Firefox and Safari it can't sample the page at all. VFX-JS is a real
framework: effects are objects with lifecycle hooks (`init` / `update` /
`render` / `dispose`), they can be chained, `autoplay: false` plus
`vfx.render()` supports drawing on demand, and `overlay: true` leaves the
source visible underneath.

**On popularity** (npm downloads per week, September 2026): VFX-JS gets
about 1.2k. The more popular options were considered and rejected:

- pmndrs `postprocessing` (about 680k): mature, and has per-effect blend and
  opacity built in, but brings about 300 kB gzipped of three.js.
- Paper Shaders (about 550k): one shader per canvas, no chaining.
- `shaders` / shaders.com (about 190k): proprietary, needs a paid licence for
  public deployment, and is WebGPU-only.
- PixiJS (about 800k): a 2D scene engine, and heavier.

Going with VFX-JS was confirmed. Because it is young, pin it exactly, and
treat every upgrade as a change that needs the page opened.

The library's `HalftoneEffect` does not match the calibrated Affinity model,
so the halftone stays our own shader, rewritten as a custom `Effect`. Grain
becomes a second custom `Effect`, because the library has none.

**Grain can still be chained without changing the look.** In today's shader
the halftone value is clamped *before* the grain is added
(`value = clamp(...)`, then `clamp(value + grain)`), and the single soft-light
blend comes after both. Running `[Halftone, Grain]` as two passes inside one
VFX pipeline therefore gives the same maths. The only difference is 8-bit
rounding of the value between the two passes, which is at most 0.5/255.

### What VFX-JS does not do well here, and how the plan handles it

- **Its own DOM capture doesn't embed web fonts.** `dom-to-canvas.js` clones
  the element into a `foreignObject` without the fonts, so the Muddy Tractor
  title would be drawn in the fallback face. **Keep SnapDOM as the capture
  step.** Draw its output into a source `<canvas>` and register that canvas
  with VFX, which treats it as a `canvas` element and re-uploads the texture on
  each render.
- **It renders every frame by default.** That would bring back the Firefox GPU
  cost the current code documents (about 40% CPU). Use `autoplay: false` and
  call `vfx.render()` only after a capture, a change to an effect's
  parameters, and on scroll and resize (VFX's canvas tracks the viewport, not
  the body). Loop only while an effect says it is animating (`speed !== 0`).
- **Where the output goes.** VFX draws where the registered element is on the
  page. The source canvas keeps the current layout: it stays at its captured
  size, centred with `unsafe center` inside the clip that covers the body.
  VFX hides it (sets its opacity to 0) and draws the effect in its place. So
  during a resize the last frame stays centred and unstretched, as it does
  today. The bleed past the page edge becomes the halftone effect's
  `outputRect` (the element plus `BLEED` on every side), with the texture
  clamped at its edges.
- **The blend.** Apply `mix-blend-mode: soft-light`, the fade-in and
  `opacity` to VFX's canvas. Pass the clip div as VFX's `wrapper` so the canvas
  is added inside it. This needs checking in the browser: VFX expects its
  wrapper to sit at the page origin. If the canvas lands in the wrong place,
  fall back to appending it to `<body>` and clipping it with CSS.

## Changes

### Dependencies
- `npm i @vfx-js/core @vfx-js/effects`, exact pinned versions. VFX-JS is still
  young, so an upgrade should mean opening the page again. Add both to
  `optimizeDeps.include` in `vite.config.ts` alongside `@zumer/snapdom`,
  because they are only reached through `await import()` (see AGENTS.md's note
  on reloads during a run).
- Both are browser-only, so import them dynamically inside `onMount`, as
  SnapDOM is now. That keeps them out of the SSR bundle and the worker.

### Model split: `src/lib/halftone.ts` → two modules
- `src/lib/halftone.ts` keeps the screen: luma, triangle, tangent slope,
  `halftoneCoordAlong`, and the CPU reference renderer. It generates only the
  screen's GLSL, and no longer calls the noise code.
- New `src/lib/grain.ts` takes the grain: `HALFTONE_NOISE_AMPLITUDE`, the hash
  that stays white in float32, the second tap, `halftoneNoiseOrigin`,
  `applyHalftoneNoise` / `applyMonochromeNoiseRgb`, and a GLSL builder for the
  grain pass. Rename the `halftone` prefixes to `grain` along the way.
- Keep one CPU function that runs both steps, screen then grain, so the
  existing Affinity regression tests still cover the combined output.
- Write the GLSL builders in GLSL 300 es (VFX's default). The source texture
  is available as `src`, sampled through the `uvSrc` varying (VFX gives each
  effect a `ctx.src` texture and its dimensions in `ctx.dims`).

### Effects: new `src/lib/effects/`
- `halftone-lines-effect.svelte.ts`: `class HalftoneLinesEffect implements Effect` ("Halftone
  Lines", to tell it apart from the library's dot-based `HalftoneEffect`). It takes pattern,
  angle, contrast, cellSize and speed as `$state` fields, draws with the
  shader from `$lib/halftone`, returns an `outputRect` that includes the bleed,
  and exposes `animating` so the host knows whether to keep looping.
- `grain-effect.svelte.ts`: `class GrainEffect implements Effect` with a `strength`
  parameter (the old `noiseStrength`). It works as a filter on any input:
  after the halftone, after a library effect, or directly on the page capture.
  Its origin is `grainOrigin` of the element's pixel size.
- `index.ts`: re-exports our two effects. Library effects are imported straight
  from `@vfx-js/effects` by whoever uses them.
- Header comment: effects are browser-only, and each instance holds state, so
  one instance must never be shared between two elements (VFX's own rule).

### Per-effect opacity and fade: `src/lib/effects/mix.svelte.ts`

VFX-JS has no per-effect opacity. Its only opacity setting is `overlay`,
which dims the *source* element, and every effect draws into one shared
canvas, so CSS can only fade all of them together. The `Effect` API does make
one easy to add. So add a generic wrapper that works for our effects and the
library's alike:

```ts
mix(effect, { opacity?: number; fade?: { from: number; to: number }; toward?: 'input' | RGBA })
```

- It forwards `init` / `update` / `dispose` / `outputRect` / `enabled` to the
  inner effect. In `render` it hands the inner effect a context whose
  `target` is a render target it owns (`ctx.createRenderTarget()`), then
  draws `mix(towardColour, inner, opacity × fadeMask)` into the real
  `ctx.target`.
- `fade` is a vertical mask in CSS px from the top of the element: full
  strength above `from`, none below `to`, with a smoothstep in between. The
  vertical extent is what makes "halftone over the first fold, then fading
  out, grain down the whole page" possible.
- **`toward` sets what "no effect" means.** The default `'input'` mixes back to
  the stage's input, which is the right thing for grain and for most library
  effects. The halftone needs a mid-grey: this whole overlay is soft-light
  blended over the page, and 0.5 grey is soft-light's exact identity
  (`Cs = 0.5 ⇒ B = Cb`). Mixing the halftone back to the page capture would
  instead soft-light the page over itself and boost its contrast. So export
  `SOFT_LIGHT_NEUTRAL = [0.5, 0.5, 0.5, 1]`. Grain added after it then sits
  on the neutral grey, so below the fold the page gets only grain. That is
  the same order as today's shader (screen, clamp, grain, clamp), so it
  looks the same.
- `opacity` and `fade` are `$state`, so they redraw once through the same
  `track()` / `invalidate()` route as every other parameter.
- The risk to check first: wrapping works only if the inner effect draws to
  `ctx.target` instead of assuming the canvas. Our effects do. Check
  `HalftoneEffect` and `BloomEffect` from `@vfx-js/effects` in a component
  test. If a library effect ignores the context passed to it, write that
  down in the module's header comment rather than working around it.

### Svelte layer: `src/lib/vfx/`, modelled on `@vfx-js/react` but written the Svelte way

[`@vfx-js/react`](https://www.npmjs.com/package/@vfx-js/react) is the
general model: one shared `VFX` instance from a provider, elements opted in
with `VFXProps` (`effect`, `overlay`, `uniforms`, …), and a change to
`effect` alone swapping the chain in place with `vfx.updateEffects()`. Keep
its concepts and the `VFXProps` vocabulary so VFX-JS's docs still apply. Use
Svelte 5 idioms (5.57 is installed) instead of copying its component-per-tag
shape.

- **`context.svelte.ts`**: `const [getVFX, setVFX] = createContext<VFXHost>()`
  (Svelte 5.40+). `VFXHost` wraps the instance: `vfx` (`$state`, `null` until
  loaded or when there is no WebGL), `invalidate()` (schedules one
  `vfx.render()` in the next frame, however many callers ask in that frame)
  and `rerender(element)` (`vfx.update`).
- **`VFXProvider.svelte`**: holds the options as props (`pixelRatio`,
  `postEffect`, `autoplay`, `zIndex`) and a `children` snippet. It renders a
  wrapper element of its own and passes it as VFX's `wrapper`, so callers
  never deal with a ref. It loads `@vfx-js/core` with `await import()` in
  `onMount`, which keeps it out of SSR and the worker, as SnapDOM is now. If
  WebGL is missing, the children render with no effects.
  - Presentation is CSS rather than props: the canvas VFX creates gets a
    class, and `blend` / `opacity` become custom properties
    (`--vfx-blend`, `--vfx-opacity`) set by whoever places the provider. The
    `opacity` prop added earlier this session becomes `--vfx-opacity`.
  - With `autoplay={false}`, it calls `invalidate()` on scroll and resize,
    because VFX's canvas tracks the viewport.
  - It loops while any attached effect reports `animating` (an effect with
    `speed !== 0`), so nobody has to flip `autoplay` by hand.
- **`vfx` attachment (`attachment.svelte.ts`)**: `{@attach vfx({ effect,
  overlay, ... })}` on any element, instead of React's `VFXImg` / `VFXDiv` /
  `VFXSpan` / `VFXCanvas`. It covers every element type at once, and nothing
  more needs building later. It reads the host from context, runs
  `vfx.add(node, props)` untracked, `remove` on teardown, and uses an inner
  effect that runs `updateEffects` when only `effect` changes (React's
  behaviour, with Svelte reactivity in place of a render diff).
- **Reactive parameters instead of `setParams()` calls.** Our effect classes
  live in `.svelte.ts` files, and their parameters are `$state` fields
  (`halftone.contrast = 0.5`). Each has a `track()` that reads them. The
  attachment runs `track()` in an effect and `invalidate()`s, so changing a
  parameter redraws exactly once, and a still page draws nothing (the
  `846a5dc` guarantee). Library effects aren't reactive: after `setParams()`
  on one of those, call `getVFX().invalidate()`. That is written down in the
  module's header comment.
- **`VFXPageSnapshot.svelte`**: the one component, needed because VFX's own
  DOM capture drops web fonts (see above). It renders the clip and a source
  `<canvas {@attach vfx(props)}>`, fills that canvas from SnapDOM captures of
  `<body>`, then calls `rerender` + `invalidate`. It takes the same options
  as the attachment, as props.
  - Carry over from `HalftoneOverlay.svelte`, largely unchanged: the capture
    queue (`requestCapture`), `measureBody` / `sameBox`, the ResizeObserver,
    the resize and `fonts.loadingdone` listeners, the SnapDOM options with
    their comments (`clip`, `exclude`, `excludeMode: 'remove'`, `reconcile`),
    the `body { position: relative }` head rule, the clip layout, the `ready`
    fade-in and the Safari `brightness(0.9)` filter. The site comments go
    with the code they explain.
  - Delete: the hand-written WebGL (compiling shaders, buffers, uniform
    lookups, `render()`, the rAF loop), and `HalftoneOverlay.svelte`
    itself.
  - Rename `HALFTONE_CAPTURE_IGNORE_SELECTOR` to a snapshot-level name and
    update its users. `rg HALFTONE_CAPTURE_IGNORE_SELECTOR` finds the
    landing page CTA.
- **The effect classes stay SSR-safe**, so `effect` takes instances rather
  than a factory. Ours import only *types* from `@vfx-js/core`, and their
  constructors store parameters without touching the GL. Before relying on
  the same for a library effect, confirm with `npm run preview` that
  `@vfx-js/effects` doesn't end up in the worker bundle. If it does,
  construct that effect in `onMount`.

### Landing page: `src/routes/(public)/+page.svelte`
```svelte
<script>
	let innerHeight = $state(800);
	const halftone = mix(
		new HalftoneLinesEffect({ pattern: 'line', angle: 15, contrast: 0.4, cellSize: 6 }),
		{ toward: SOFT_LIGHT_NEUTRAL }
	);
	const grain = new GrainEffect({ strength: 1.3 }); // the whole page
	// Halftone over the first fold, fading out just past it.
	$effect(() => {
		halftone.fade = { from: innerHeight * 0.75, to: innerHeight * 1.1 };
	});
</script>

<svelte:window bind:innerHeight />

<!-- pixelRatio 1: one pixel per CSS px, the unit cellSize and the grain are
     calibrated in. autoplay off: a still page is not redrawn (846a5dc). -->
<VFXProvider pixelRatio={1} autoplay={false} --vfx-blend="soft-light">
	<VFXPageSnapshot effect={[halftone, grain]} overlay={0} />
	<!-- page content -->
</VFXProvider>
```
The fold proportions (0.75 / 1.1) are a starting point, to be tuned by eye.

## Tests
- `src/lib/halftone.test.ts`: keep every Affinity regression. Point the grain
  cases (whiteness, the 50% reference, the origin not being mirrored) at
  `src/lib/grain.ts`, or move them to a new `src/lib/grain.test.ts`. Add one
  case that the combined CPU function equals screen then grain.
- New `src/lib/effects/*.svelte.test.ts` (browser project, where WebGL2 is
  real): assigning a `$state` parameter redraws once, and each effect compiles and draws against a small generated
  `HTMLCanvasElement`. Read the output back:
  - The halftone on its own is exactly grayscale and matches the CPU reference
    within a small RMSE.
  - Grain on a flat grey input stays within ±40/255 × strength.
  - Chaining `[screen, grain]` matches the CPU combined function.
- New `src/lib/effects/mix.svelte.test.ts` (browser project):
  - `opacity: 0` gives the input exactly, or the `toward` colour when one is
    set, and `opacity: 1` gives the inner effect exactly.
  - `fade` is full strength above `from`, gone below `to`, and monotonic in
    between.
  - Wrapping a library effect (`HalftoneEffect`, `BloomEffect`) draws the
    same as the unwrapped effect at `opacity: 1`.
  - `[mix(halftone, { toward: SOFT_LIGHT_NEUTRAL, opacity: 0 }), grain]` is
    mid-grey plus grain.
- New `src/lib/vfx/*.svelte.test.ts`, with the attachment exercised through a
  small wrapper inside a provider:
  - Without WebGL, the provider still renders its children.
  - Changing only `effect` calls `updateEffects` and not `remove` / `add`.
  - Several `invalidate()` calls in one frame give one `render()`.
  - With `autoplay={false}`, nothing renders until something asks for it.
  - An animating effect keeps the loop running, and it stops when that
    effect stops animating.
- `e2e/landing.spec.ts`: update the selectors from `canvas.halftone` to VFX's
  canvas, given a class or `data-testid` by the component. Keep the
  "painted" and "calibration" assertions. Keep **"stops drawing once the page
  is still"**, which now counts `vfx.render` or `drawArrays` calls. It is the
  test that protects the CPU fix. Add a case that resizing keeps the output
  lined up with the page, and one on a page taller than the viewport: below
  the fold the overlay is grain on neutral grey, with no halftone lines.
- Rely on the e2e fixture's console-error net to catch a shader that fails to
  compile. Make sure the effects still call `console.error` on a failed
  compile or link, if VFX doesn't already.

## Docs
- Rename `docs/halftone.md` to `docs/page-effects.md`. Add a section on the
  pipeline (SnapDOM capture → source canvas → VFX chain → soft-light), then a
  "Halftone screen" section and a "Grain" section, and a "Per-effect opacity and fade" section (`mix`, and why the halftone fades to mid-grey under soft-light), built from the current
  content, plus how to add a library effect. Update the table row in
  AGENTS.md and fix every link to the old path (the component header comment,
  `$lib/halftone` comments, `rg docs/halftone.md`).
- AGENTS.md: repo-map rows for `src/lib/effects/` and for `src/lib/vfx/` (the
  provider, context and `{@attach vfx()}` layer over VFX-JS), and a line on the e2e
  fixture's WebGL warning allowlist if VFX adds new console output.
- Copy this plan to `docs/historical-plans/2026-09-25-page-effects-on-vfx-js.md`.

## Verification
1. `npm run check`, `npm run lint`, `npm test` (node + browser + e2e).
2. `npm run dev`, open `/` in Chromium, Firefox and Safari: the title keeps
   Muddy Tractor under the effect, the CTA stays above the effect, dragging the
   window edge follows the page, and there is no blank flash.
3. Firefox's task manager / about:processes on a still page: the GPU process
   is idle, as it is after `846a5dc`.
4. `npm run preview` with a real page load, to confirm neither package enters
   the worker bundle (invariant 16's check path).
5. Compare a screenshot of the landing page with one from before the change.
   They should match to within the rounding between passes.
