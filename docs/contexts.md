# Contexts

A **context** is whose things a list shows: **Me** (your own space),
one partnership, or **Everyone** (every space you are in at once). It is
chosen with the **context switcher**, the pill at the top right of a page
whose list follows it, and it is a view filter and nothing more: no write
ever reads it.

Code says `solo`, `shared` and `all` ([spaces.md](spaces.md)); users see
"Me", the partner's name and "Everyone". Today (`/today`, the signed-in
front page, [section-widgets.md](section-widgets.md)), the notebook
(`/notebook`, [notebook.md](notebook.md)), tasks (`/tasks`,
[tasks.md](tasks.md)), rewards (`/rewards`, [rewards.md](rewards.md)) and
messages (`/messages`, [messaging.md](messaging.md#the-board-in-each-context))
follow the context. Those are the bottom nav's places too, beside Settings:
`AppNav` has exactly five tabs — Today, Tasks (rewards are a tab inside it),
Notebook, Messages, Settings — and no tab per partner, since whose things a
page shows is the switcher's job. Playroom, Daydreams and the guides are
reached from Today's cards, and light the Today tab.

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
`locals.context()` itself — or, for the space ids it shows, from
`contextSpaceIds(locals)` in `server/context.ts`, which only a load may call.

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
does the same across two real tabs. A new message thread posts to
`/api/spaces/[spaceId]/threads` for the partnership its dialog was opened
for, which stays fixed while the dialog is open however the board under it
reloads; `e2e/messages-contexts.spec.ts` switches in a second tab under an
open dialog. Adding a task or a reward posts `spaceId`
the same way, chosen under "For whom?" (`ForWhom`) when the context shows more
than one space it could go to; completing, undoing, claiming and editing name
the task, completion or reward, which carries its own space; setting credits
names the space and the member.

## Items carry their own space

An item page (`/notebook/[entryId]` and its menus, `/tasks/[taskId]`,
`/rewards/[rewardId]`, `/messages/[threadId]`) takes its space from the item, never from the context: opened while the switcher says someone else, it
shows as whoever's it is (a chip at the top right), with that partnership's
names and the actions its rules allow, and the context is left as it was. So
a link to an item means the same thing to everyone who can open it, whatever
their device's context is, and needs no context in its URL. A push
notification's link is a thread's own page for exactly this reason
([notifications.md](notifications.md)).

**A feature a context does not have** shows its own empty state with a
one-tap switch, and never switches by itself. Messages in Me is the first:
"Messages are between you and a partner", with a "Switch to …" per partner
([messaging.md](messaging.md#the-board-in-each-context)).

## Tabs share it

- **Every tab on the device shows the context the cookie had when it last
  loaded.** A tab left open keeps its rendered list until it loads again.
- **Coming back refreshes it.** The app shell listens for `visibilitychange`;
  a tab coming to the front whose page was rendered for another context than
  the cookie now names invalidates `app:context`, so the switcher never claims
  one context over a list of another. Unlike a switch, this refresh does not
  hold the page (see [the switcher](#the-switcher)): until it lands the pill
  and the list still agree.
- **Back does not undo a switch.** History holds URLs, and switching does not
  change the URL: the same page re-runs its loads in place.
- **A pasted list link** (`/today`, `/notebook`, `/tasks`, `/rewards`,
  `/messages`) shows whatever context the person opening it has.
- **A card's link switches first.** Today's cards for the notebook, tasks,
  rewards and messages lead to a list that follows the context, so following
  one sets the context the card previewed and then navigates
  (`followInContext` in `context-client.svelte.ts`, or `inContext` as an
  attachment on a plain link): Today's own context for tasks and rewards (not
  a no-op: another tab may have switched since), Me for the notebook card in
  Everyone and Me, the partnership for its notebook card, and the partnership
  for every link into messages that is about one partner (Everyone's unread
  rows, a partnership's Messages card, the help callout, the kink-list compare
  page). A deliberate choice of context, not a silent switch. A click that opens a new
  tab is left alone, and such links are not preloaded, since a preload would
  fetch the list in the old context
  ([section-widgets.md](section-widgets.md#the-unlinked-header)).
- **Accepting an invite switches too.** The accept action sets the context to
  the new partnership's space and lands on Today, which then shows that
  partnership's header and cards: what the two of you now share is the point
  of having accepted. A failed accept leaves the context as it was.

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

**The page is held until the switch lands.** The pill names the picked
context at once, but the page under it is the old context's until the
re-run's data arrives, and a quick tap there acted on what it showed: Today's
tasks card in Everyone, tapped just after picking Me, stored Everyone again
and opened the tasks in it. So while a switch is under way (from the request
to the re-run, a refusal included) the app shell's `<main>` is
`aria-busy="true"` and everything in it except the switcher is `inert`, and
dims after a beat (no fade under `prefers-reduced-motion`, only the step).
`switchContext` counts switches in flight and `holdWhileSwitching`, an
attachment on `<main>` in the `(app)` layout, follows the count, so this
lives in one place rather than in each page.

- **Inert, not a later label.** Holding back the new name until the data
  arrived would leave the stale page live, its taps racing the switch's own
  request for the cookie. `inert` takes the old content out of reach of a
  pointer, the keyboard and assistive tech alike, which an overlay or a click
  guard would not.
- **The switcher stays live.** It sits inside `<main>`, in the page header,
  and its close hands focus back to the pill, which under an inert ancestor
  would fall to `<body>`. An inert ancestor cannot be undone below it, so
  rather than `<main>` itself each sibling on the way down to the switcher
  (`data-context-switcher`) is held. Whatever the page had made inert itself
  is left as it was.
- **The nav stays live.** `AppNav` is outside `<main>`, and a tap on it opens
  a new page whose pill and list come from the same load, so nothing it lands
  on shows one context over another's things. A tap made before the switch's
  own refresh has started is followed, not dropped: the refresh waits for the
  navigation and then re-runs the page it landed on (below).
- **Coming back to a tab is not held.** Until the `visibilitychange` refresh
  lands, the pill and the page still agree on the context they were rendered
  in, so a tap acts on what it shows; holding would dim the page every time
  the app came to the front. A card's link (`followInContext`) is not held
  either: the tap is itself the choice of context, and the page it leaves is
  about to be replaced.

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

## Everyone is live

An Everyone list is as live as a list of one space, on one stream: the
notebook list and the messages board watch the viewer's own realtime room,
`user:<id>`, to which every space they are in fans its list events out, rather
than a stream per partnership ([realtime.md](realtime.md#everyone-one-stream-not-one-per-space),
[notebook.md](notebook.md#the-list-in-every-context),
[messaging.md](messaging.md#realtime)).

## A refresh never drops a tap

Pages that follow the context refresh themselves a lot: a switch, a tab
coming back, a realtime event on an Everyone list, a save. SvelteKit's own
`invalidate` and `invalidateAll` take over from a navigation already under
way: they re-run the page being left, and the navigation is abandoned when
its data arrives, silently. A link tapped while a save was still answering
went nowhere — "Add a reward" just after setting credits on `/rewards`, seen
under `wrangler dev`, whose answers are slow enough to land inside the
navigation.

So every refresh goes through `$lib/navigation` (`invalidate`,
`invalidateAll`), which waits for any navigation under way to land and then
refreshes the page it landed on; and every `use:enhance` comes from
`$lib/enhance`, whose `update()` refreshes the same way. Biome's
`noRestrictedImports` refuses SvelteKit's own anywhere else. Waiting loses
nothing: the new page loads after whatever the refresh was for, and the
refresh then re-runs its layouts too, so the list under a sheet catches up. A
navigation that starts *after* a refresh needs nothing: SvelteKit lets it win
and carries the invalidation into it. `e2e/rewards.spec.ts` orders a save's
answer inside a navigation by hand, and `src/lib/navigation.test.ts` covers
the waiting.

superforms calls SvelteKit's `invalidateAll` itself after a successful submit
that does not redirect, so it is the one refresh this does not cover.

## Files

| Path | What |
| --- | --- |
| `src/lib/context.ts` | The pure half: `AppContext`, the cookie's name and format, parsing, `spacesInContext`. Alias-free |
| `src/lib/space-colours.ts` | The palette, its labels, `resolveSpaceColours`. Alias-free: the schema imports `SpaceColour` |
| `src/lib/server/context.ts` | `listContextSpaces`, the per-request resolver, the cookie, `setSpaceColour`, `contextSpaceViews`, `contextSpaceIds` |
| `src/lib/context-client.svelte.ts` | Names and avatars for the browser, `switchContext`, `storeContext` and `followInContext` |
| `src/lib/navigation.ts`, `src/lib/enhance.ts` | Refreshes and `use:enhance` that wait for a navigation under way rather than dropping it |
| `src/lib/components/context/` | `ContextSwitcher`, `ContextAvatar`, `SpaceChip`, `SpaceColourForm` |
| `src/routes/api/context/+server.ts` | Switching |
| `drizzle/0050_add_space_member_colour.sql` | `space_members.colour`, a plain `ADD COLUMN` |

## Not built yet

- A dot on the control for something unread in another context.
- An unread badge on the nav's Messages tab. Nothing the app shell already
  loads says how many threads are unread, and counting them in the layout
  would add a query to every page in the app; the counts are on Today
  (Everyone's rows, a partnership's Messages card) and the board instead.
