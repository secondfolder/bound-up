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

The home tasks page shows:

- the owner's current self tasks
- recent self-task completions
- one section per partner containing partner tasks the viewer may complete

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

Completion rows snapshot:

- the task's sealed record as it was when completed — a copy of its
  ciphertext, which still opens as a task (`snapshot_*` columns; it stays
  sealed to the task's id, `snapshot_record_id`)
- `completion_message_index`, which of the snapshot's messages was given
- the credit award amount
- who created the task for partnership rows
- who completed it for partnership rows

The snapshot exists for the same reason as rewards history: visible history must
stay truthful even if the live task is edited later. Copying the ciphertext is
what lets the server take a snapshot it cannot read, and either partner's
completion can trigger it.

## Route surface

| Route                          | What it shows                                                  |
| ------------------------------ | -------------------------------------------------------------- |
| `/home/tasks`                  | Self tasks plus one summary section per partner when any exist |
| `/home/tasks/add`              | Create a self task (titled "Add a task": "self" is not a word users see) |
| `/home/tasks/[taskId]`         | Edit one self task                                             |
| `/home/tasks/history`          | Self task completion history                                   |
| `/partner/[id]/tasks`          | Partnership tasks, split by assignee under shared control      |
| `/partner/[id]/tasks/history`  | Partnership task completion history                            |
| `/partner/[id]/tasks/add`      | Create a partnership task when this side controls tasks; the other side is redirected to the list (a direct post is still a 403) |
| `/partner/[id]/tasks/[taskId]` | Edit one partnership task when this side controls tasks        |

The home tasks page now uses the same section pattern as the partner page:
self tasks always exist, partner sections appear only when there are incoming
partner tasks to show, and a single section renders directly on the page rather
than inside a panel. A page with a single list gives it no section heading of
its own either, because the page title already names it. Completion history
lives on dedicated routes for both self tasks and partnership tasks, as a list
straight on the page with an empty state when there is nothing yet.

### The cards and the Complete button

Every task — and every reward, and every history entry — is an `ItemCard`
(`src/lib/components/ItemCard.svelte`): the title and its quiet meta lines
(schedule, time zone note) on the left; the credits and the actions in a column
on the right, which drops under the text as a row when the card itself is
narrow (a container query, since the same card sits in panels of different
widths). The credits always sit in that column, even on a card with no button.
Sections are `SectionPanel`s: title and anything that qualifies it (a balance)
on the left, buttons on the right — history first, "Add" last — in equal
columns under the title when narrow.

Complete is the one amber (`accent`, `brand`) button on a card, and only appears
when the task can be completed. Its form is enhanced (`ItemAction` in
`src/lib/item-action.svelte.ts`) rather than posting natively, so the card can
celebrate: on success the button becomes a check, the award rises off the
credits, and the border flashes amber; the page's loads re-run
`CELEBRATION_MS` later, and a card that the refreshed list no longer has slides
shut. With reduced motion there is no wait and no motion. A refusal still shows
the action's own error at the top of the page; an `error` result goes to the
app-wide notice (docs/request-failures.md).

The task form's save button follows the app's convention: outlined until the
form holds a valid change, then solid amber.
