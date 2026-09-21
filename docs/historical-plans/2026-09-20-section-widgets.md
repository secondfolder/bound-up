# Section widgets on /home and /partner/[id]

## The problem

`/home` and `/partner/[id]` are both a row of `wa-button`s that go somewhere.
The button tells you the destination exists; it tells you nothing about whether
there is anything there worth opening. Two taps to find out that no task is due
is two taps too many on a phone.

## The shape

Replace each button with a **card**: a header whose title links to the page, and
a body underneath that previews what is behind the link.

One shell component, `SectionWidget.svelte`, owns the card chrome. One component
per destination calls it and supplies its own body. The shell knows nothing
about tasks, rewards or messages; the per-destination widgets know nothing about
card borders.

```
SectionWidget            the card: panel, header, optional header link, body slot
├─ GuidesWidget          first few guide titles
├─ TasksWidget           tasks ready to complete now
├─ RewardsWidget         credit balance + rewards claimable now
├─ PartnerMessagesWidget unread / total threads for one partnership
└─ UnreadMessagesWidget  one row per partner with unread — home only
```

`WidgetItems.svelte` renders the `title` + optional `note` list that Guides,
Tasks and Rewards all want, so the list markup and its empty state live once.

### Card set

- **`/home`** — Messages (only when something is unread), Guides, Tasks,
  Rewards.
- **`/partner/[id]`** — Messages, Tasks, Rewards.

The home Messages card has **no header link**: messages are per-partner, so
there is no single `/messages` page to send anyone to. Its body is the existing
unread-partner list, each row linking to that partner's board. It renders
nothing at all when nothing is unread, which preserves today's behaviour — and
is why `SectionWidget`'s `href` is optional rather than required.

## Data

Each widget gets a narrow view type in `src/lib/types.ts` and a dedicated
server function that reads only what the preview shows. Reusing the existing
`get*Section` / `get*Page` loaders would drag in every completion and claim row
for a card that shows three titles, and D1 charges for rows read.

| Type                       | Built by                                                  |
| -------------------------- | --------------------------------------------------------- |
| `TasksWidgetView`          | `getSelfTasksWidget` / `getPartnershipTasksWidget`        |
| `RewardsWidgetView`        | `getSelfRewardsWidget` / `getPartnershipRewardsWidget`    |
| `GuidesWidgetView`         | inline in the `/home` load, like `/home/guides` does      |
| `PartnerMessagesWidgetView`| `getPartnerMessagesWidget`                                |

Each takes one pass over the **active** rows with narrow columns and splits
ready/waiting in JS, because readiness reuses `isTaskCompletableAt` and
affordability reuses the same `credits >= cost` rule the full pages apply. One
query, not three.

### The side that does not complete or claim

On a partnership the controller manages tasks and rewards; the other side
completes and claims them. A "ready to complete" list is meaningless to the
controller, so both widget views carry `viewerActs` and fall back to counting
what is set up ("4 active tasks") when it is false. The permission itself is
still decided on the server by the existing `require*Membership` helpers — the
widget only chooses what to render.

## Files

**New**

- `src/lib/components/SectionWidget.svelte`
- `src/lib/components/WidgetItems.svelte`
- `src/lib/components/GuidesWidget.svelte`
- `src/lib/components/TasksWidget.svelte`
- `src/lib/components/RewardsWidget.svelte`
- `src/lib/components/PartnerMessagesWidget.svelte`
- `src/lib/components/UnreadMessagesWidget.svelte`
- `docs/section-widgets.md`

**Changed**

- `src/lib/types.ts` — the four widget view types plus `WidgetItemView`
- `src/lib/server/tasks.ts`, `rewards.ts`, `messaging.ts` — the summary readers
- `src/routes/(auth-required)/(app)/home/+page.server.ts` and `+page.svelte`
- `src/routes/(auth-required)/(app)/partner/[id]/+page.server.ts` and `+page.svelte`
- `src/lib/components/UnreadPartnerLinks.svelte` — loses its own card border,
  because the widget around it now draws one
- `AGENTS.md` — a row in the feature-doc table

## Tests

- **Server** — the new summary readers in `tasks.test.ts`, `rewards.test.ts`,
  `messaging.test.ts`: ready vs waiting, affordable vs locked, own-authored rows
  excluded, and the controller side getting `viewerActs: false`.
- **Server (route)** — `home/page.server.test.ts` and
  `partner/[id]/page.server.test.ts` return the widget payloads.
- **Component** — `SectionWidget.svelte.test.ts` covers the linked and unlinked
  headers; `UnreadMessagesWidget.svelte.test.ts` covers the render-nothing case.
- **e2e** — the existing `getByRole('link', { name: 'Tasks' | 'Rewards' |
  'Messages' })` steps must keep working, which they do because the card header
  link keeps the same accessible name as the button it replaces.

## Risks

- **Accessible names.** Two links must not share one. The card header link takes
  the button's old name; the body must not contain a second link with the same
  name.
- **`wa-icon` in a header link.** An icon with no label contributes no text, so
  the link's name stays the bare word. Verified against the existing buttons,
  which already do this.
- **Home page height.** Four cards is taller than three buttons. If it stops
  fitting a phone, the bodies cap at three items and can drop to two before any
  card gets moved off home.
