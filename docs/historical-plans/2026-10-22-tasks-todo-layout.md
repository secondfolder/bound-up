# Tasks as a to-do list, a responsive sheet, and rewards to match

## Context

The tasks pages render every task as a full `ItemCard` (big heading, whole description, schedule
sentence, Complete + Edit buttons), stacked in a panel per partner. Two tasks fill a phone screen
and nothing is ordered by what can be done now. The user reviewed three to-do-app directions
(artifact "Tasks Layout Ideas": A checklist grouped by when, B tabs by who, C rows + detail sheet)
and chose all of them: A on `/home/tasks`, B on `/partner/[id]/tasks`, C's sheet on both. They
asked for:
- the sheet to become a centred dialog on a wide screen, built as a **generic component** for reuse;
- **real server-side undo** for completions (a circle is easier to mis-tap than a button);
- a **design proposal for rewards** too — same design, tweaked, or different, whichever fits.

Order of work: Part 1 (component), Part 2 (shared row + tasks), Part 3 (rewards), Part 4 (docs etc).

## Part 1 — `ResponsiveDialog`: a bottom sheet on a phone, a dialog on a wider screen

New `src/lib/components/ResponsiveDialog.svelte`, wrapping `wa-dialog` (already registered in
`src/lib/webawesome.ts`). It is the generic version of what `NewMessageDialog.svelte` does by hand
(lines ~279-300): one `wa-dialog`, restyled by CSS under `@media (width < 40rem)` into a sheet
pinned to the bottom of the visual viewport (`--viewport-top` / `--viewport-height` from
`$lib/visual-viewport.ts`, inherited from the app shell, so the keyboard does not cover it).

Why `wa-dialog` + CSS rather than switching to `wa-drawer placement="bottom"` like the roadmap:
- CSS decides the shape, so there is no `matchMedia` state, no hydration mismatch, and no
  re-render when the window crosses the breakpoint.
- `wa-dialog` uses native `<dialog>` in the top layer, which escapes the app shell's
  non-scrolling `<body>` (AGENTS.md "Adding a route") and sits above `AppNav`.
- Focus trapping, Escape, `aria-modal` and labelling come from the one element in both shapes.

API (pattern A from the existing dialogs: mounted only while open):

```ts
{
  label: string;              // accessible name; shown as the heading unless `header` is given
  header?: Snippet;           // replaces the default heading row (close button stays)
  children: Snippet;          // body
  footer?: Snippet;           // actions; sticky at the bottom of the sheet/dialog
  onclose: () => void;        // called on the dialog's own wa-after-hide (bubbled ones ignored)
  lightDismiss?: boolean;     // default true; spread, never bound (SSR renders "false" as true)
  width?: string;             // dialog width on wide screens, default min(32rem, 100vw - 2rem)
  class?: string;
}
```
plus an exported `close()` that sets `open = false` so the hide animation runs before `onclose`.

Details:
- Rendered with `open` in markup (it only exists while open), `onwa-after-hide` filtered on
  `event.target === event.currentTarget` (the trap UrlEmbed, NewMessageDialog, roadmap and
  SetupDialog all comment on).
- Sheet shape: full width, square bottom corners, no bottom border, a grab handle drawn in the
  header, `max-block-size: calc(var(--viewport-height, 100dvh) - 2rem)`, body scrolls, footer stays,
  bottom padding includes `--safe-area-inset-bottom-min`.
- Dialog shape: centred, `--width`, `max-block-size: min(80svh, 42rem)`, surface/border tokens from
  `theme.css` (no hex values).
- Slide-up animation for the sheet via Web Animations after `updateComplete` (same reason as
  `growFromOrigin`: a dialog rendered already open skips Web Awesome's show animation, and a
  `::part` CSS animation would replace the hide one). Nothing under reduced motion.
- A `:not(:defined)` fallback like `SetupDialog` so content does not flash inline before upgrade.
- No swipe-to-dismiss in this change (would need pointer handling inside a shadow part); the
  close button, Escape and the backdrop are the ways out.

Tests: `ResponsiveDialog.svelte.test.ts` through a small harness component — label/heading,
footer renders, `close()` → `onclose` once, a bubbled `wa-after-hide` from a nested `wa-details`
does not close, `lightDismiss` property, and the panel's measured shape at 1280×800 (centred) and
after `page.viewport(390, 844)` from `vitest/browser` (full width, flush with the bottom).

Doc: `docs/dialogs.md` — when to use `ResponsiveDialog` vs a plain `wa-dialog`/`wa-drawer`, the
two shapes, the visual-viewport placement, the after-hide trap; row in AGENTS.md's doc table.
NewMessageDialog keeps its own styling for now (it has its own header, origin animation and
URL-driven state); moving it over is a follow-up noted in the doc.

## Part 2 — Tasks as a to-do list

Covers roadmap entry `task-styling` ("Nicer task cards", `roadmap.json` ~593): mark it shipped.

### 2a. The row: generic `ItemRow.svelte` + `ItemGroup.svelte`, then `TaskRow.svelte`

Generic pieces, shared with rewards (Part 3), in `src/lib/components/`:
- `ItemRow` — a `<li>` grid `leading | body | trailing`. Snippets `leading`, `meta`, `trailing`;
  `title: string`; `onopen?: () => void` makes the body a native `<button>` (name = title) that
  opens the detail; `dimmed`, `celebrating` flags. Hairline divider between rows, not cards.
  Tokens only (`--wa-color-*`), tabular figures for the trailing column.
- `ItemGroup` — small uppercase `h3` with a count, then a `<ul>` of rows; `collapsed` renders it
  in a `wa-details` (for Inactive). Omitted by callers when empty.

`TaskRow` composes `ItemRow`. One line per task:
- **Leading control**, one of three:
  - *circle* — the viewer can complete it now. A native `<button type="submit">` inside the
    existing enhanced `<form>` (same action names and fields as today: `selfCompleteTask`,
    `partnerCompleteTask` + `partnershipId`, `completeTask`). Accessible name "Complete
    &lt;title&gt;". Native, not `wa-button`, because it is a round toggle-like control drawn by hand
    and a comment at the site says so (AGENTS.md: `wa-button` forwards no ARIA). Fills with a
    check while `ItemAction.celebrating`.
  - *clock* (dashed, not a button) — active but waiting; the row's meta says when.
  - *ring* — a task the viewer manages and the partner completes (`wa-progress-ring`, already
    registered): rolling-window tasks show progress through the window's quota, others show
    full when done for now, empty when ready.
- **Body button** (title + one meta line) opens the detail sheet. Title via `shownTitle(openedTask(...))`.
  Meta line pieces, each optional: partner name pill (home only), short schedule, availability
  ("Tomorrow 9am", "Sat 7pm"), quota ("1 left" / "1 of 3 this week"), "Jun's time" when the
  task's time zone differs (compact form of `TimeZoneDisplay`; the full note goes in the sheet).
- **Trailing credits** "+5", tabular figures; the existing rising "+N" burst moves here.
- Leaving rows slide out (keep the `out:` slide from `ManagedTaskList`).

New pure helpers in `src/lib/task-schedule.ts` (tested in `task-schedule.test.ts`):
- `shortTaskSchedule(schedule)` — "One-off", "Anytime", "3× a week", "2 days after",
  "Daily", "Every 2 weeks", "Mon, Wed", "Monthly"… (`describeTaskSchedule` stays for the sheet).
- `shortAvailability(nextEligibleAt, now, timeZone)` — "in 20 min", "Today 6pm", "Tomorrow 9am",
  weekday within 6 days, else a short date.
- `quotaLeft(schedule, windowCompletions)` — for rolling-window tasks with a limit.

### 2b. Grouping: `TaskChecklist.svelte`

Takes tasks and groups them into `ItemGroup`s: **Ready** (can complete now), **Later** (active, waiting, sorted by
`nextEligibleAt`), **Waiting on &lt;partner&gt;** / **Done for now** (managed tasks, partner page only),
and **Inactive** collapsed in a `wa-details` (count in its summary; `startOpen` not needed —
closed by default). Group headings are small uppercase `h3`s with counts. Empty group → omitted;
all empty → one quiet empty line.

### 2c. Pages

- **`/home/tasks`** (direction A): title bar = `NestedPageHeader` with the history link as an
  icon button (`wa-button appearance="plain" pill` + `wa-icon label="Completion history"`),
  then an "Add a task" quick-add row linking to `/home/tasks/add` (a link styled as a dashed row,
  not an inline creator — sealing needs the full editor), then one `TaskChecklist` of self tasks
  and every partner section's tasks merged, partner tasks tagged with `partnerName(section.names)`.
  The per-partner panels and "Open full task list" buttons go; the pill links nowhere, the sheet
  carries "Open Jun's task list". Inactive group shows self tasks only (partner sections load
  active tasks only, `server/tasks.ts:1104`, and an inactive partner task cannot be acted on).
- **`/partner/[id]/tasks`** (direction B): under shared control a `wa-tab-group` with "For you (n)"
  and "For &lt;partner&gt; (n)" (registered; `wa-tab` manages `aria-selected` itself), default
  "For you"; otherwise one list, no tabs. Add is a floating round amber button (only when
  `canManageTasks`) — positioned `sticky` at the bottom of `<main>`, not `fixed` (AGENTS.md: the
  shell's body does not scroll); the list gets bottom padding for it. History is the title-bar icon.
- The page-level `form.message` / `form.error` lines stay (refusals still need saying).

### 2d. Detail sheet: `TaskDetailDialog.svelte` on `ResponsiveDialog`

Opened from a row's body button; state is local (`let openTaskId = $state<string|null>()`), not in
the URL — the list is the page, and back-button-closes is a nice-to-have that NewMessageDialog
shows costs (docs/messaging.md "in the URL"). Contents:
- Title, description (`RichText`), full `describeTaskSchedule`, `TimeZoneDisplay` note, last
  completed (`lastCompletedAt`), quota "2 of 3 this week" as small filled squares, awards.
- Footer: amber **Complete · +5** (same form/action as the circle, so the deliberate path posts
  the same thing) when completable; **Edit** (outlined, link to the existing edit page) when
  `canEdit`; on home partner tasks "Open &lt;name&gt;'s task list".
- After a completion from the sheet the sheet closes, then the row celebrates.

### 2e. Server: window counts and undo

**Window counts.** Add `windowCompletions: number | null` to `SelfTaskView` and
`PartnershipTaskView` (`src/lib/types.ts`), filled in `src/lib/server/tasks.ts` for rolling-window
tasks with a limit with **one** query per scope (`inArray(taskId, ids)` + `createdAt >` the
earliest window start, then counted per task in JS using `addTaskDuration`), using the existing
`*_task_completions_task_idx`. Null otherwise.

**Undo (real, on the server).**
- Migration via `npm run db:generate -- --name add_task_completion_undo_state` (drizzle-kit,
  read the SQL; only `ALTER TABLE … ADD COLUMN`, no rebuild — checked by `migrations.test.ts`):
  on both completion tables add nullable `previous_active` (int bool), `previous_next_eligible_at`
  and `previous_last_completed_at` (`timestamp_ms`). Written by the complete functions in the same
  `db.batch`. Rows from before the migration have NULLs and are simply not undoable.
- `completeSelfTask` / `completePartnershipTask` generate the completion id up front and return
  it; the actions return `{ message: 'Task completed.', completionId }`.
- Credits switch to SQL arithmetic (`credits = credits + ?` in the upsert) — fixes the existing
  lost-update race and is what undo needs too.
- New `undoSelfTaskCompletion(db, viewerId, completionId)` and
  `undoPartnershipTaskCompletion(db, viewerId, partnershipId, completionId)`. Allowed only when:
  the viewer made it (owner / `completedByUserId`), it is the task's **latest** completion, it is
  under **10 minutes** old, its `previous_*` columns are set, and the balance still holds at least
  the award (else refuse: "Those credits have already been spent."). One `db.batch`: delete the
  completion row, restore the task's `active` / `next_eligible_at` / `last_completed_at`,
  `completed_count - 1`, `credits = credits - award`.
- Actions: `selfUndoCompletion` on `/home/tasks`, `partnerUndoCompletion` on `/home/tasks`,
  `undoCompletion` on `/partner/[id]/tasks`; each re-checks everything server side (invariant 14),
  answers `{ message: 'Completion undone.' }` or `fail(400/403, { error })`.
- Client: `ItemAction.enhance` gains an optional `onSuccess(data)` callback so the page can learn
  the `completionId`; then a `wa-toast` ("Completed · +5 — Undo"; `wa-toast` is registered, see
  `MessageToasts.svelte` for the existing pattern) for ~6 s. Undo posts with `tryFetch`-equivalent
  `enhance` (errors via `reportRequestFailure`, refusals inline in the toast).
- docs: `docs/tasks.md` gets an "Undoing a completion" section (the rules above and why: the
  previous state is stored rather than recomputed because a scheduled task's next occurrence
  cannot be rebuilt once its schedule is edited).

### 2f. Removals and history

- Delete `ManagedTaskList.svelte` (+ test) and `TaskListSection.svelte`.
- History pages: `TaskCompletionList` moves to `ItemRow`s grouped by day ("Today", "Yesterday",
  date), trailing "+N", meta = time and "by you"/"by Jun". No sheet (nothing to act on).

## Part 3 — Rewards: the same parts, arranged around the balance

### What is different about rewards (why not just copy tasks)
- A claim **spends** credits; nothing becomes available on a schedule. The question the page answers
  is "what can I afford, and how close am I to the rest?", not "what is due".
- Each reward is paid from **one specific balance** (your own, or yours within a partnership).
  A merged list like tasks' would hide which wallet a "8" comes out of.
- There is no stock, cooldown, approval or delivery step, and no undo (claims are a single
  `db.batch`; `server/rewards.ts`).

### The design
```
 Rewards                                 [history]
 ┌──────────────────────────────────────────────┐
 │ Yours                         12 credits  ✎  │   ← wallet header per balance
 ├──────────────────────────────────────────────┤
 │ Long bath                            [ 4 ]   │   ← affordable: amber cost pill
 │ A night off                          [ 10 ]  │
 │ New book                              18     │   ← not yet: quiet cost
 │ ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░  6 more                   │     + progress bar toward it
 │ ▸ Inactive · 2                               │
 ├──────────────────────────────────────────────┤
 │ From Jun                       4 credits     │
 │ Tea service                          [ 4 ]   │
 │ Breakfast in bed                      9      │
 │ ▓▓▓▓▓▓▓▓▓░░░░░░░░░  5 more                   │
 └──────────────────────────────────────────────┘
 ┌ + Add a reward ┐
```
- **Grouped by wallet, not by state.** `/home/rewards`: a group per balance — "Yours" then
  "From &lt;partner&gt;" — each headed by its balance (the existing `RewardCreditsInline`, editable
  where it is today). Within a group: affordable first (cost ascending), then not yet affordable
  (fewest credits to go first), then Inactive collapsed.
- **Row**: `ItemRow` with no leading control; trailing **cost pill** — amber when claimable,
  quiet text when not; under a not-yet-affordable row a thin `wa-progress-bar` of balance/cost and
  "6 more" (replaces the "N more credits to go" status line; the "Inactive right now." line
  becomes the Inactive group). The existing "just became affordable" glow moves to the pill.
- **Claiming is deliberate, through the sheet only.** Tapping the row or the pill opens a
  `RewardDetailDialog` on `ResponsiveDialog`: title, description, cost, "You'll have 8 left",
  footer **Claim · 4 credits** (same `?/selfClaimReward` / `partnerClaimReward` / `claimReward`
  forms and `ItemAction` celebration) and **Edit** when allowed. Spending is the one thing in the
  app worth a second tap, and it is why rewards need no undo; the sheet closes and the row
  celebrates (pill becomes a gift icon, balance ticks down).
- **`/partner/[id]/rewards`**: same as one wallet group. Under shared control, the same
  `wa-tab-group` as tasks: "For you" (your balance, rewards Jun set) / "For Jun" (Jun's balance,
  editable, rewards you set). Manage-only: one list of rewards you set, headed by Jun's editable
  balance; the progress bar then reads "Jun can afford this" / "Jun needs 5 more" — the managing
  side's version of the task ring. Add = the same floating button as tasks; history = icon.
- **Claim history** (`RewardClaimList`): `ItemRow`s grouped by day, trailing "−4".

Implementation: `RewardRow.svelte` and `RewardWallet.svelte` (group with balance header) over
`ItemRow`/`ItemGroup`; `RewardDetailDialog.svelte`. No server or schema changes:
`canClaim`, `cost`, `active`, `createdByMe` and the balances are already in the views
(`SelfRewardView`, `PartnershipRewardView`, `HomePartnerRewardsSectionView`). Delete
`RewardList.svelte` (+ test) and then `ItemCard.svelte` once nothing imports it. Inactive
partner rewards: check whether `listHomePartnerRewardSections` loads them; if not, partner groups
on home simply have no Inactive group (same rule as tasks).

## Part 4 — Tests, docs, housekeeping

**Tests** (add to the cheapest level that catches it):
- node: `task-schedule.test.ts` for `shortTaskSchedule`, `shortAvailability`, `quotaLeft`;
  grouping/sorting helpers for tasks and rewards as pure functions (`src/lib/tasks.ts`,
  `src/lib/credits.ts`) with tests; `server/tasks.test.ts` for window counts, the stored
  `previous_*` state, every undo rule (not yours, not latest, too old, pre-migration row, credits
  spent, restores one-off to active, restores scheduled `next_eligible_at`), and the SQL credit
  increment; route `page.server.test.ts` for the three undo actions and `completionId` in results.
- browser: `ResponsiveDialog`, `ItemRow`, `TaskRow` (three leading states, a11y names),
  `TaskChecklist` grouping, `RewardRow` (pill states, progress), rewrite of both tasks and both
  rewards `page.svelte.test.ts` (tabs only under shared control, no panels, add/history present
  per role), `ItemAction` `onSuccess` in `item-action.svelte.test.ts`.
- e2e: update `tasks.spec.ts`, `rewards.spec.ts`, `sealed-content.spec.ts`,
  `sealed-names.spec.ts`, `landing-screenshots.capture.ts` to the new markup (complete by the
  circle's name "Complete &lt;title&gt;", headings → row buttons, "Open full task list" gone, `.title-row`
  → the wallet header). New: complete then Undo restores credits and the row; complete from the
  sheet; claim through the sheet; at 1280 wide the dialog is centred and at 390×844 it is a
  bottom sheet (measure `::part(dialog)` as `messaging.spec.ts` does).

**Docs**:
- New `docs/dialogs.md` (ResponsiveDialog). `ItemRow`/`ItemGroup` go in `docs/theme.md` under a
  "Lists of items" section, since they are the app-wide look for a list.
- `docs/tasks.md`: rewrite "Route surface" prose and "The cards and the Complete button" as "The
  checklist, the sheet and undo"; fix line 41 ("recent self-task completions"); add undo section;
  document `windowCompletions`.
- `docs/rewards.md`: the wallet layout, claiming through the sheet, why no undo.
- AGENTS.md: doc table row for `docs/dialogs.md`; a Conventions line "A detail that opens over a
  list is `ResponsiveDialog`" next to the `wa-*` guidance.
- `roadmap.json`: `task-styling` → `shipped`, `shippedOn` the ship date, drop `featured` if set.
- Copy this plan verbatim to `docs/historical-plans/2026-10-22-tasks-todo-layout.md` (date =
  implementation date).
- Migration named via drizzle-kit `--name add_task_completion_undo_state`; read the SQL.

## Verification

1. `npm run check` (0/0), `npm run lint`, `npm test` (vitest node + browser, then Playwright).
2. `npm run test:e2e:worker` — undo uses `db.batch` and new columns on D1, so run it against the
   real Workers runtime too (AGENTS.md: changes touching the D1 path).
3. `npm run test:e2e:image` for the Node build.
4. Open the app (`/run` skill or `npm run dev`) at phone and desktop widths: `/home/tasks` with
   a partner, `/partner/[id]/tasks` under each control setting, `/home/rewards`,
   `/partner/[id]/rewards`; tick, undo, claim, and open the sheet (bottom sheet on a phone,
   centred dialog on desktop; a long description scrolls inside it with the footer still visible).
