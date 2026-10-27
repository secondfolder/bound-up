# Contexts

A **context** is whose things a list shows: **Me** (your own space),
one partnership, or **Everyone** (every space you are in at once). It is
chosen with the **context switcher**, the pill at the top right of a page
whose list follows it, and it is a view filter and nothing more: no write
ever reads it.

Code says `solo`, `shared` and `all` ([spaces.md](spaces.md)); users see
"Me", the partner's name and "Everyone". Only the notebook follows the context
so far (`/notebook`, [notebook.md](notebook.md)); tasks, rewards and messages
still live under `/home` and `/partner/[id]`.

## Where it lives: one cookie

| Piece | What |
| --- | --- |
| `context` cookie | `all`, or a space id. One per device, so every tab shares it. `path=/`, `SameSite=Lax`, 400 days, **not** httpOnly |
| `locals.context()` | The cookie, checked against the viewer's spaces. Lazy and memoised per request (`contextResolver` in `server/context.ts`) |
| `locals.contextSpaces()` | The spaces the viewer can switch between: their solo space, then each **accepted** partnership, oldest first |
| `POST /api/context` | `{ context }`: sets the cookie for a space the viewer is in (404 otherwise), 204 |
| `app:context` | The dependency every context-dependent load registers; switching invalidates it |

- **The first load ever is Everyone**, and afterwards it is whatever was last
  chosen on the device.
- **An ambient context never 404s.** A cookie naming a space the viewer is not
  in — a partnership since ended, a pasted id — reads as Everyone, and is
  deleted on the way so the browser agrees with what was rendered. An *item*
  that is not yours still 404s.
- **A pending invite is not offered.** Its inviter is already a member of its
  space ([spaces.md](spaces.md#membership-and-can_manage)), but there is
  nothing in it to show.
- **Not httpOnly on purpose**: the app shell reads it when a tab comes back to
  the front (below). It says only which of your own spaces you last looked at.

The app layout's load (`(app)/+layout.server.ts`) hands every page
`contextSpaces` (each space's id, kind, colour and, for a partnership, its
`PartnerNamesSource`) and `context`, and depends on `app:context`. A page whose
list follows the context also depends on it, and reads the context from
`locals.context()` itself.

## Writes name their space

This is the invariant the whole design leans on. **Every action that creates
or changes something names its space in its form or body, and the server
re-checks membership of that space** (`requireSpaceMember`, then the feature's
own rules). Nothing reads the context to decide where a write goes.

Because the context is one cookie per device, another tab can change it at any
moment. If a create read the context, switching to a partner in one tab would
move the next entry started in another tab — still showing your own notebook —
into the partnership. Instead the notebook's create posts `spaceId`, and its
"show again" posts the entry's space; `/notebook/page.server.test.ts` creates
with the cookie pointing at one space and the form naming another, and e2e
does the same across two real tabs.

## Items carry their own space

An item page (`/notebook/[entryId]` and its menus) takes its space from the
item, never from the context: opened while the switcher says someone else, it
shows as whoever's it is (a chip at the top right), with that partnership's
names and the actions its rules allow, and the context is left as it was. So
a link to an item means the same thing to everyone who can open it, whatever
their device's context is, and needs no context in its URL.

## Tabs share it

- **Every tab on the device shows the context the cookie had when it last
  loaded.** A tab left open keeps its rendered list until it loads again.
- **Coming back refreshes it.** The app shell listens for `visibilitychange`;
  a tab coming to the front whose page was rendered for another context than
  the cookie now names invalidates `app:context`, so the switcher never claims
  one context over a list of another.
- **Back does not undo a switch.** History holds URLs, and switching does not
  change the URL: the same page re-runs its loads in place.
- **A pasted list link** (`/notebook`) shows whatever context the person
  opening it has.

## The switcher

`src/lib/components/context/ContextSwitcher.svelte`, built on
`context-client.svelte.ts` (names, avatars, switching).

**A page opts in** by rendering it, in `NestedPageHeader`'s `corner` snippet,
with `data.contextSpaces`, `data.context` and the viewer's name, and by its
load depending on `app:context`. Settings never shows it. **With no linked
partner it is not rendered at all**: Everyone would just be Me.

**The control** is a pill whose left end is the context's avatar at the
control's full height (40px), then the name and a caret.

- **Me** is the person glyph in amber.
- **A partner** is their initials in the colour you gave them. Names come from
  `partnerName()` (AGENTS.md invariant 12), so they read "…" until the vaults
  open, during SSR included.
- **Everyone** is the **avatar pie**: a slice per person, you first in amber
  then each partner in their colour, parted by thin gaps of the darkest
  surface. Each slice carries the person's initials at 36px and over; smaller,
  it is colour only.

**Tapping** fans every context out on a quarter-circle round the screen's
top-right corner — Everyone, Me, each partner, then a dashed "Add partner"
linking to `/settings/partners/new` — over a dimmed backdrop. The pill morphs
into its own avatar on the arc: it is pinned by its avatar's left edge (its
anchor holds the measured closed width), so as the label folds into the avatar
the avatar never jumps, and it flies straight to its slot, scaled to the
others' 56px. Closing is the same in reverse. A **selection wedge**, a slice
of the quarter-disc tinted in the selected context's colour, sits behind the
selected avatar and turns about the corner to follow the finger while sliding.

**Holding** the pill (280ms) or **pressing and sliding** opens the same fan;
letting go over an avatar picks it, and letting go over nothing leaves the fan
open for tapping. The pill takes pointer capture and `touch-action: none`, so
a slide is never a scroll.

**Picking** a different context glides the pill to the picked avatar's slot,
then it flies home and unfolds with the new name, while `POST /api/context`
and `invalidate('app:context')` re-run the page in place. A refusal shows the
app-wide notice ([request-failures.md](request-failures.md)) and puts the pill
back to what the page's data says.

**Where it is drawn.** The pill sits in the page header, but the fan is drawn
against the app shell (`data-app-shell` on the `(app)` layout's shell), whose
rectangle is measured when the fan opens: the shell is fitted to the visual
viewport, so its corner is the screen's even with the iOS keyboard open. The
pill's flight is measured from the same rectangle. The page under an open fan
does not scroll (it would carry the pill off its slot), and a resize closes it.

**Keyboard and assistive tech.** The trigger is a native `<button>` with
`aria-expanded` and `aria-haspopup` — a disclosure trigger, which `wa-button`
cannot be since it forwards no ARIA state (AGENTS.md). Enter or Space toggles
the fan (a click with `detail` 0; a pointer's click is already handled by the
press). Each context is a real button named "Show …", the current one with
`aria-current`, in a fieldset named "Whose to show". Focus moves onto the
current one on opening and back to the trigger on closing; Escape (a keydown on
the component, not the window) and tabbing out both close it; the backdrop is
a button out of the tab order. Under `prefers-reduced-motion` nothing moves:
the CSS transitions are off and the fan's transitions and the pick's pause are
zero.

## Colours

Each partnership shows in a colour **each member chooses for themselves**:
`space_members.colour`, the viewer's own row, never seen by the others. It is
one of a closed list (`SPACE_COLOURS` in `src/lib/space-colours.ts`: teal,
violet, blue, pink, green, lime), each a `--space-colour-<name>` token in
`theme.css` ([theme.md](theme.md#space-colours)), and stored in the clear, so a
list rather than a free value keeps it from carrying anything else. Your own
space is always the accent amber (`--space-colour-me`), so it is not on the
list.

- **Unset is a default, not a write**: `resolveSpaceColours` gives each
  partnership without a choice the next colour nobody chose, in the order the
  switcher lists them, so two partners differ without anyone picking.
- **Chosen** at Settings → Partners → a partner → Colour (the `colour` action,
  `SpaceColourForm`), which re-checks that the viewer is in a linked
  partnership and writes only their own row.

## Files

| Path | What |
| --- | --- |
| `src/lib/context.ts` | The pure half: `AppContext`, the cookie's name and format, parsing, `spacesInContext`. Alias-free |
| `src/lib/space-colours.ts` | The palette, its labels, `resolveSpaceColours`. Alias-free: the schema imports `SpaceColour` |
| `src/lib/server/context.ts` | `listContextSpaces`, the per-request resolver, the cookie, `setSpaceColour`, `contextSpaceViews` |
| `src/lib/context-client.svelte.ts` | Names and avatars for the browser, `switchContext` and `storeContext` |
| `src/lib/components/context/` | `ContextSwitcher`, `ContextAvatar`, `SpaceChip`, `SpaceColourForm` |
| `src/routes/api/context/+server.ts` | Switching |
| `drizzle/0050_add_space_member_colour.sql` | `space_members.colour`, a plain `ADD COLUMN` |

## Not built yet

- Tasks, rewards and messages following the context, and the Dashboard that
  replaces `/home` and `/partner/[id]`.
- A live Everyone list: it refreshes when looked at again rather than holding a
  stream per partnership. Fanning list events out to each member's own room
  would let one stream cover it ([notebook.md](notebook.md#the-list-in-every-context)).
- A dot on the control for something unread in another context.
