# Dialogs

A short look at one thing — a task's detail, a reward's — is a
`ResponsiveDialog` (`src/lib/components/ResponsiveDialog.svelte`): a **sheet
from the bottom of the screen on a phone, a dialog in the middle of it
anywhere wider**. On a phone that puts it where the thumb is; on a desktop a
full-width sheet would be a long way from where the reader was looking.

## One element, two shapes

It is a single `wa-dialog`, restyled by CSS under `@media (width < 40rem)`
into the sheet. Nothing in script decides the shape:

- No `matchMedia` state means nothing can differ between the server render and
  hydration, and nothing re-renders when a window is resized across the line.
  (The roadmap's drawer does switch `placement` in script, and has to start
  from a guess and correct it after mounting.)
- Focus trapping, Escape, the close button, `aria-modal` and the accessible
  name all come from the one element in both shapes.
- `wa-dialog` renders a native `<dialog>` in the top layer, which is what lets
  it escape the app shell: inside the shell `<body>` does not scroll, so
  `position: fixed` and teleporting to `<body>` both stop working (AGENTS.md,
  "Adding a route"), and `AppNav` would otherwise sit over the bottom of a
  sheet.

The sheet is placed in the **visual** viewport the app shell already tracks
(`--viewport-top`, `--viewport-height` from `src/lib/visual-viewport.ts`,
inherited by the dialog as it sits inside the shell): iOS does not shrink the
page for the keyboard, so a sheet pinned to the bottom of the layout viewport
would sit behind it. Outside the shell the variables fall back to the whole
window. It is full width, square at the bottom, at most the viewport less 2rem
tall, padded by the home-indicator inset, and its body scrolls while its footer
stays. `NewMessageDialog` worked this placement out first and still has its own
copy, with its own header and grow-from-the-button animation; moving it onto
`ResponsiveDialog` is a follow-up.

## Animation

As a sheet it slides up and back down. Web Awesome's own show and hide
animations are classes on the panel, and an outside `::part(dialog)` rule
outranks them, so the slide up is a CSS animation on the part and the slide
down is done by hand: every way of closing (the close button, Escape, the
backdrop, `open = false`) first fires a cancelable `wa-hide`, which the
component refuses once, slides the panel with Web Animations, and then closes
for real. With reduced motion neither runs.

As a sheet it has a grab handle, and it can be swiped away by the handle or
its header: the panel follows the finger, and let go past a third of its
height (or flicked) it carries on down and closes; otherwise it springs back.
Only the handle and the header start a drag, so the body still scrolls and the
close button still closes; the header is `touch-action: none` as a sheet, or a
drag there would scroll the page. The handle is drawn on the panel
(`::part(dialog)::before`), so nothing is added to the dialog's markup.

## Sheets with their own URL

A sheet that is a page of its own — adding a task, editing a reward, a history
— has its own URL, so a reload, a shared link or a new tab opens the list with
that sheet over it, and closing it goes back to the list. It is done with
SvelteKit's nesting rather than with shallow routing:

- The list is the route's `+layout.svelte` (its load is `+layout.server.ts`),
  and the list route's own `+page.svelte` is empty. The list's actions stay in
  `+page.server.ts`.
- Each sheet is a child route whose whole page is a `RouteSheet`: `add/`,
  `[taskId]/`, `history/` under `/tasks`, and `add/`, `[rewardId]/`,
  `history/` under `/rewards`. Each has its own load and action, and can read
  the list's data through `parent()`.
- The list renders the child with `{@render children()}`, so it stays mounted,
  scrolled where it was, while sheets open and close over it.

Closing a `RouteSheet` goes back to its list. If the list is the entry before
it in history (it was opened from the list) that is `history.back()`, so Back
after closing does not reopen it; otherwise (opened by its URL) its `leave`
does a `goto` to the list with `replaceState`. A form in one says when it has
saved (`onsaved` on `SealedTaskEditor` and `RewardForm`), and the sheet closes
instead of following the action's redirect. Light dismiss is off by default,
because most of them hold a form.

Shallow routing (`pushState`) was the other way to give a sheet a URL, but a
reload of a shallow route renders the full page that route has, not the list
under a sheet, and `page.state` is reset by every `invalidate()`, which
NewMessageDialog had to work around.

## Using it

Mount it only while it is open, and unmount it from `onclose`:

```svelte
{#if openId}
	<ResponsiveDialog label={title} onclose={() => (openId = null)} footer={actions}>
		…
	</ResponsiveDialog>
{/if}
```

- `open` is then never false in markup (AGENTS.md, boolean properties on
  `wa-*` elements), and every opening starts fresh.
- `onclose` runs after the hide animation, on the dialog's own `wa-after-hide`
  only: that event bubbles from nested Web Awesome elements (a `wa-details`, a
  dropdown) too, which is a trap the roadmap, `UrlEmbed`, `NewMessageDialog`
  and `SetupDialog` all comment on.
- `close()` (with `bind:this`) closes it with its animation, for an action that
  is finished.
- `lightDismiss` is on by default; turn it off where a stray tap would throw
  away work, or where the content opens a popup the dialog counts as outside (a
  `wa-dropdown`, as `NewMessageDialog` found).
- `footer` holds the actions, which stay in view while a long body scrolls; as
  a sheet they share the width. `headerActions` sits beside the close button.

A plain `wa-dialog` is still right for something that should be a dialog at
every width — a confirmation, a setup step — and a `wa-drawer` for a panel that
belongs at the side of a wide screen.
