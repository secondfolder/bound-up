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
page shows is the switcher's job. The Playroom and the guides are reached
from Today's cards, Daydreams from the Playroom, and all three light the
Today tab.

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
the same way, picked from the add button's fan when the context shows more
than one space it could go to ([below](#the-add-buttons-fan)), or under "For
whom?" (`ForWhom`) on an add sheet opened by its URL; completing, undoing, claiming and editing name
the task, completion or reward, which carries its own space; setting credits
names the space and the member. Moving a notebook entry posts the space it
goes to, and is checked against both that space and the entry's own
([notebook.md](notebook.md#moving-an-entry)).

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
`context-client.svelte.ts` (names, avatars, switching) and on
`ContextSelectorFan.svelte`, the fan itself, which the add button shares
([below](#the-add-buttons-fan)). The fan draws the disk, the options, the
wedge and the hint, and handles the press, the slide, the keyboard and the
clicks round it; the switcher is the pill (its own avatar, standing in on the
ring) and what a pick does. Everything below about the fan is true of both,
except where it says the pill.

**A page opts in** by rendering it, in its header's `corner` snippet
(`PageHeader` for the bottom nav's places, `NestedPageHeader` under them),
with `data.contextSpaces`, `data.context` and the viewer's name, and by its
load depending on `app:context`. Settings never shows it. **With no linked
partner it offers just Me and "Add partner"**: there is no Everyone
(`shownContexts`), which would just be Me again, and a stored Everyone shows
as Me. It is still drawn, so adding a partner is a tap away.

**The control** is a pill whose left end is the context's avatar at the
control's full height (40px), then the name and a caret.

- **Me** is the person glyph in your own blue.
- **A partner** is their initials in the colour you gave them. Names come from
  `partnerName()` (AGENTS.md invariant 12), so they read "…" until the vaults
  open, during SSR included.
- **Everyone** is the **avatar pie**: a slice per person, you first in blue
  then each partner in their colour, parted by thin lines of the darkest
  surface. Each slice carries the person's initials at 36px and over; smaller,
  it is colour only. The pie is SVG: slices with no gaps, and each divider a
  constant-width stroke drawn on top from the centre to the rim (opposite
  borders, with an even count of people, as one line through the centre).
  It was a conic gradient with an angular gap at each border, which is a
  wedge that narrows to nothing at the centre; Chrome does not anti-alias
  conic hard stops, so the middle of every divider broke up and vanished and
  the bright slices met there with no line between them, which read as a
  light patch at the centre.

**Tapping** fans every context out round a disk — Everyone, Me, each partner,
then a dashed "Add partner" linking to `/settings/partners/new` — over a very
slight dim of the whole app shell, nav included. The pill morphs into its own
avatar on the ring: it is pinned by its avatar's left edge (its anchor holds
the measured closed width), so as the label folds into the avatar the avatar
never jumps, and it flies straight to its place, scaled to the others' size.
Every other option springs out of the disk's centre, each 35ms after the one
before. An option is its avatar alone, with no name under it: the lit
option's name is shown where the hint is (see "The hint" below). Under
`prefers-reduced-motion` all of it simply appears and goes.

**One clock and one curve** (`context-fan.ts`: `OPTION_MS`, `optionTiming`,
`fanEase`, `diskScale`, `FAN_CSS_EASING`):

- **Opening bounces**, the disk, the options and the pill alike: back-out,
  out past their places and back. The disk is scaled to the share of the way
  out of the option furthest out, so it is the first option's curve, bounce
  and all, and no option is ever outside it. The pill flies by a CSS
  transition on the same curve, sampled into `linear()` (a `cubic-bezier`
  fit of back-out was off by nearly 5%), over the same 440ms (`OPTION_MS`).
- **Closing does not bounce, and is brisk**: every option falls back
  together, unstaggered, on a clean cubic ease-in, the disk shrinks on
  exactly that curve, and the pill flies home on an ease-out, all in
  `CLOSE_MS` (260ms; `pillDuration` gives the pill the same time each way as
  the options). Back-out run backwards had them swell first and shoot
  through the centre; with the stagger kept on closing the disk either
  waited for the last option or left the rest outside it; and at the
  opening's 440ms the ease-in left the options and the disk barely moving
  while the pill was already home.
- **The hint** fades in halfway through opening, its fade centred on the
  fan's middle, and out first on closing. It used to wait until the options
  had all but landed, which left the first thing a newcomer needs until last.

A **selection wedge** is the selected option's sector of the disk in its
colour (the accent for "Add partner"), solid and opaque round the avatar and
out to the rim, which the disk's own edge cuts crisply. Its two straight sides
are sharp and anti-aliased: the wedge is cut out by a `clip-path: polygon()`
(`wedgePolygon`, in the element's own box, so it turns with it), not by a
gradient's hard stops, since Chrome anti-aliases a clip path's edges but not
a conic gradient's stops, which drew every side not quite vertical or
horizontal as a staircase. Inwards, once past the avatars, it fades to
nothing well before the centre (`wedgeShading`, a radial mask). The selected
option's avatar has a 2px keyline of the disk's colour, without which it
vanished into a wedge of its own colour. There is no amber ring round the current or the lit avatar any
more: the wedge is the marker. The wedge turns about the disk's centre to
follow what is selected. Only the drawing is softened: the sector
`optionAt` hit-tests is the whole slice.

**"Add partner" glows instead.** It is not a context like the others, so lit
it takes no wedge (the wedge fades out under it): a soft cream glow behind its
"+" and a brighter dashed edge, and no keyline: a solid ring outside the
dashed edge changed its shape, where lit it should only brighten. Its hit
area is still its sector.

**Everyone's wedge is a pale spectrum** (`wedgeGradient`): the same shape as
a partner's, filled with every member's colour in the pie's order, you
first, each mixed well towards the cream (`SPECTRUM_SHARE`, 38% of the
colour) and blended smoothly into the next, so it reads as a light with a
hint of each rather than a second pie. Each colour sits in the middle of
its band (`spectrumStops`), and the first and last are pinned to the sides
too, so they run solid to them. That makes an end colour, which blends on
one side only, look wider than a middle one at equal shares, so the end
bands are a little narrower (`SPECTRUM_EDGE_WEIGHT` 0.9, chosen by eye from
sharp-sided wedges of three, four and seven colours; it was 1.9 while the
sides were feathered and faded the end colours). The colours are spread
over the part of the wedge that can be seen (`wedgeSpan`): Everyone is
always at an end of the arc, where half its sector is past the screen's
edge, and spread over all of it half the colours were off the screen. It
is built from the members' colours as they are, so a change of palette
needs nothing here.

**Lit**, an avatar grows 14% (`HOVER_SCALE`); the layout leaves room for any
one option to be lit (`roomBetween`, `visibleArc`). Keyboard focus is
shown, on `:focus-visible` only, by a thin cream outline round the avatar,
not the theme's amber focus ring, which would look like the old marker. Over
the disk the pointer is the hand anywhere in an option's sector, where a
click picks it, and the arrow elsewhere.

**What is selected**: the current context, until something else is pointed
at. Sliding, it is the option under the finger. Opened by a tap, a mouse
over the fan lights the option whose sector it is in, the same way, and the
hint shows its name; a click anywhere in that sector picks it. Off the disk, the
current one is lit again. Keyboard focus on an option lights it too. Touch
has no hover, so a tap-opened fan on touch shows the current context until a
tap picks one.

**The hint** (`hintPlacement`; in the add button's fan, with a small "New
task for" over the lit name, `litLead`, and its text at the bottom of its box,
next to the disk below it) is what to do ("Tap one, or next time hold
the button and slide"; "Slide onto one, then let go") while nothing is lit,
and the lit option's name ("Jun", "Add partner") in its place while one is:
the options carry no names of their own, so this is where a name is read.
The name is much larger and heavier than the help (Web Awesome's `l`, weight
800, in the text's own colour) and wraps to two lines at most. The hint sits
at the top of the page, 12px down. When
more than a third of the disk is cut off by the page's right edge
(`HINT_RIGHT_CUT`: the disk's rightmost point, centre plus radius, lies more
than a third of the radius beyond the shell's right edge), it sits against
that edge, 12px in, right-aligned; a phone's disk, centred on the corner,
always is. Otherwise it is centred over the disk's centre, centred. It is at
most 150px wide and 60px tall (three lines of help, two of a name), stays
inside the shell, and where it would cover an option it first moves aside,
nearest first, by up to half its width (`HINT_SLIDE`), and only failing that
moves down until clear rather than over it. Moving down first dropped it
below the whole fan and back as a resize slid "Add partner" past its corner.
While a press that began on it is selecting its words, what is lit holds
still, since lighting another option would swap the text under the
selection. A
resize across the threshold glides it there (a transform transition), and
the text is drawn once each way, cross-fading, so its alignment never jumps.
It is part of the fan, above the dim: its words can be selected and copied,
and a click on it does not close the fan. It lies over part of some options'
sectors (Add partner's, at the top of the disk, most often), and a click
there picks that option like a click anywhere else in its sector, so over a
sector it shows the pointer, not the text cursor. Dragging across it still
selects its words, and the click that ends a selection picks nothing.

### The fan's layout

The geometry is a pure module, `src/lib/context-fan.ts`, unit-tested in
`context-fan.test.ts`; `ContextSelectorFan` measures and draws what it returns, and
`e2e/context-switcher-layout.spec.ts` measures the result on real pages.

- **Where the disk is centred**: a fixed offset up and right of the pill's
  right end and middle (`fanCentre`), snapped onto the app shell's edge when
  within 16px of it and never outside it. On a phone, where the pill sits at
  the end of the header's first line, that is the screen's top-right corner;
  on a wide screen, where the page column has a maximum width, it is beside
  the pill, well in from the corner.
- **What the options use**: the part of the disk's edge that can be seen
  (`visibleArc` of the disk's own radius): the disk is a circle round the
  centre, clipped to the shell above its bottom nav, so a quarter of it round
  a corner, a half round the middle of the top edge, and for the add button
  the run from the screen's right edge round to the nav. It is shared out
  into equal sectors, one per option in the fan's order (first at one end,
  "Add partner" at the other), and each avatar sits **in the middle of its
  sector** (`spreadEvenly`), so every pair of neighbours is the same angle
  apart and each owns as much of what can be seen as the next. The wedge is
  that sector. Avatars used to sit on the ends of the arc, which put half of
  each end option's sector past the edge: on the add button's fan of two,
  most of each one's share was under the nav.
- **Centred unless it costs avatar size.** `layoutFan` looks for a fan with
  every avatar in its sector's middle, and takes it unless the only such fan
  has smaller avatars than one with its end ones moved: a crowded fan (six
  partners round a phone's corner) centres only with the smallest avatars,
  under a comfortable tap. There the end avatars, whose middles are too near
  the screen's edge for an avatar, lit, to be wholly inside it 8px in, move
  inward just as far as they must (`clampToArc`), a couple of degrees. Their
  sectors, and so their wedges and what a slide picks, stay where they are.
- **The disk is never so big that most of its edge is off the screen**
  (`RIM_SHARE`): it must show at least three quarters of the edge that a
  disk reaching only as far as the screen's far side (left or right, and top
  or bottom, whichever is further) shows from the same centre: a quarter
  round a corner, a half round the middle of the top edge. A larger ring makes room for
  more avatars, but past the screen's far edges its disk shows less and less
  of its edge; centring first found a fan of six partners along a sliver of
  a 738px ring at the far bottom left of a phone.
- **Sizes**: an option is only its avatar. `layoutFan` tries avatars from
  56px down to 36px and, for each, rings from 140px out; it takes the largest
  avatars whose smallest ring leaves 24px clear between the nearest two, one
  of them lit (`ROOM_TARGET`, `roomBetween`), else the largest that leave
  12px (`ROOM_GOOD`), else whatever leaves most; never under 4px
  (`OPTION_GAP`). 24px is about the spacing the names under the avatars used
  to force, when there were names, so dropping them did not crowd the fan. A
  fan one ring cannot give 12px with avatars of 48px or more — eight or nine
  options on a phone's quarter circle — **staggers**: every other option a
  row further in (an avatar, grown, and 4px), at the same even angles, so
  each has two steps of room.
- **Resizing** lays the fan out again rather than closing it (a window
  resize, the visual viewport changing, or a scroll, once a frame at most):
  the centre, the visible arc, the ring, the sizes and the hint's place are
  recomputed, and the pill flies to its recomputed place.

**Holding** the pill (280ms) or **pressing and sliding** opens the same fan.
While sliding, what is under the finger, as for a mouse over a tap-opened
fan, is **the option whose sector of the disk it is in** (`optionAt`), not
only its avatar: each option owns the slice
of the disk round it, from the centre to the disk's edge, with its borders
halfway to its neighbours (and half a step past either end), which is exactly
the wedge drawn under it, so what lights up is what letting go picks. Off the
disk, within 48px of its centre, or within 24px of where the press began
(so a wobble on the pill picks nothing), nothing is. "Add partner" lights up
like any other option, and letting go there opens it. Letting go over nothing
leaves the fan open for tapping. The pill takes pointer capture and
`touch-action: none`, so a slide is never a scroll. The hint names what is
under the finger, and a polite live region by the pill says what letting go
will do ("Let go to show Jun") to assistive tech, only when it changes.

**Closing.** A click anywhere but on the pill, an option, the lit option's
sector or the hint closes the fan: on the page, the nav, the middle of the
disk, or something drawn above the dim such as the app-wide notice (a
capture-phase listener on the document). The dim takes the click, so nothing
under it is acted on, and stops taking clicks the moment the fan starts
closing, so a tap just after is not lost; opened again while still closing
(Svelte turns the closing fan round rather than drawing a new one), it takes
them again, or a tap on the nav went through the open fan and changed page.
It used to be a `<button>`, which Web Awesome's native styles gave the form
control's height: it covered a 43px strip along the top, darkened, and every
click below it went to the page. The option buttons had the same height and
`justify-content: center`, which moved every avatar 18px up from where the pill
flew to, when an option was an avatar with a name under it.

**Picking** a different context is one flight: the pill becomes the picked
avatar where it stands on the ring, in the same frame as that avatar hides
and the old context's own avatar shows again, so nothing on screen moves;
from the next frame it flies home and unfolds with the new name, while the
old context's avatar falls back into the disk with the rest, and `POST
/api/context` and `invalidate('app:context')` re-run the page in place. It
used to glide from the old context's place to the picked one's first, and
jumped before that: the new name changed the pill's closed width, which moved
its anchor (the end of its row) a frame late, when the label's size was next
observed, so the new width is now read, the anchor resized and the fan
measured before the next paint. `e2e/context-switcher-layout.spec.ts`
records the pill's place every frame through a pick and fails on any step
away from home. A refusal shows the
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
rectangle and nav are measured when the fan opens and on every resize: the
shell is fitted to the visual viewport, so its edges are the screen's even
with the iOS keyboard open. The page under an open fan does not scroll (it
would carry the pill off its place).

**Keyboard and assistive tech.** The trigger is a native `<button>` with
`aria-expanded` and `aria-haspopup` — a disclosure trigger, which `wa-button`
cannot be since it forwards no ARIA state (AGENTS.md). Enter or Space toggles
the fan (a click with `detail` 0; a pointer's click is already handled by the
press). Each context is a real button named "Show …", the current one with
`aria-current`, in a fieldset named "Whose to show". Focus moves onto the
current one on opening and back to the trigger on closing; Escape (a keydown on
the component, not the window) and tabbing out both close it; the dim behind
the fan is not focusable. Under `prefers-reduced-motion` nothing moves: the CSS
transitions are off and the fan's transitions and the pick's pause are zero.

## The add button's fan

The list pages' add button (`src/lib/components/AddButton.svelte`; tasks,
rewards and the notebook) asks, in a context with more than one space
something can be added to (Everyone), whose a new item is, with the same fan:
an avatar per such space, in the switcher's order, and nothing for Everyone
or "Add partner", which are not places. Picking one hands its space to the
page, which posts it as `spaceId` (writes name their space, as ever). With
one such space the button adds there at once and has no fan; with none there
is no button.

What differs from the switcher's fan:

- **No option is showing now**, so nothing is selected on opening: no wedge,
  and the hint gives what to do until an option is lit. The focus that
  opening moves onto the first option lights nothing; only a choice does.
- **The button stays where it is**, rather than flying onto the ring, and
  turns its + into a × to say a tap closes it. The disk is centred on it.
- **The disk is only as big as its avatars need.** Nothing in this fan is
  text, so its ring starts just outside the button (`clear`, half the
  button's measured size, in place of the switcher's 140px `MIN_RADIUS`) and
  grows only until the avatars have room: two places to add to make a disk
  of about 120px on a phone, where the switcher's ring would make it 180.
  More places, a smaller window, or one resized smaller make it bigger, and
  may stagger it into two rows; it is laid out again on every resize, so the
  avatars move to their new places and the disk follows.
- **The hint starts just above the disk** (`hintPlacement`'s `disk`), not at
  the top of the page, which on a phone is most of the screen away from a
  fan at the bottom. Its text sits at the bottom of its box, so it is next to
  the disk however many lines it runs to, and a lit name has what picking it
  does over it, small ("New task for", "New journal entry for"; `litLead`):
  the switcher's names say that themselves, these do not.
- **The nav is left as it is** (`dimNav` off): the dim stops above it, and it
  takes its own taps, which close the fan on the way. Over it, nothing is
  lit and a click picks nothing: every sector is a share of the disk's edge
  above the nav, and a pointer anywhere off the part of the disk that can be
  seen is over no option (`slotAt`), in either fan. The end sectors used to
  run on under the nav, where a pointer lit the option above it.

Its options are named for what picking does ("Add a task for Jun", "New note
for me") and the button for what it asks ("Add a task: choose whose it’s
for"), with `aria-expanded`.

## The kink list

The signed-in kink list follows the switcher too, though its pages differ by
context rather than filtering one list: Me and Everyone are your own list
(`/playroom/kink-list`), and a partnership is your list for that partner
(`/playroom/kink-list/partner/[id]`). Your own list's load depends on the
context and sends a partnership on to its partner view (a 307), so switching
there lands on it. A partner view is its partnership's whatever the context
says, as an item page is, and picking anything else in its switcher goes to
your own list (`onswitch`), which sends a partner on again. Its way back to
your own list switches to Me on the way (`inContext`), or it would send you
straight back.

## Colours

Each partnership shows in a colour **each member chooses for themselves**:
`space_members.colour`, the viewer's own row, never seen by the others. It is
one of a closed list (`SPACE_COLOURS` in `src/lib/space-colours.ts`), each a
`--space-colour-<name>` token in `theme.css`
([theme.md](theme.md#space-colours)), and stored in the clear, so a list
rather than a free value keeps it from carrying anything else.

The palette is the **signature hues**, each an OKLCH colour at its own most
characteristic lightness rather than all at one:

| Who | Name | OKLCH | sRGB |
| --- | --- | --- | --- |
| You (your own space) | Blue | `oklch(68% 0.16 252)` | `#439bf7` |
| Partner colour 1 | Green | `oklch(78% 0.17 145)` | `#68d36f` |
| 2 | Pink | `oklch(78% 0.15 355)` | `#ff8dbc` |
| 3 | Purple | `oklch(66% 0.17 300)` | `#a376e9` |
| 4 | Teal | `oklch(80% 0.12 190)` | `#47d6cf` |
| 5 | Red | `oklch(66% 0.19 25)` | `#f05653` |
| 6 | Yellow | `oklch(90% 0.16 102)` | `#f4e151` |

- **Each is one basic colour name**, so a single colour seen alone — one
  chip, one avatar — says whose it is, rather than needing its neighbours to
  tell "teal" from "the other teal".
- **Your own space is always blue** (`--space-colour-me`), so blue is not on
  the list. It is not the app's amber accent any more: the accent is for
  buttons, links and what is lit, and no longer also means "you".
- **No orange or brown**: the amber accent (`--accent-color`) and the rust
  surfaces own them, so a partner in either would read as part of the app.
- **The order is priority**, most pleasing first, because a default takes the
  first free colour and most people only ever see the first few. Yellow and
  red are last: yellow neighbours the amber, and red is the app's error
  colour.
- **Dark ink stays legible on every one** (`--space-colour-ink`, 5:1 or
  better; purple and red are the closest).

- **Unset is a default, not a write**: `resolveSpaceColours` gives each
  partnership without a choice the next colour nobody chose, in the order the
  switcher lists them, so two partners differ without anyone picking.
- **Chosen** at Settings → Partners → a partner → Colour (the `colour` action,
  `SpaceColourForm`), which re-checks that the viewer is in a linked
  partnership and writes only their own row.
- **A stored name not on the list reads as not chosen** (`storedSpaceColour`),
  so it gets a default rather than drawing nothing or throwing.
- **The palette has changed once.** It was teal, violet, blue, pink, green and
  lime, with your own space in the accent amber. `0054` moved every stored
  choice to the nearest new hue: violet and blue to purple (blue is your own
  now, so a partner who was blue is purple), lime to yellow, and teal, pink and
  green as they were.

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
| `src/lib/space-colours.ts` | The palette, its labels, `resolveSpaceColours`, `storedSpaceColour`. Alias-free: the schema imports `SpaceColour` |
| `src/lib/server/context.ts` | `listContextSpaces`, the per-request resolver, the cookie, `setSpaceColour`, `contextSpaceViews`, `contextSpaceIds` |
| `src/lib/context-client.svelte.ts` | Names and avatars for the browser, `switchContext`, `storeContext` and `followInContext` |
| `src/lib/context-fan.ts` | The fan's geometry and motion: the centre, the visible arc, even spacing, room between avatars, staggering, which sector a point is in, the hint's place, the wedge's shading and fill (Everyone's spectrum), the shared timing and easing. Pure, alias-free |
| `src/lib/navigation.ts`, `src/lib/enhance.ts` | Refreshes and `use:enhance` that wait for a navigation under way rather than dropping it |
| `src/lib/components/context/` | `ContextSelectorFan` (the fan), `ContextSwitcher` (the pill), `ContextAvatar`, `SpaceChip`, `SpaceColourForm` |
| `src/lib/components/AddButton.svelte` | The list pages' add button, and its fan in Everyone |
| `src/routes/api/context/+server.ts` | Switching |
| `drizzle/0050_add_space_member_colour.sql` | `space_members.colour`, a plain `ADD COLUMN` |
| `drizzle/0054_map_space_colours_to_signature_hues.sql` | Moves the old palette's stored names to the signature hues |

## Not built yet

- A dot on the control for something unread in another context.
- An unread badge on the nav's Messages tab. Nothing the app shell already
  loads says how many threads are unread, and counting them in the layout
  would add a query to every page in the app; the counts are on Today
  (Everyone's rows, a partnership's Messages card) and the board instead.
