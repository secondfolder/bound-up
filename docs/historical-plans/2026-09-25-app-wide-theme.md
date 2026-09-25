# Plan: the landing page's look on every page

Request: "take the same style and aesthetic of the root page and apply it to
all pages and components".

This plan was worked out in the session rather than written down first; this
is it as intended before implementation.

## What the landing page's look is

- A rust wash (`#943700` → `#711500`, darkening from 300px to 800px down).
- A halftone line screen (15°, 8px cells, contrast 0.4, opacity 0.4) fading
  out from 300px to 800px, and grain over the whole page, soft-lit over it
  through VFX-JS.
- Muddy Tractor for the title, Rethink Sans bold for everything else.
- Amber `#ffac00` text and an amber-outlined CTA with 0.2em corners.
- Forced dark regardless of system scheme.

## Approach

1. **Do not reuse the VFX pipeline outside the landing page.** It screens a
   SnapDOM snapshot and holds that frame until recapture, which is wrong for
   pages people type into and costly as a full-viewport blend on every app
   page. Rebuild the texture in CSS instead, under the content.
2. **One global stylesheet, `src/lib/theme.css`,** imported by the root
   layout after Web Awesome's:
   - Move both `@font-face` rules there from the landing page.
   - Set the Web Awesome tokens in `@layer wa-theme-overrides`: a warm
     neutral scale, amber brand scale with dark text on solid brand, opaque
     dark rust surfaces, cream text, amber links and focus ring, Rethink Sans
     body font, a squarer radius scale, a legible `--wa-color-text-danger`.
   - The wash on `html, body`, identical to the landing page's.
   - `body::before` (halftone, repeating gradient, masked fade) and
     `body::after` (SVG turbulence grain), both soft-light at z-index -1 in an
     isolated body. `--page-texture: none` turns them off, and the landing
     page sets it.
   - `h1` in Muddy Tractor, amber.
3. **Always dark:** `class="wa-dark"` on `<html>` in `app.html`, dropping the
   `prefers-color-scheme` script. `theme-color` meta and the web manifest
   colours to the rust.
4. **Spot fixes in components** where a light palette was assumed or a token
   was misspelt: the home subtitle (`--wa-color-text-secondary` does not exist),
   TagPicker's `--wa-color-danger-text`, the filled neutral button (pale cream
   slab in Web Awesome's dark theme), Login/Sign Up/passkey buttons as the
   landing page's outlined-amber CTA, page titles on login and signup.
5. **Calibrate against screenshots of the landing page** — mean colour and
   grain spread in the same regions — rather than by eye.

## Done means

- `e2e/theme.spec.ts`: dark class even under a light system scheme, texture
  on for a normal page and off for the landing page, title face and colour.
- Any existing test that encoded the old palette is rewritten to assert its
  real intent.
- `docs/theme.md` written and added to the AGENTS.md table; AGENTS.md gains a
  convention paragraph; `docs/page-effects.md` points at it.
- `npm run lint`, `npm run check`, `npm test` run.
