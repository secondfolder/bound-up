# Section widgets

**Today** (`/today`) is the signed-in app's front page and a hub: it does
nothing itself, it sends you somewhere else. It does that with a column of
**cards** — a header that links to the section, and a body that previews what
is behind it — rather than the row of buttons the first version had, which
told you a destination existed and nothing about whether it was worth opening.

Today follows the context ([contexts.md](contexts.md)): which cards it shows,
and what they cover, is the switcher's choice. It replaced two pages, `/home`
(now Today in Everyone) and the partner page `/partner/[id]` (now Today in that
partnership's context); neither exists any more, except `/home` as a temporary
redirect for old home-screen installs ([temporary-code.md](temporary-code.md#the-home-redirect)).

## The shape

One shell, one component per destination.

```
SectionWidget            the card: wa-card, header, optional header link, body
├─ GuidesWidget          first few guide titles — only with the guides feature
├─ TasksWidget           tasks ready to complete now
├─ RewardsWidget         credit balance + rewards claimable now
├─ PartnerMessagesWidget unread / total threads for one partnership
├─ UnreadMessagesWidget  one row per partner with unread — Everyone only
└─ PlayroomWidget        the last IQ test score — Everyone and Me
```

`SectionWidget` knows nothing about tasks, rewards or messages. The widgets know
nothing about card chrome. `WidgetItems` renders the title-plus-note list that
Guides, Tasks and Rewards all want, so that list exists once.

| Context        | Cards                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| Everyone       | Messages (conditional), Guides (conditional), Tasks, Rewards, Notebook, Playroom |
| Me             | Tasks, Rewards, Notebook, Playroom, Guides (conditional)                          |
| A partnership  | its header, then Messages, Tasks, Rewards, Notebook, Kink lists (header only)     |

The load (`(app)/today/+page.server.ts`) depends on `app:context` and returns
`today`, a union on `kind` (`all`, `solo`, `shared`), so each context's data
carries only its own cards. **Me carries nothing of a partner's at all** — no
unread rows, no partnership's tasks, rewards or ids — not merely nothing
shown: Me is what a screen shown to someone else can be left on, and load data
is serialised into the page. A cookie naming a partnership that has since
ended reads as Everyone, as every ambient context does.

The Guides card shows **only to an account that holds the `guides` feature**
(see [features-and-admin.md](features-and-admin.md)). The load reads
`features` from the app shell layout and skips the guides query entirely
otherwise — D1 charges for rows read by a card nobody sees — returning
`guides: null`. That layout list only decides what is shown; `/guides`
refuses an account without the feature by itself.

There is no Daydreams card. Daydreams are a Playroom tool
([playroom.md](playroom.md)), reached through the Playroom's card like the
kink list and the IQ test, so Today's load reads no daydreams at all.

The page's title row is an `h1` "Today" with the context switcher at its
end, inset like the other headers and, like `PageHeader` on the bottom
nav's other places, with no back link: this is where back goes. In a partnership's context a **header** sits above the cards: the
partner's avatar in the colour the viewer gave them (`ContextAvatar`, the same
initials and colour as the switcher), their name through `partnerName()` and
"*your name*'s *their role*" through `viewerNames()` (sealed, "…" until the
vault opens), their local time (`TimeZoneDisplay`, shown only when it differs
from yours), and a quiet link to the partnership's settings page — "Edit this
connection" or "Connection settings" by who may edit it. It is the old partner
page's header, moved.

The cards sit in one `--card-column-width` column in every context, so a
component is one width everywhere. Kink lists is a bare `SectionWidget`, header
and no body: it has no summary worth a preview, and what it shows is sealed
until its page opens it, but as a lone link under four cards it read as an
afterthought.

Every Everyone card shows self **and** partner data wherever both exist — see
below.

## The unlinked header

`SectionWidget`'s `href` is optional, and Everyone's messages card is why.
It counts unread threads per partner, so its title is plain text and each row
carries its own link: to `/messages` in that partner's context, where the
threads it counted are. Every other card links.

The Notebook, Tasks, Rewards and partnership Messages cards link to
`/notebook`, `/tasks`, `/rewards` and `/messages`, which show the current
context ([contexts.md](contexts.md)) rather than one space, so following one
sets the context to what the card previews first — Today's own context for
tasks, rewards and a partnership's messages, the viewer's own space for the
notebook in Everyone (that card is their own notebook's), and the partner's
for each Everyone messages row —
through `followInContext` in `context-client.svelte.ts` (the cards' `opensIn`
prop, and `SectionWidget`'s `onfollow`; `inContext` for the messages rows,
which are plain links). Setting the context Today already shows is not a
no-op: another tab can have switched the device since this one rendered, and
the list should show what the card did. A link opened in a new tab skips that and shows
the context as it is. Such a link is not preloaded on hover
(`data-sveltekit-preload-data="off"`): the preload would fetch the list in the
old context, and the navigation then used it. It navigates with
`invalidate: ['app:context']`, so the app layout's context, which a navigation
does not otherwise re-run, follows too.

That card goes away **entirely** when nothing is unread — the whole card, not
just its body, which is what every other card drops. A "Messages" header on its
own would still be chrome on a screen read at a glance, and its header links
nowhere, so there would be nothing to do with it.

It stays first on the page. Something waiting from a partner is the reason to
have opened the app, and it should not be below the fold on a short phone.

## Everyone is an overview of every space

The Tasks and Rewards cards in Everyone cover **every space the viewer is in** —
their own and each partnership's — which is what `/tasks` and `/rewards` show
in the Everyone context, where those cards lead. That is load-bearing: a card
that read only the viewer's own tasks reported "Nothing to do right now." while
a partner's task sat waiting one tap away, which is the opposite of what the
cards are for. In Me and in a partnership's context the same cards cover that
one space.

Every context calls the same readers, `getTasksWidget` and `getRewardsWidget`, with
the space ids to cover, and they sort rows onto a side with the same rules the
full pages use (`taskListFor`, `rewardListFor`; see
[tasks.md](tasks.md#to-do-and-set-for-others)):

- the preview lists only what the viewer completes or claims, and
- never a row they wrote themselves, since authorship is independent of who
  manages.

What a viewer sets for a partner adds nothing to the Everyone preview. Their
own space is always among Everyone's spaces and they always act in it, which is
why `viewerActs` is always true there and in Me.

Rows from several spaces carry a `context`: the partner's name, or null for the
viewer's own. Without it two partners naming a task the same thing are the same
line twice. Sorting happens across every space, not per space, so the three
rows shown are the three most overdue (or the three cheapest) rather than the
first three of one space.

The other two cards have no spaces to merge:

- **Guides** are shared content — not per account, not per partnership.
- **Messages** are per-partner by nature; that card is already nothing but
  partner data, one row each.

### Credits do not pool

`RewardsWidgetView` carries `balances`, a list, rather than a `credits` number.
A space's credits buy that space's rewards and nothing else, so one
total would state a spending power nobody has — and would offer a claim the
claim path then refuses. Each row is priced against **its own** balance.

Me and a partnership's context have one space, so one unlabelled balance, which
reads exactly as a single number. Everyone labels each partnership's with the
partner's name.

## No empty states

A section with nothing to preview renders **no body at all** — a header, and
that is it. There is no "Nothing to do right now." or "Nothing you can afford
yet.", because those lines cost a reader a glance to learn what the absence of a
list already told them.

This is why `SectionWidget` takes its body as a `body` **snippet prop** rather
than `children`. There is no way to ask a rendered snippet whether it produced
anything, and wrapping the content in an `{#if}` inside `children` would still
hand the card a snippet and still draw an empty padded box. So the widget
decides and simply leaves `body` off. `wa-card` always renders its body div, so
`SectionWidget` also sets a `bodyless` class that collapses `::part(body)` —
`::part` being the only way to reach a node inside the card's shadow root.

What counts as "something to say" is per widget:

| Card               | Has a body when                                      |
| ------------------ | ---------------------------------------------------- |
| Tasks              | something is ready, or a waiting/hidden count exists |
| Rewards            | a non-zero balance or a claimable row                |
| Guides             | there is at least one guide                          |
| Messages (partner) | there is at least one thread                         |
| Playroom           | an IQ test result has been saved to the account      |
| Notebook           | there is at least one entry the viewer may see       |

Two of those are deliberately **not** treated as empty states, because they say
something an absent body does not:

- **"2 waiting on a schedule"** — the tasks exist and are not due yet.
- **"All caught up · 3 threads"** — history exists and you have read it.

A **zero balance is** treated as one: "0 credits" costs a glance to learn there
is nothing. `RewardsWidget` filters balances to `credits > 0`.

### The rewards card never names what you cannot claim

There is no "N still out of reach" line, and `RewardsWidgetView` carries no
count of unaffordable rewards to build one from — only `activeCount`, which just
the managing side renders. Naming a reward you cannot have yet is not an offer,
it is a reminder of what you are short of.

The consequence is deliberate: an account holding rewards it cannot afford, with
no credits, gets **no body at all** on that card. The rewards are still there,
one tap away behind the header link.

## Which side is looking

On a partnership, one side manages tasks and rewards and the other completes and
claims them — see [tasks.md](tasks.md#who-does-what) for how the space's
members decide that. A
"ready to complete" list shown to the manager would be somebody else's to-do
list, so `TasksWidgetView` and `RewardsWidgetView` both carry `viewerActs`:

- **true** — the preview list, plus any non-zero credit balance on rewards.
  Only what can be acted on now: never a count of what cannot.
- **false** — a count of what that person has set up, and no titles.

The rows are withheld **on the server**, not hidden in the component. Load
data is serialised into the page HTML, so a component-level `{#if}` would ship
them anyway.

### Titles are opened in the browser

Task and reward titles are sealed ([tasks.md](tasks.md#what-the-server-can-see)),
so the server cannot put them in a row. Each `WidgetItemView` carries the
record's sealed reference instead (`sealed`, and `kind` to say which kind it
opens as), and `WidgetItems` opens it with `openedWidgetTitle` from
`sealed-views.svelte.ts`: "…" until the vault is open, the title after; its
`title` is empty. Guides are the app's own content, never sealed: their rows
have `kind: 'guide'`, no `sealed`, and the title itself.

`viewerActs` is always true in Everyone and Me, where the viewer's own space
has only one side.

## The data

Each card has a narrow view type in `src/lib/types.ts` and a reader that fetches
only what the preview shows:

| Type                        | Read by                                               | Lives in              |
| --------------------------- | ----------------------------------------------------- | --------------------- |
| `TasksWidgetView`           | `getTasksWidget`, over the card's space ids           | `server/tasks.ts`     |
| `RewardsWidgetView`         | `getRewardsWidget`, over the card's space ids         | `server/rewards.ts`   |
| `GuidesWidgetView`          | `loadGuidesCard`, only with the guides feature        | the Today load        |
| `PartnerMessagesWidgetView` | `getPartnerMessagesWidget`                            | `server/messaging.ts` |
| `IqTestResultView`          | `latestIqTestResult` (one row)                        | `server/iq-test.ts`   |
| `WidgetItemView[]` (notebook) | `getHomeNotebookWidget`, `getPartnershipNotebookWidget`; hidden entries left out on the server | `server/notebook.ts` |

These deliberately do **not** reuse `listTasks`, `listRewards` or the other
page loaders. Those also read every completion and every claim ever
recorded, for a body that shows at most three titles, and D1 charges for rows
read. Each widget reader is one pass over the active rows with the handful of
columns the card renders, splitting ready-from-waiting and affordable-from-locked
in JS so it reuses the same `isTaskCompletableAt` and `credits >= cost` rules the
full pages apply. An off-by-one here would offer a claim the claim path then
refuses.

The tasks and rewards readers read only the spaces among those named that the
viewer is in (`loadItemSpaces`), so a space id they are not in contributes
nothing rather than leaking rows; which side of each space the viewer is on is
worked out there with the rules the full pages use, rather than re-derived in
the page load.

### Messages are counts, and that is not a shortcut

`getPartnerMessagesWidget` returns numbers because there is nothing else it
could return: every body is encrypted to keys the server does not hold. Previews
on the board are decrypted in the browser — see [encryption.md](encryption.md).

Its unread predicate is `listUnreadCounts`'s, character for character. It has to
stay that way, or Today's two messages cards (a partnership's, and Everyone's
row for it) would disagree about what "unread" means for the same partnership.
A test asserts the two agree.

## Things that will bite

- **`wa-card` needs `with-header`.** Without it the card server-renders the body
  only and the header pops in at hydration — it works around the absence of
  `:has-slotted`. `SectionWidget` sets it unconditionally, because every section
  has a title.
- **The header link's accessible name is the bare word.** Both icons are
  unlabelled, so "Tasks" stays "Tasks" — the name the `wa-button` it replaced
  had, and the name the Playwright suite locates these cards by. Anything added
  to that header that carries a label will break those specs.
- **The whole header bar is the link.** The header part's padding is zeroed and
  moved onto the `<a>` inside it, so a tap anywhere on the bar lands; with the
  padding on the part, only the 22px line of text did. The chevron leans 3px
  towards the link on hover and focus (not with reduced motion).
- **A row's context is a sibling of its title, not inside it.** The title
  ellipsises; the partner's name after it keeps its place (up to a third of the
  row). Inside the title, a long title's ellipsis cut the name off entirely,
  and the row no longer said whose it was.
- **A task or reward row's note is credits, and says so** with a coins icon
  labelled "credits"; a balance always carries its unit ("3 credits with
  Morgan"), never a bare number.
- **A card body must not contain a link with the header's name.** Two links
  sharing an accessible name is a real problem for anyone navigating by link
  list. `WidgetItems` rows are deliberately not links for this reason.
- **The preview cap is three rows.** Raising it pushes the next card below the
  fold on a phone, which is the problem the cards were meant to solve.
- **A body wrapped in an `{#if}` is still a body.** Passing `body` and hiding
  its contents leaves wa-card drawing an empty padded box under the header. Omit
  the prop instead.
