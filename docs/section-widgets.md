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
├─ GuidesWidget          first few guide titles — not rendered for now
├─ TasksWidget           tasks ready to complete now
├─ RewardsWidget         credit balance + rewards claimable now
├─ PartnerMessagesWidget unread / total threads for one partnership
└─ UnreadMessagesWidget  one row per partner with unread — /home only
```

`SectionWidget` knows nothing about tasks, rewards or messages. The widgets know
nothing about card chrome. `WidgetItems` renders the title-plus-note list that
Guides, Tasks and Rewards all want, so that list exists once.

| Page            | Cards                                          |
| --------------- | ---------------------------------------------- |
| `/home`         | Messages (conditional), Tasks, Rewards         |
| `/partner/[id]` | Messages, Tasks, Rewards                       |

The Guides card is **hidden from `/home` for now**: guides need more work before
they are advertised. `GuidesWidget` and `GuidesWidgetView` are kept for when it
returns, but the `/home` load no longer queries guides — D1 charges for rows
read by a card nobody sees — so bringing it back means restoring that query as
well as the markup. `/home/guides` itself still works; nothing links to it.

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
| Messages (partner) | there is at least one thread                         |

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

The titles are withheld **on the server**, not hidden in the component. Load
data is serialised into the page HTML, so a component-level `{#if}` would ship
them anyway.

`viewerActs` is always true on `/home`, where there is only one side.

## The data

Each card has a narrow view type in `src/lib/types.ts` and a reader that fetches
only what the preview shows:

| Type                        | Read by                                               | Lives in              |
| --------------------------- | ----------------------------------------------------- | --------------------- |
| `TasksWidgetView`           | `getHomeTasksWidget`, `getPartnershipTasksWidget`     | `server/tasks.ts`     |
| `RewardsWidgetView`         | `getHomeRewardsWidget`, `getPartnershipRewardsWidget` | `server/rewards.ts`   |
| `GuidesWidgetView`          | nothing while the card is hidden                      | —                     |
| `PartnerMessagesWidgetView` | `getPartnerMessagesWidget`                            | `server/messaging.ts` |

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
- **A card body must not contain a link with the header's name.** Two links
  sharing an accessible name is a real problem for anyone navigating by link
  list. `WidgetItems` rows are deliberately not links for this reason.
- **The preview cap is three rows.** Raising it pushes the next card below the
  fold on a phone, which is the problem the cards were meant to solve.
- **A body wrapped in an `{#if}` is still a body.** Passing `body` and hiding
  its contents leaves wa-card drawing an empty padded box under the header. Omit
  the prop instead.
