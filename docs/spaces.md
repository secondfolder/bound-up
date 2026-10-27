# Spaces

A **space** is where scoped data lives. Every account has one **solo** space,
its own, and every partnership is one **shared** space. Who may read and write
a space is who its members are, and whether a member may manage it is a flag
on their membership.

Users never see the word. "Partnership" and "partner" stay the words in copy,
routes and emails; code and the database talk about spaces and members. The
point of the model is that a group of more than two people later needs no
database or low-level rework: nothing in `spaces` or `space_members` assumes
two.

Tasks and rewards are built on spaces outright: their tables are keyed by
`space_id` and their rules are written in members ([tasks.md](tasks.md),
[rewards.md](rewards.md)). For the other features spaces are, for now,
plumbing underneath: they still read their rows by their own columns
(`owner_id`, `partnership_id`) and write `space_id` beside them.

## The tables

| Table           | What                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------ |
| `spaces`        | `id`, `kind` (`solo` or `shared`), timestamps. Nothing about a space is content.            |
| `space_members` | `space_id`, `user_id`, `can_manage`, `colour`. Unique on the pair, indexed on `user_id`.    |

These carry a nullable `space_id`, added beside their old scope columns:

| Table                                                     | Its space                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `vaults`                                                  | The space whose key it is                                                      |
| `notebook_entries`, `kink_lists`                          | The owner's solo space, or the partnership's                                   |
| `message_threads`, `message_tags`, `history_restore_requests` | The partnership's                                                          |
| `vault_escrows`                                           | The partnership the escrow is held in — not the space of the vault it holds   |
| `daydreams`, `daydream_characters`, `daydream_scenes`     | The owner's solo space; see below                                              |

Tasks, rewards, their completions, claims and balances (`tasks`,
`task_completions`, `rewards`, `reward_claims`, `reward_balances`) were created
with a `space_id` that is `NOT NULL` and a real `ON DELETE CASCADE` from
`spaces`, and have no other scope column. They replaced ten tables kept per
scope, `self_*` and `partnership_*`, whose rows were copied in keeping their
ids (`drizzle/0052_copy_tasks_rewards_into_spaces.sql`; a solo row into its
owner's solo space, a partnership row into the shared space with the same id).

Account-level data stays on the account: IQ test results, scene preferences,
settings, features.

## Ids are the partnership's

**A partnership's shared space has the partnership's own id.** So every
`partnership_id` already stored is the id of its space, the backfill
(`drizzle/0049_backfill_spaces.sql`) is a copy, and a new scoped row in a
partnership sets `space_id` to the `partnership_id` it already has.

A partnership id is chosen by the inviter's browser, because the invite is
sealed to it. `createInvite` therefore inserts the space first, with no
`ON CONFLICT`, in the same batch as the partnership: an id already used by any
space — someone's solo space, say — fails the whole batch and comes back as
`id-taken`, rather than making the inviter a member of a space that is not
theirs.

**Solo spaces have ids of their own**, v4 UUIDs. Every account gets one from
the `user_has_solo_space` trigger (in the same migration), a trigger rather
than a Better Auth hook for the reason the first-account admin is one: it
holds however the row is inserted — sign-up, the test fixtures, the e2e
suite's accounts, a raw `wrangler d1 execute`. `soloSpaceFor(db, userId)`
finds it, and `soloSpaceIdOf(userId)` is the same lookup as a subquery, so a
write can take the id without a read first.

## Membership and `can_manage`

A solo space has one member, who manages it. A shared space's members are the
partnership's inviter from the moment of inviting, and its invitee once they
accept. `requireSpaceMember(db, spaceId, userId)` answers whether someone is
in a space and whether they manage it; `listSpacesForUser` lists them, solo
first. A pending invite's space is listed too, since its inviter is a member,
so anything that wants linked partnerships only still checks the
partnership's status.

**`can_manage` is what the permission rules follow.** The partnership's
`control` (`inviter`, `invitee`, `both`) was a statement about two roles;
`can_manage` says the same per member, and `both` is simply two members who
manage. The task and reward rules read `can_manage` directly
(`managesSpace`, `viewerActsIn` and the rest in `src/lib/spaces.ts`). Every
read of `control` goes through `partnershipControl()` in `server/spaces.ts`,
which works it out from the members, so the rules still written in terms of
`control` (`canEditPartnership`, the notebook's access rules, the kink list's
starting side) are following `can_manage` too.

`control` is still written, through one helper: `syncSharedSpaceMembers`
batches after every write of the partnership's invitee or control, adds the
invitee once there is one, and sets every member's `can_manage` from
`control`. It reads the partnership row inside its statements rather than
taking values, so a write that matched nothing — an accept that lost a race —
leaves the members as they were. Keeping the column is temporary; see
[temporary-code.md](temporary-code.md#partnership-control-beside-can_manage).

A **pending invite** has one member, so what it offers the invitee can only be
read from the row: `partnershipControl()` returns the column itself until the
partnership is accepted. That is invite detail, and invites are pair-shaped
(below).

A member's **`colour`** is how that space looks to *them* in the context
switcher and on an Everyone list: their own choice from a closed list, or null
for one assigned by order. It is never shown to the other members. See
[contexts.md](contexts.md#colours).

Membership checks delegate to the space: "is this user in the partnership"
is `isSpaceMember(partnerships.id, userId)` everywhere it is asked
(`getPartnershipForUser` and every partnership list, notebook access, kink
list sharing, messaging, escrow, recovery's partner lookup), each still
requiring the partnership to be accepted where it did before. It is written
as `partnerships.id IN (select space_id from space_members where user_id = ?)`
so SQLite reads the user's few memberships by index and looks the
partnerships up by key.

## Deleting a space

Ending a partnership and deleting an account delete the space and everything
in it, explicitly, in one `db.batch()` (`deleteSpaceStatements`). Nothing can
be left to cascades:

- Most `space_id` columns were added to tables that already existed, and a
  column added by `ALTER TABLE … REFERENCES` gets no `ON DELETE` (the trap in
  AGENTS.md), so they do not cascade from `spaces`. Only the tasks and rewards
  tables, created with theirs, do.
- **Not everything sealed under a vault cascades from it either.** Only the
  tables created with their `vault_id` do (notebook, kink lists, daydreams,
  tasks and rewards). Messages, reactions and tags had theirs added later, so
  their key is NO ACTION and a vault cannot be deleted while any of them name
  it.

So `deleteSpaceStatements` deletes, in order: every row carrying the space's
id — tasks and rewards included, children first, even though the space's own
deletion would cascade to them, so the list says everything a space holds
rather than leaning on which tables happen to cascade; the rows sealed under
its vaults whose key would refuse the vault's deletion; the partnership row,
for a shared space; the vaults; the members; the space.
`src/lib/server/spaces.test.ts` fills every table with a `space_id` — found
from the Drizzle schema, so a new one is included without anyone listing it —
ends a partnership and deletes an account, and fails if any row is left.

- **Ending a partnership** is `deletePartnership`: a membership check, then
  `deleteSpace`. The route then purges the partnership's media, which nothing
  in the database reaches.
- **Deleting an account** deletes every space its holder is in — their solo
  space, and every shared space, which ends those partnerships as the old
  cascades from `user` did. The app's own deletion (a sign-up whose keys could
  not be stored) is `deleteAccount`; Better Auth's (the admin plugin's
  remove-user) reaches the same statements through the `user.delete.before`
  database hook in `auth.ts`. Neither purges a shared space's media yet.

## The vault is not the space

Each space has one vault today, and `vaults.space_id` says which. They stay two
things on purpose. A vault's id is chosen by the browser and bound into every
ciphertext sealed under it; a space that ever loses a member will need a new
key — a new vault — while staying the same space. The tables keep their names
(`vaults`, `vault_wraps`, `vault_escrows`) and their old scope columns
(`kind`, `owner_user_id`, `partnership_id`) along with the CHECK that ties
them to `kind`, which cannot change without rebuilding the table.

## Daydreams are solo, for now

Daydreams, their characters and ideas are in their owner's solo space and
sealed in its vault. Daydreams for a partnership may come later: they would be
daydreams in a shared space, sealed under that space's vault, with no schema
change.

## Still pair-shaped

These stay shaped for two until groups are designed, because each needs
product decisions rather than plumbing:

- **Invites.** The token, the invite key and the offered control stay on the
  partnership row, which is the shared space's detail record. An invite for
  more people would be a table of its own.
- **Sealed names.** Stored per role ("what they call you", "their name") and
  mapped only by `namesForViewer` (AGENTS.md invariant 12). Groups need
  per-member display names, which is a design question, not a column.
- **Partner-assisted sign-in.** Escrow and approval trust a *person*: one
  escrow per partnership, one restore request per partnership.
- **Who a new task or reward is for.** `assigneeFor` picks "the first other
  member" of a shared space, which in a space of two is the partner. The
  column, `assignee_user_id`, is already one per row, so a group needs a
  choice in the add form rather than a schema change; the rules themselves
  (`actsOn`, `managesRecord`, `canSetBalance`) are already written in members.

## The hard part, deferred

Today ending a partnership deletes the shared space and everything in it. In a
group, the others keep the space when one person leaves, so the leaver's copy
of the key must stop opening anything new: a new vault, wrapped for the
remaining members, and either everything re-sealed or an acceptance that the
leaver could read what existed before they left. This is why the vault stays
separate from the space, and it does not need solving until a space can have
three members.

## On the device

Nothing kept on a device is keyed by `'self'`. The two device stores keyed by
a scope — message drafts for a new thread, and the safety-number pins in
IndexedDB — are keyed by the partnership id, which is the shared space's id,
so they need no change when screens start speaking in spaces.

## Files

| Path                                   | What                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| `src/lib/spaces.ts`                    | The pure half: `SpaceKind`, the membership type, `managersFromControl`, `someoneElseManages`, and the task and reward rules in members (`assigneeFor`, `viewerActsIn`, `actsOn`, `managesSpace`, `managesRecord`, `canSetBalance`). Alias-free. |
| `src/lib/server/spaces.ts`             | Membership, the solo space, `partnershipControl`, the sync, `loadItemSpaces`, and deleting |
| `drizzle/0048_add_spaces.sql`          | The tables and the `space_id` columns, all `CREATE` and `ADD COLUMN`           |
| `drizzle/0049_backfill_spaces.sql`     | The trigger, and spaces and members for what already existed                   |
| `drizzle/0050_add_space_member_colour.sql` | Each member's colour for the space ([contexts.md](contexts.md#colours))    |
| `drizzle/0051_add_merged_tasks_rewards.sql` | The tasks and rewards tables, keyed by `space_id`                        |
| `drizzle/0052_copy_tasks_rewards_into_spaces.sql` | Every old task and reward row copied in, ids kept (custom SQL)     |
| `drizzle/0053_drop_scoped_tasks_rewards.sql` | The ten old tables dropped, children first ([tasks.md](tasks.md#data-model)) |
| `src/lib/server/spaces.test.ts`        | Membership, the sync, the id clash, and the no-orphans tests                   |
| `src/lib/server/db/migrations.test.ts` | The backfill and the tasks and rewards copy, against rows written before them, and the reviewed drops |
