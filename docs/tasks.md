# Tasks

Tasks are a second feature beside rewards and guides. They are user-managed,
credit-awarding pieces of work: completing a task adds reward credits instead
of spending them.

A task lives in a **space** ([spaces.md](spaces.md)): the viewer's own (solo)
space, where they set tasks for themselves, or a partnership's shared space,
where one member sets tasks for the other. Every task is in one table, `tasks`,
and every rule about it follows from two columns and the space's members: who
wrote it (`created_by_user_id`) and who it is for (`assignee_user_id`).

There used to be two tables per thing, `self_*` and `partnership_*`, on the
grounds that the permission rules differed too much between the two scopes for
one table. The rules turned out to be logic rather than storage — they were
already pure functions — and the split made every list that shows more than
one scope a hand-written union, and every operation a pair of near-identical
functions and actions. With a space on every row and the assignee a column,
there is one code path per operation, and "every space at once" (the Everyone
context, [contexts.md](contexts.md)) is one `space_id IN (…)` query.

## Edge tasks are unrelated

This feature is unrelated to the guide feature's ordered **edge tasks**.

- Guides still contain ordered edge tasks under `/home/guides/[id]`.
- User-managed tasks are the credit-awarding feature under `/tasks`.

The codebase keeps those names separate on purpose so the two concepts do
not silently collide in future work.

## Who does what

The rules are pure and node-tested, in `src/lib/spaces.ts` (what a member may
do in a space) and `src/lib/tasks.ts` (what that means for a task). They are
written in terms of members, not of "the partner", so nothing in them assumes
a space of two.

- **Setting a task** (`managesSpace`): any member whose `space_members`
  `can_manage` is set. In a solo space that is its owner; in a shared one it is
  whoever the partnership's control names, or both.
- **Who it is for** (`assigneeFor`) is decided by the server when the task is
  created, never posted: the creator themselves in a solo space, and in a
  shared one the other member. Nobody is ever assigned a task they wrote.
- **Completing** (`actsOn`, `canCompleteTask`): the task is assigned to the
  viewer, the viewer is on the side that acts in the space (`viewerActsIn`:
  in a shared space, someone *else* could have set it, which a member who
  manages alone is not), in a shared space they did not write it, and it is
  active and due.
- **Editing** (`managesRecord`): the viewer manages the space, and the task is
  set for someone else — or, in their own space, simply theirs. Nobody edits a
  task set for them. In a space of two this is "only its creator edits it".
  "Edit" covers the title, description, schedule, credits, active, and whose
  time it runs in.

### Authorship still matters under shared control

When both members of a partnership manage it, each sets tasks for the other,
and each completes the ones the other set. Ada may edit the tasks she set for
Jun but not complete them; Jun completes them and cannot edit them. Without
the authorship rule, shared control would let anyone mint their own credits
from their own task definitions — so it holds whatever `can_manage` says now.

If who manages changes later, the tasks stay stored, assignee and all, and a
list shows only the ones that still belong on the viewer's side
(`taskListFor` returns null for the rest). Changing it back shows them again.

## To do and set for others

`taskListFor` puts every task the viewer can see on one of two lists:

- **To do** — the ones they complete: in Me their own, in a partnership the
  ones set for them, in Everyone all of those.
- **Set for others** — the ones they set for someone else in a shared space
  they manage. Never in a solo space, so the list is hidden in Me, and hidden
  wherever else it is empty.

The two used to be split by place instead: `/home` showed only what you do,
and the partner page split its tasks into "For you" and "For them" tabs. With
one page that follows the context, the split is by what the viewer can do
about a task, which reads the same in every context.

## Credits

Credits are kept per member per space, in `reward_balances` (unique on
`space_id`, `user_id`): a wallet. Completing a task adds its award to the
assignee's balance **in the task's space**, and only that space's rewards
spend it. Balances are never pooled, because each is spent on different
rewards ([rewards.md](rewards.md#credits)).

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

In a solo space the owner is always the signed-in user; the server sets it
whatever the form says.

In a shared space the stored value points at one member of the space — the
viewer or their partner — and the server refuses anyone else.

That is why the table stores `timezone_owner_user_id` rather than a raw
timezone string. If that user later changes their account timezone, the task's
local time remains relative to that person's current timezone instead of being
frozen to the old offset.

### What the UI does

- A new task in a shared space defaults to the **partner's** timezone: they
  are the one doing it (`TaskEditorBody`).
- If both accounts currently share the same timezone, the timezone-owner toggle
  is hidden.
- If they differ, the form shows a small toggle between "Your time" and
  "Their time", and the partner option includes the current relative offset.
- Anywhere the app shows a task date that belongs to a different timezone than
  the viewer's current timezone, it says so ("Jun's time", `WhoseTime`).
- One-off tasks show no timezone note, because they have no task-local date or
  datetime to explain.

## What the server can see

A task's **content** — its title, description and completion messages — is
end-to-end encrypted. It is one sealed record (kind `task`, in
`src/lib/sealed-kinds/tasks.ts`) in the vault of the task's space
(`vaultIdForSpace` in `server/sealed-content.ts`): the owner's own vault in a
solo space, the partnership's in a shared one. See
[docs/encryption.md](encryption.md#sealed-records) for vaults and the record
format.

The server sees everything it acts on, and nothing else:

| Plaintext (the server needs it)                                   | Sealed                                |
| ----------------------------------------------------------------- | ------------------------------------- |
| `active`, `credits_awarded`, `schedule`, `timezone_owner_user_id` | `title`                               |
| `completion_message_count`                                        | `description` (rich text)             |
| its space, who wrote it, who it is for, timestamps, eligibility   | `completionMessages` (up to 20)       |
| `vault_id`, `payload_version`, `revision`                         |                                       |

**Completion messages are picked by index.** The server cannot read the
messages, so it is told how many there are (`completion_message_count`) and
picks a random index on completion; the device showing the completion reads
that entry out of the snapshot.

**What runs in the browser.** The checks on the content — a title of 1–80
characters, at most 20 completion messages, a description of at most 500
visible characters — run in the browser before sealing, and again on every
read (`taskKind` validates whatever comes out of a vault, so a malformed or
tampered record reads as "can't be shown" rather than as whatever it says).
The server checks only what it can: the ciphertext's shape and size, a known
`payload_version`, the vault belonging to the task's space, and every
permission, decided from the stored rows.

**Forms.** The editor (`SealedTaskEditor.svelte`, drawing `TaskForm.svelte`,
whose fields are the app's `InputField`, `SelectField` and `CheckboxField`)
is superforms as usual, but
its `onSubmit` validates, seals the three text fields, and posts the sealed
record (`recordId`, `vaultId`, `ciphertext`, `payloadVersion`,
`completionMessageCount`) in their place (`sealed-forms.ts`). A new task's id
is chosen by the browser, because the id is part of what the content is
sealed to. The action answers with a message rather than a superform, since
there are no text fields to send back.

**A tick in the description is a content-only write.** Ticking a to-do item
in a task's sheet re-seals the content and posts it alone to the list page's
`?/content`, under the same permission as an edit. Not the edit action, which
would work the schedule out again and make a task done today due again. See
[rich-text.md](rich-text.md#to-do-lists).

**Edits are compare-and-swap.** Every sealed write bumps `revision`, and an
edit names the revision it opened. If the other partner saved in between, the
edit is refused with "changed somewhere else" rather than overwriting their
change unseen — the server cannot merge what it cannot read.

**Reading** goes through `openedTask` / `openedCompletion` in
`src/lib/sealed-views.svelte.ts`: a placeholder while the vault opens, the
content once it has, and "can't be shown" for a record that will not open on
this device. Nothing is rendered on the server.

## Data model

Two tables, both in `schema/app.ts`:

- `tasks`
- `task_completions`

and the balances completions pay into, `reward_balances`
([rewards.md](rewards.md#data-model)).

Important fields on a task:

- `space_id` — `NOT NULL`, `ON DELETE CASCADE` from `spaces`
- `created_by_user_id`, and `assignee_user_id`, who completes it. Nullable
  only for a space with nobody else in it yet; `createTask` refuses to make one
  (`no-assignee`). One column rather than "the other member" so a space of
  more than two would need no new one.
- `ciphertext`, `vault_id`, `payload_version`, `revision` — the sealed
  content, all `NOT NULL`
- `completion_message_count`
- `active`, `credits_awarded`
- `schedule`
- `timezone_owner_user_id`
- `last_completed_at`
- `completed_count`
- `next_eligible_at`

Indexes cover the list reads (`space_id` with `active`, and with
`next_eligible_at`) and every user column.

The task views add one thing worked out at load: `windowCompletions`, how many
completions of a rolling-window task with a limit still count against it right
now, which the list turns into "1 left" (or "2 of 3" for whoever set it). It is
counted with one query per list on the completions' task index, from the
earliest instant any of the list's windows could reach back to
(`windowLowerBound`), and then exactly per task in its time zone owner's time
(`completionsInWindow`, the same test `nextEligibleAtAfterCompletion` uses).
Null for every other task.

Completion rows carry their own `space_id` and snapshot:

- the task's sealed record as it was when completed — a copy of its
  ciphertext, which still opens as a task (`snapshot_*` columns; it stays
  sealed to the task's id, `snapshot_record_id`)
- `completion_message_index`, which of the snapshot's messages was given
- the credit award amount
- who wrote the task, and who completed it
- the task's `active`, `next_eligible_at` and `last_completed_at` as they were
  just before (`previous_*`), so the completion can be undone exactly

The snapshot exists for the same reason as rewards history: visible history must
stay truthful even if the live task is edited later. Copying the ciphertext is
what lets the server take a snapshot it cannot read, and either partner's
completion can trigger it.

**Where the rows came from.** `drizzle/0051_add_merged_tasks_rewards.sql`
made the tables, `0052_copy_tasks_rewards_into_spaces.sql` copied every row
from the old `self_*` and `partnership_*` tables keeping its id — a sealed
record is bound to its kind, id and vault, none of which changed, so every
ciphertext still opens — with the owner as assignee of a solo row and the
member who did not write it of a shared one, and `0053` dropped the old
tables, children first (the reviewed exception in
`src/lib/server/db/migrations.test.ts`).

## Route surface

All under `src/routes/(auth-required)/(app)/tasks/`:

| Route              | What it shows                                                             |
| ------------------ | ------------------------------------------------------------------------- |
| `/tasks`           | The list for the current context: To do, then Set for others              |
| `/tasks/add`       | The list, with the form for a new task in a sheet over it; redirected to the list when the context has nowhere the viewer may set one |
| `/tasks/[taskId]`  | The list, with one task's edit form in a sheet, for a task the viewer may edit (403 otherwise, 404 outside their spaces) |
| `/tasks/history`   | The list, with the completion history of the context's spaces in a sheet |

The add, edit and history pages are sheets over the list with URLs of their
own (`RouteSheet`; see [docs/dialogs.md](dialogs.md#sheets-with-their-own-url)):
the list is the route's `+layout.svelte`, and a reload on `/tasks/add` shows
the list with the add form open over it. The forms themselves are
`TaskEditorBody`. History is reached by the clock icon beside the page title:
a line per completion under the day it happened, with the completion message
it gave.

**The list follows the context.** The layout's load reads the context's
spaces (`contextSpaceIds`), depends on `app:context` and on
`tasks:<spaceId>` for each (`tasksDependency`, which the home and partner
cards share), and the context switcher sits in the header's corner. At the top
of the page a Tasks | Rewards pair of links (`ItemsTabs`) moves between the two
pages, which read as one place since tasks are what pay for rewards. An edit
sheet takes its space from the task, so a link to one opens whatever the
context is ([contexts.md](contexts.md#items-carry-their-own-space)). The old
`/home/tasks` and `/partner/[id]/tasks` routes are gone, with no redirects.

**Actions** all live on `/tasks` and name what they act on — never the
context, which another tab can change:

| Action       | Posts                         | Does                                      |
| ------------ | ----------------------------- | ----------------------------------------- |
| `?/complete` | `taskId`                      | `completeTask`                            |
| `?/undo`     | `completionId`                | `undoTaskCompletion`                      |
| `?/content`  | a sealed record               | `updateTaskContent`: a tick in the description |
| `/tasks/add` | `spaceId` and a sealed record | `createTask`                              |
| `/tasks/[taskId]` | a sealed record          | `updateTask`                              |

**Adding** asks "For whom?" (`ForWhom`) first when the context shows more than
one space the viewer may set tasks in — in practice Everyone — listing Me and
each partner they manage with. The choice is remembered on the device
(`localStorage`, `bound-up:tasks-for-whom`) and posted as `spaceId`; the
server checks the viewer manages that space and picks the assignee itself.
Where there is only one such space the question is not asked.

### The checklist

The tasks page is a to-do list, not a stack of cards: a card per task, with
its whole description and two buttons, meant two tasks filled a phone screen.
The pieces are generic (`ItemRow`, `ItemGroup`, `ResponsiveDialog`; see
[docs/theme.md](theme.md#lists-of-items) and [docs/dialogs.md](dialogs.md)), and
the task-specific ones are `TaskChecklist`, `TaskRow` and `TaskDetailDialog`.
The wording rules are pure and node-tested: `src/lib/task-list.ts`,
`groupTasksToDo` / `groupTasksSet` in `src/lib/tasks.ts`, and
`shortTaskSchedule` / `shortAvailability` in `src/lib/task-schedule.ts`.

Each of the page's two lists is grouped by what can be done about each task:

| Mode    | Groups                                                     | At the start of a row |
| ------- | ---------------------------------------------------------- | --------------------- |
| `to-do` | Ready, Later (soonest first), Inactive                     | a circle to tick when it can be done; a dashed clock when it is not due yet |
| `set`   | one unheaded list (still to do, then done for now), Inactive | nothing, and no column for it: the viewer cannot complete these, and a ring there was a control-shaped thing that did nothing |

The `set` list has no group heading of its own: the "Set for others" heading
already says whose these are. Inactive is a closed `wa-details` in both,
there for whoever looks. A row that is not due yet (or, on the side that set
it, done for now) has its title and award greyed: it cannot be completed
before then (the server refuses), so it should not look like one that can.

Each row is the title and one quiet line, with the award ("+2") at the end.
The line, in the order shown, as the design proposal had it:

- whose space it is in, in Everyone only: the `SpaceChip` every Everyone list
  puts on its rows ([contexts.md](contexts.md)), in that space's colour;
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
of `CreditPill`s labelled by a coins icon at its start, built by
`balancePills` in `src/lib/item-pages.svelte.ts`), kept apart rather than
added up because they are spent on different rewards: the viewer's own where
they complete tasks ("Yours", or "With Jun" beside other spaces' in
Everyone), and each partner's they set tasks for, with their picture. They are
read-only here; they are set on the rewards page.

Adding a task is a dashed "Add a task" row (`QuickAddLink`) over the lists,
shown when the context has somewhere the viewer may set one.

Tapping a task opens its detail (`TaskDetailDialog`), and the row stays lit
behind it so it is plain which one is open. The detail has the description,
then: whose it is ("From" Jun on the to-do side, "For" Jun on the side that set
it), "Repeats" (the whole schedule: "Anytime, up to 3 times a week"), the quota
as squares ("This week"), when it is due again, when it was last done, whose
time it runs in, and the award. In its footer **Complete** comes first and
widest, then Edit where the viewer may edit it. That Complete submits the
row's own form (`requestSubmit`), so both ways of completing post the same
thing and celebrate the same way.

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
while. `?/complete` answers with the new completion's id and the task's, and
the task's own line becomes `TaskUndoRow` — "Completed · +2" and an Undo —
for ten seconds, longer while it is hovered or focused, and then the task shows
wherever the reload put it. The line goes where the circle was tapped, not
where the task now belongs: `TaskChecklist` notes the task's group and place as
the completion is posted (`ItemAction.pending`), because by the time the answer
arrives a one-off has moved to Inactive, or off the list altogether. A
toast at the bottom of the page came before it, and was a long way from the
tap it was about. Undo posts to `?/undo`, which calls `undoTaskCompletion`
and answers `{ undone: true }` with no message: the task coming back in its
place says it.

The server allows it only when every one of these holds, and says which did
not (`UNDO_REFUSALS`):

- the viewer made the completion, and the task is still on their to-do list
  (`taskListFor`): it is their credits that come back out;
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
`completed_count`, and subtracts the award from the viewer's balance in the
task's space. The previous state is stored on the completion rather than
recomputed because a scheduled task's next occurrence cannot be rebuilt once
its schedule has been edited, and a one-off's `active` is gone the moment it
completes. Completing and undoing both change the balance in SQL
(`credits + n`, `credits - n`) rather than reading it and writing it back,
which used to lose an award when two completions landed at once.

The task form's save button follows the app's convention: outlined until the
form holds a valid change, then solid amber.
