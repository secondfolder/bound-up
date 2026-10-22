# Tasks

Tasks are a second feature beside rewards and guides. They are user-managed,
credit-awarding pieces of work: completing a task adds reward credits instead
of spending them.

The feature has two scopes, deliberately mirroring rewards:

- **Self tasks** live on `/home/tasks` and belong to one user.
- **Partnership tasks** live on `/partner/[id]/tasks` and belong to one accepted
  partnership.

The split is deliberate. The permission rules are different enough between the
two scopes that one polymorphic table would push every read and write through a
nullable scope branch.

## Edge tasks are unrelated

This feature is unrelated to the guide feature's ordered **edge tasks**.

- Guides still contain ordered edge tasks under `/home/guides/[id]`.
- User-managed tasks are the new credit-awarding feature under `/home/tasks`
  and `/partner/[id]/tasks`.

The codebase now keeps those names separate on purpose so the two concepts do
not silently collide in future work.

## Self tasks

Self tasks are fully self-managed.

- The owner creates, edits, and completes them.
- Completing one awards credits into the owner's existing `self_reward_credits`
  balance.
- A one-off task deactivates itself after completion.
- Repeatable tasks advance their own `next_eligible_at` instead.

The home tasks page shows one to-do list: the owner's self tasks and every
partner task they may complete, each partner's marked with that partner's name
(see "The checklist" below).

## Partnership tasks

Partnership tasks reuse the existing partnership `control` setting, but with a
different split from rewards.

| Current control value | Who may manage tasks | Who may complete tasks |
| --------------------- | -------------------- | ---------------------- |
| `inviter`             | inviter only         | invitee only           |
| `invitee`             | invitee only         | inviter only           |
| `both`                | both members         | both members           |

"Manage" means create tasks, toggle the tasks you created active or inactive,
edit the tasks you created, and choose whose timezone a scheduled task is
relative to.

"Complete" means mark a currently eligible task done and receive its credit
award into your own `partnership_reward_credits` balance for that partnership.

### Authorship still matters under shared control

Shared control does **not** mean someone may complete a task they created, and
it does not let them edit the tasks their partner created.

- If Ada creates a partnership task, Ada may edit it under shared control.
- Ada may not complete that same task.
- Jun may complete it when it is eligible.
- Jun may edit only the partnership tasks Jun created.

If control later changes, old partnership tasks stay in the database but the
tasks page only shows the ones that still belong on the viewer's current side:

- the managing side sees only the tasks they created for their partner
- the completing side sees only the tasks their partner created for them
- shared control shows both again

That rule is independent of later control changes for the same reason as the
reward authorship rule: without it, shared control would let someone mint their
own credits from their own task definitions.

## Scheduling modes

Tasks use one structured schedule object rather than separate table shapes.

Supported modes today are:

- `one-off`
- `rolling-window`
- `after-completion`
- `scheduled`

### One-off

One completion total. The task deactivates after completion.

### Rolling window

The task is completable immediately and either:

- remains always available, or
- becomes temporarily unavailable once it reaches a limit like "3 times per
  week"

`next_eligible_at` stores when the oldest completion still blocking that window
falls out.

### After completion

The next completion becomes available only after a delay relative to the last
completion, such as "2 days after completion".

### Scheduled

The task repeats on a fixed calendar pattern. Supported patterns are:

- every `N` days
- every `N` weeks on selected weekdays
- every `N` months on either a day-of-month or an nth weekday
- every `N` years

End conditions are:

- never
- until a local end datetime
- after `N` occurrences

The app does **not** expose raw RRULE editing, exclusion dates, holiday-aware
calendars, or per-occurrence edits in this first version.

## Timezone ownership

Task dates are not stored as "this happened at 14:00 UTC and therefore means
that forever". They are stored as **local wall-clock values** plus a stable
reference to whose timezone that wall-clock value belongs to.

For self tasks, the owner is always the signed-in user.

For partnership tasks, the stored value points at one specific user in the
partnership:

- the current viewer, or
- their partner

That is why the task tables store `timezone_owner_user_id` rather than a raw
timezone string. If that user later changes their account timezone, the task's
local time remains relative to that person's current timezone instead of being
frozen to the old offset.

### What the UI does

- Partner-task date and datetime fields default to the **other partner's**
  timezone on create.
- If both accounts currently share the same timezone, the timezone-owner toggle
  is hidden.
- If they differ, the form shows a small toggle between "Your time" and
  "Their time", and the partner option includes the current relative offset.
- Anywhere the app shows a task date that belongs to a different timezone than
  the viewer's current timezone, it renders the same compact timezone note
  style used on the partner page.
- One-off tasks show no timezone note, because they have no task-local date or
  datetime to explain.

## What the server can see

A task's **content** — its title, description and completion messages — is
end-to-end encrypted. It is one sealed record (kind `task`, in
`src/lib/sealed-kinds/tasks.ts`) in the scope's vault: the owner's own vault
for a self task, the partnership's for a partnership task. See
[docs/encryption.md](encryption.md#sealed-records) for vaults and the record
format.

The server sees everything it acts on, and nothing else:

| Plaintext (the server needs it)                                   | Sealed                                |
| ----------------------------------------------------------------- | ------------------------------------- |
| `active`, `credits_awarded`, `schedule`, `timezone_owner_user_id` | `title`                               |
| `completion_message_count`                                        | `description` (rich text)             |
| who created it, timestamps, eligibility                           | `completionMessages` (up to 20)       |
| `vault_id`, `payload_version`, `revision`                         |                                       |

**Completion messages are picked by index.** The server cannot read the
messages, so it is told how many there are (`completion_message_count`) and
picks a random index on completion; the device showing the completion reads
that entry out of the snapshot.

**What moved into the browser.** The checks on the content — a title of 1–80
characters, at most 20 completion messages, a description of at most 500
visible characters — run in the browser before sealing, and again on every
read (`taskKind` validates whatever comes out of a vault, so a malformed or
tampered record reads as "can't be shown" rather than as whatever it says).
The server checks only what it can: the ciphertext's shape and size, a known
`payload_version`, the vault belonging to the task's scope, and every
permission. Permissions never moved: who may create, edit or complete a task
is decided from the stored rows exactly as before.

**Forms.** The editor (`SealedTaskEditor.svelte`, drawing `TaskForm.svelte`,
whose fields are the app's `InputField`, `SelectField` and `CheckboxField`)
is superforms as usual, but
its `onSubmit` validates, seals the three text fields, and posts the sealed
record (`recordId`, `vaultId`, `ciphertext`, `payloadVersion`,
`completionMessageCount`) in their place (`sealed-forms.ts`). A new task's id
is chosen by the browser, because the id is part of what the content is
sealed to. The action answers with a message rather than a superform, since
there are no text fields to send back.

**Edits are compare-and-swap.** Every sealed write bumps `revision`, and an
edit names the revision it opened. If the other partner saved in between, the
edit is refused with "changed somewhere else" rather than overwriting their
change unseen — the server cannot merge what it cannot read.

**Reading** goes through `openedTask` / `openedCompletion` in
`src/lib/sealed-views.svelte.ts`: a placeholder while the vault opens, the
content once it has, and "can't be shown" for a record that will not open on
this device. Nothing is rendered on the server.

## Data model

The current schema uses four task tables:

- `self_tasks`
- `self_task_completions`
- `partnership_tasks`
- `partnership_task_completions`

Important fields on the live task rows:

- `ciphertext`, `vault_id`, `payload_version`, `revision` — the sealed content
- `completion_message_count`
- `active`, `credits_awarded`
- `schedule`
- `timezone_owner_user_id`
- `last_completed_at`
- `completed_count`
- `next_eligible_at`
- `title`, `description`, `completion_messages` — plaintext, filled only on
  rows written before sealing and emptied when a device seals them (see
  [docs/temporary-code.md](temporary-code.md#tasks-and-rewards-in-plaintext))

The task views add one thing worked out at load: `windowCompletions`, how many
completions of a rolling-window task with a limit still count against it right
now, which the list turns into "1 left" (or "2 of 3" for whoever set it). It is
counted with one query per list on the completions' task index, from the
earliest instant any of the list's windows could reach back to
(`windowLowerBound`), and then exactly per task in its time zone owner's time
(`completionsInWindow`, the same test `nextEligibleAtAfterCompletion` uses).
Null for every other task.

Completion rows snapshot:

- the task's sealed record as it was when completed — a copy of its
  ciphertext, which still opens as a task (`snapshot_*` columns; it stays
  sealed to the task's id, `snapshot_record_id`)
- `completion_message_index`, which of the snapshot's messages was given
- the credit award amount
- who created the task for partnership rows
- who completed it for partnership rows
- the task's `active`, `next_eligible_at` and `last_completed_at` as they were
  just before (`previous_*`), so the completion can be undone exactly

The snapshot exists for the same reason as rewards history: visible history must
stay truthful even if the live task is edited later. Copying the ciphertext is
what lets the server take a snapshot it cannot read, and either partner's
completion can trigger it.

## Route surface

| Route                          | What it shows                                                  |
| ------------------------------ | -------------------------------------------------------------- |
| `/home/tasks`                  | One to-do list: self tasks and the partner tasks the viewer completes |
| `/home/tasks/add`              | The list, with the form for a new self task in a sheet over it (titled "Add a task": "self" is not a word users see) |
| `/home/tasks/[taskId]`         | The list, with one self task's edit form in a sheet            |
| `/home/tasks/history`          | The list, with the self task completion history in a sheet     |
| `/partner/[id]/tasks`          | Partnership tasks; a tab each for "For them" and "For you" under shared control |
| `/partner/[id]/tasks/history`  | The list, with the partnership's completion history in a sheet |
| `/partner/[id]/tasks/add`      | The list, with the form for a new partnership task in a sheet, when this side controls tasks; the other side is redirected to the list (a direct post is still a 403) |
| `/partner/[id]/tasks/[taskId]` | The list, with one partnership task's edit form in a sheet, when this side controls tasks |

The add, edit and history pages are sheets over the list with URLs of their
own (`RouteSheet`; see [docs/dialogs.md](dialogs.md#sheets-with-their-own-url)):
the list is each route's `+layout.svelte`, and a reload on `/home/tasks/add`
shows the list with the add form open over it. The forms themselves are
`TaskEditorBody`. History is reached by the clock icon beside the page title:
a line per completion under the day it happened, with the completion message
it gave.

### The checklist

The tasks pages are a to-do list, not a stack of cards: a card per task, with
its whole description and two buttons, meant two tasks filled a phone screen.
The pieces are generic (`ItemRow`, `ItemGroup`, `ResponsiveDialog`; see
[docs/theme.md](theme.md#lists-of-items) and [docs/dialogs.md](dialogs.md)), and
the task-specific ones are `TaskChecklist`, `TaskRow` and `TaskDetailDialog`.
The wording rules are pure and node-tested: `src/lib/task-list.ts`,
`groupTasksToDo` / `groupTasksSet` in `src/lib/tasks.ts`, and
`shortTaskSchedule` / `shortAvailability` in `src/lib/task-schedule.ts`.

A list is either the viewer's to do, or tasks they set for their partner, and
is grouped by what can be done about each:

| Mode    | Groups                                                     | At the start of a row |
| ------- | ---------------------------------------------------------- | --------------------- |
| `to-do` | Ready, Later (soonest first), Inactive                     | a circle to tick when it can be done; a dashed clock when it is not due yet |
| `set`   | one unheaded list (still to do, then done for now), Inactive | nothing, and no column for it: the viewer cannot complete these, and a ring there was a control-shaped thing that did nothing |

The `set` list has no heading of its own: the page's "For them" tab, or the
page itself, already says whose these are. Inactive is a closed `wa-details`
in both, there for whoever looks. A row that is not due yet (or, on the side
that set it, done for now) has its title and award greyed: it cannot be
completed before then (the server refuses), so it should not look like one
that can.

Each row is the title and one quiet line, with the award ("+2") at the end.
The line, in the order shown, as the design proposal had it:

- whose it is, on `/home/tasks` only: the partner's picture (`wa-avatar`,
  named for a screen reader), which says it in a quarter of the room a name
  took;
- when it is due again, with a clock: "Tomorrow 9am", or on the side that set
  it "Again tomorrow 9am";
- the schedule, with a repeat icon for "Repeat anytime" and "After
  completion" and a calendar for "On a schedule": "3× a week · 1 left" to
  whoever does it, "1 of 3 this week" to whoever set it;
- "Jun's time", when the task runs in the partner's time zone and that is not
  the viewer's (`WhoseTime`: a button whose tooltip, on hover or tap, gives
  the zone, the time for each of them and how far apart they are).

Times are informal ("9am", "Tomorrow 6:30pm") through `src/lib/informal-time.ts`,
which is built on `Intl.DateTimeFormat#formatToParts` and
`Intl.RelativeTimeFormat`, so a 24-hour locale keeps its own form and "today"
and "tomorrow" are in the reader's language.

Above the list are the balances the tasks pay into (`CreditBalances`, a row
of `CreditPill`s labelled by a coins icon at its start), kept
apart rather than added up because they are spent on different rewards. On
`/home/tasks`: "Yours", then "With Jun" for each partner, with their picture.
On the partner page: the viewer's own when they complete tasks there, and the
partner's when they set them.

`/home/tasks` merges the viewer's own tasks with every partner's into the one
`to-do` list; there used to be a panel per partner, each with buttons of its
own. `/partner/[id]/tasks` is one list for one-sided control (`to-do` for the
completing side, `set` for the managing side), and under shared control a
pill-shaped segmented control (`SegmentedTabs`) with "For them" first and shown
first, since setting tasks is what a side in control comes for, then "For you"
and a count on each, which used to be two stacked panels. Adding a task is a
dashed "Add a task" row on `/home/tasks` and the round amber button over the
bottom of the partner page (`ListDock`, sticky rather than fixed, because the
app shell's window does not scroll).

Tapping a task opens its detail (`TaskDetailDialog`), and the row stays lit
behind it so it is plain which one is open. The detail has the description,
then: whose it is, "Repeats" (the whole schedule: "Anytime, up to 3 times a
week"), the quota as squares ("This week"), when it is due again, when it was
last done, whose time it runs in, and the award. In its footer **Complete**
comes first and widest, then Edit, then the partner's whole task list (from
`/home/tasks`). That Complete submits the row's own form (`requestSubmit`), so
both ways of completing post the same thing and celebrate the same way.

### The task form

Each repeat mode says what it means right under the mode dropdown, including
where its period is counted from, because the three repeating modes count from
different points: "Repeat anytime" with a limit rolls (each completion counts
for that long after it is marked complete), "After completion" counts from the
last completion, and "On a schedule" is a fixed calendar from the start time.
Each "Every" box is labelled for its unit ("Repeat after this many days") and
its placeholder follows the unit chosen beside it ("Number of days").

### Completing

The circle is a native `<button>` in an enhanced form (`ItemAction` in
`src/lib/item-action.svelte.ts`), named "Complete <title>" so a list of them is
not a list of buttons all called "Complete". On success the circle fills with a
check, the award rises off the credits, and the page's loads re-run
`CELEBRATION_MS` later; a row the refreshed list puts in another group moves
there. With reduced motion there is no wait and no motion. A refusal still
shows the action's own error at the top of the page; an `error` result goes to
the app-wide notice (docs/request-failures.md).

### Undoing a completion

A circle is far easier to tap by mistake than the button it replaced, and a
completion pays out credits, so every completion can be taken back for a
while. The complete actions answer with the new completion's id and the task's,
and the task's own line becomes `TaskUndoRow` — "Completed · +2" and an Undo —
for ten seconds, longer while it is hovered or focused, and then the task shows
wherever the reload put it. The line goes where the circle was tapped, not
where the task now belongs: `TaskChecklist` notes the task's group and place as
the completion is posted (`ItemAction.pending`), because by the time the answer
arrives a one-off has moved to Inactive, or off `/home/tasks` altogether. A
toast at the bottom of the page came before it, and was a long way from the
tap it was about. Undo posts to `selfUndoCompletion` / `partnerUndoCompletion`
on `/home/tasks` or `undoCompletion` on the partner page, which call
`undoSelfTaskCompletion` / `undoPartnershipTaskCompletion`, and answer
`{ undone: true }` with no message: the task coming back in its place says it.

The server allows it only when every one of these holds, and says which did
not (`UNDO_REFUSALS`):

- the viewer made the completion (and, for a partnership task, is still on the
  completing side): it is their credits that come back out;
- it is the task's newest completion, so the state it restores is the current
  one;
- it is under `UNDO_WINDOW_MS` (ten minutes) old: long enough to notice a
  mis-tap, short enough that nobody has planned around the task being done;
- it recorded the task's previous state (`previous_active` is set — completions
  from before undo existed did not);
- the balance still holds the award: credits already spent on a reward are not
  clawed back.

One `db.batch` then deletes the completion, puts the task's `active`,
`next_eligible_at` and `last_completed_at` back as recorded, takes one off
`completed_count`, and subtracts the award. The previous state is stored on the
completion rather than recomputed because a scheduled task's next occurrence
cannot be rebuilt once its schedule has been edited, and a one-off's `active` is
gone the moment it completes. Completing and undoing both change the balance in
SQL (`credits + n`, `credits - n`) rather than reading it and writing it back,
which used to lose an award when two completions landed at once.

The task form's save button follows the app's convention: outlined until the
form holds a valid change, then solid amber.
