# Section widgets

`/home` and `/partner/[id]` are hubs: neither does anything itself, both send
you somewhere else. They used to do that with a row of buttons, which told you a
destination existed and nothing about whether it was worth opening. Each is now
a row of **cards** — a header that links to the section, and a body that
previews what is behind it.

## The shape

One shell, one component per destination.

```
SectionWidget            the card: wa-card, header, optional header link, body
├─ GuidesWidget          first few guide titles — only with the guides feature
├─ DaydreamsWidget       the most recently played daydreams — only with that feature
├─ TasksWidget           tasks ready to complete now
├─ RewardsWidget         credit balance + rewards claimable now
├─ PartnerMessagesWidget unread / total threads for one partnership
├─ UnreadMessagesWidget  one row per partner with unread — /home only
└─ PlayroomWidget        the last IQ test score — /home only
```

`SectionWidget` knows nothing about tasks, rewards or messages. The widgets know
nothing about card chrome. `WidgetItems` renders the title-plus-note list that
Guides, Tasks and Rewards all want, so that list exists once.

| Page            | Cards                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `/home`         | Messages (conditional), Guides (conditional), Daydreams (conditional), Tasks, Rewards, Notebook, Playroom |
| `/partner/[id]` | Messages, Tasks, Rewards, Notebook, Kink lists (header only)                                              |

The Guides card shows **only to an account that holds the `guides` feature**
(see [features-and-admin.md](features-and-admin.md)). The `/home` load reads
`features` from the app shell layout and skips the guides query entirely
otherwise — D1 charges for rows read by a card nobody sees — returning
`guides: null`. That layout list only decides what is shown; `/home/guides`
refuses an account without the feature by itself. The Daydreams card works
the same way with the `daydreams` feature, returning `daydreams: null`
without it; its titles are sealed, so `WidgetItems` opens them in the browser
like a task's.

On `/partner/[id]` the cards sit in the same `--card-column-width` column as
on `/home`, so the one component is one width on both. Kink lists is a bare
`SectionWidget`, header and no body: it has no summary worth a preview, and
what it shows is sealed until its page opens it, but as a lone link under
three cards it read as an afterthought. Connection settings stays a quiet link
at the foot, since it is not a section of the relationship.

Every `/home` card shows self **and** partner data wherever both exist — see
below.

## The unlinked header

`SectionWidget`'s `href` is optional, and the `/home` messages card is why.
Messages are per-partner: there is no single `/messages` page behind the word,
so its title is plain text and each row carries its own link to that partner's
board. Every other card links.

That card goes away **entirely** when nothing is unread — the whole card, not
just its body, which is what every other card drops. A "Messages" header on its
own would still be chrome on a screen read at a glance, and unlike the others it
links nowhere, so there would be nothing to do with it.

It stays first on the page. Something waiting from a partner is the reason to
have opened the app, and it should not be below the fold on a short phone.

## /home is an overview of both halves

`/home/tasks` and `/home/rewards` each show **your own section plus one per
partner**. The cards that link to them show the same two halves merged into one
preview, and that is load-bearing: a card that read only the self half reported
"Nothing to do right now." while a partner task sat waiting one tap away, which
is the opposite of what the cards are for.

`getHomeTasksWidget` and `getHomeRewardsWidget` therefore take the layout's
partner list — the same list `listUnreadCounts` takes — and decide which partner
rows count exactly as `listHomePartnerTaskSections` and
`listHomePartnerRewardSections` decide it:

- the partnerships where you are on the **completing / claiming** side, and
- minus the rows you wrote yourself, since authorship is independent of control.

A partnership you **manage** contributes nothing to `/home`. Managing it happens
on its own partner page — which is also why `viewerActs` is always true on
`/home`.

Merged rows carry a `context`: the partner's name, or null for your own. Without
it two partners naming a task the same thing are the same line twice. Sorting
happens across both sources, not per source, so the three rows shown are the
three most overdue (or the three cheapest) rather than the first three self rows.

The other two cards have no self half to merge:

- **Guides** are shared content — not per account, not per partnership.
- **Messages** are per-partner by nature; that card is already nothing but
  partner data, one row each.

### Credits do not pool

`RewardsWidgetView` carries `balances`, a list, rather than a `credits` number.
A partnership's credits buy that partnership's rewards and nothing else, so one
total would state a spending power nobody has — and would offer a claim the
claim path then refuses. Each row is priced against **its own** balance.

A partner page has one scope, so one unlabelled balance, and reads exactly as a
single number. `/home` labels each one.

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
| Daydreams          | there is at least one daydream                       |
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
claims them — see [partners.md](partners.md) for how control decides that. A
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
`sealed-views.svelte.ts`: "…" until the vault is open, the title after. A row
written before sealing still has a plaintext `title`, shown straight away.
Guides are the app's own content, never sealed, and their rows have
`kind: 'guide'` and no `sealed`.

`viewerActs` is always true on `/home`, where there is only one side.

## The data

Each card has a narrow view type in `src/lib/types.ts` and a reader that fetches
only what the preview shows:

| Type                        | Read by                                               | Lives in              |
| --------------------------- | ----------------------------------------------------- | --------------------- |
| `TasksWidgetView`           | `getHomeTasksWidget`, `getPartnershipTasksWidget`     | `server/tasks.ts`     |
| `RewardsWidgetView`         | `getHomeRewardsWidget`, `getPartnershipRewardsWidget` | `server/rewards.ts`   |
| `GuidesWidgetView`          | `loadGuidesCard`, only with the guides feature        | the `/home` load      |
| `DaydreamsWidgetView`       | `getDaydreamsWidget`, only with the daydreams feature | `server/daydreams.ts` |
| `PartnerMessagesWidgetView` | `getPartnerMessagesWidget`                            | `server/messaging.ts` |
| `IqTestResultView`          | `latestIqTestResult` (one row)                        | `server/iq-test.ts`   |
| `WidgetItemView[]` (notebook) | `getHomeNotebookWidget`, `getPartnershipNotebookWidget`; hidden entries left out on the server | `server/notebook.ts` |

These deliberately do **not** reuse `getSelfTasksSection`, `getSelfRewardsSection`
or the `get*Page` loaders. Those also read every completion and every claim ever
recorded, for a body that shows at most three titles, and D1 charges for rows
read. Each widget reader is one pass over the active rows with the handful of
columns the card renders, splitting ready-from-waiting and affordable-from-locked
in JS so it reuses the same `isTaskCompletableAt` and `credits >= cost` rules the
full pages apply. An off-by-one here would offer a claim the claim path then
refuses.

The two partnership readers return `null` when the viewer is not a member, each
going through its own `require*Membership` — tasks and rewards resolve
_different_ permissions from the same partnership (who completes, who claims),
and those checks belong with the rules they enforce rather than being re-derived
in the page load.

### Messages are counts, and that is not a shortcut

`getPartnerMessagesWidget` returns numbers because there is nothing else it
could return: every body is encrypted to keys the server does not hold. Previews
on the board are decrypted in the browser — see [encryption.md](encryption.md).

Its unread predicate is `listUnreadCounts`'s, character for character. It has to
stay that way, or the partner card and `/home` would disagree about what
"unread" means for the same partnership. A test asserts the two agree.

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
