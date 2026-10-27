# Rewards

Rewards are what task credits are spent on. Like a task
([tasks.md](tasks.md)), a reward lives in a **space**
([spaces.md](spaces.md)): the viewer's own, where they keep rewards for
themselves, or a partnership's shared space, where one member sets rewards
aside for the other. Every reward is in one table, `rewards`, written by one
member (`created_by_user_id`) and claimed by the one it is for
(`assignee_user_id`), from that member's credits in the same space.

There used to be a `self_*` and a `partnership_*` table for each of rewards,
credits and claims, on the grounds that the permission models differed too
much for one table. The rules were already pure functions, so the split only
cost a hand-written union for every page showing more than one scope and a
pair of functions and actions for every operation. One table keyed by space,
with the assignee a column, is one code path, and the Everyone context
([contexts.md](contexts.md)) one query. Why tasks merged is the same
([tasks.md](tasks.md)).

## Who does what

The rules are the tasks' rules, pure and node-tested in `src/lib/spaces.ts`
and `src/lib/rewards.ts`, written in terms of members rather than "the
partner":

- **Setting a reward** (`managesSpace`): a member with `can_manage` — the
  owner of a solo space, and in a shared one whoever the partnership's control
  names, or both.
- **Who it is for** (`assigneeFor`) is chosen by the server on creation: the
  creator in their own space, the other member in a shared one.
- **Claiming** (`actsOn`, `canClaimReward`): the reward is set for the viewer,
  they are on the side that acts in the space (`viewerActsIn`), in a shared
  space they did not write it, it is active, and their balance in its space
  covers the cost.
- **Editing** (`managesRecord`): the viewer manages the space and the reward
  is set for someone else — or, in their own space, it is simply theirs.
  Nobody edits a reward set for them, which in a shared space would let the
  person claiming it set its price. Editing covers the title, description,
  cost and whether it is active.
- **Setting credits** (`canSetBalance`): the viewer's own balance in their own
  space, and in a shared space they manage another member's — never their own
  there, which would be paying themselves.

### Authorship still matters under shared control

Shared control does **not** mean "everyone can claim everything". A user may
never claim a reward they wrote. Shared control gives both people creation
rights; without the authorship rule, either could create a reward and spend
their own credits on it, which is the opposite of what the feature is for. It
holds whatever `can_manage` says now. If who manages changes, rewards stay
stored and a page shows only those still on the viewer's side
(`rewardListFor` returns null for the rest).

Inactive rewards stay listed, in a closed Inactive group, but cannot be
claimed.

## Credits

Credits are a wallet per member per space: `reward_balances`, unique on
(`space_id`, `user_id`).

- Completing a task adds its award to the assignee's balance in the task's
  space.
- A balance is set by hand through `?/setCredits`, which posts the space and
  whose balance it is (`spaceId`, `targetUserId`), under `canSetBalance`.
- Claiming deducts from the claimant's balance in the reward's space and
  writes a claim row in the same `db.batch()`, the deduction done in SQL so a
  completion landing at the same moment is not lost.

Balances are never pooled. A space's credits buy that space's rewards and
nothing else, so one total would state a spending power nobody has.

Claim rows snapshot the reward's sealed content and its cost, so history does
not rewrite when a reward changes later.

## Screens

All under `src/routes/(auth-required)/(app)/rewards/`:

| Route                  | What it shows                                                                    |
| ---------------------- | -------------------------------------------------------------------------------- |
| `/rewards`             | The current context's wallets: the viewer's own, then those they set for others  |
| `/rewards/add`         | The wallets, with the form for a new reward in a sheet; redirected to the list when the context has nowhere the viewer may set one |
| `/rewards/[rewardId]`  | The wallets, with one reward's edit form in a sheet, for a reward the viewer may edit |
| `/rewards/history`     | The wallets, with the claim history of the context's spaces in a sheet           |

The page follows the context exactly as the tasks page does
([tasks.md](tasks.md#route-surface)): the layout's load depends on
`app:context` and on `rewards:<spaceId>` per space shown
(`rewardsDependency`), the context switcher is in the header's corner, and a
Tasks | Rewards pair of links (`ItemsTabs`) sits at the top. An edit sheet
takes its space from the reward, so it opens whatever the context is. The old
`/home/rewards` and `/partner/[id]/rewards` routes are gone, with no
redirects. Today's Rewards card leads here in Today's own context.

**Actions** live on `/rewards` and name what they act on, never the context:
`?/claim` (`rewardId`), `?/setCredits` (`spaceId`, `targetUserId`,
`credits`) and `?/content` (a sealed record: a tick in the description). The
add sheet posts `spaceId` and a sealed record to `createReward`; the edit sheet
posts a sealed record to `updateReward`.

**Adding** asks "For whom?" (`ForWhom`) when the context shows more than one
space the viewer may set rewards in, remembered on the device under
`bound-up:rewards-for-whom`, as the tasks page's add sheet does.

### The wallet

Rewards are laid out around the balance they are paid from, because each reward
is paid from exactly one. A `RewardWallet` is one balance (its
`RewardCreditsInline`) and the rewards it pays for, grouped by what it can do:

| Group                                       | Order                                 |
| ------------------------------------------- | ------------------------------------- |
| Within reach (or "Jun can afford")          | cheapest first                        |
| Saving up (or "Jun is saving up")           | closest first, with a bar and "6 more" |
| Inactive, a closed `wa-details`             | as loaded                             |

The grouping is decided against the balance, not `canClaim`, so it reads the
same from both sides of a partnership: whoever set a reward never claims it but
still wants to see whether their partner can. The rules are pure and
node-tested in `src/lib/reward-list.ts`.

`listRewards` returns a wallet per balance the viewer can see
(`balancesFor`): their own in each space where they act, then each partner's
in a shared space they manage, with that partner's rewards in it. The page
shows the viewer's own wallets first — what they can spend — titled "Yours"
for their own space, "From Jun" for a partnership in Everyone, or "For you"
in that partnership's own context; then, under a "Set for others" heading, a
wallet "For Jun" per partner whose rewards they keep. A single wallet is
untitled, since the page already says what it is. A merged list, as the tasks
page has, would hide which balance a cost comes out of, so rewards are never
merged across wallets.

The balances themselves are the tasks page's row of pills (`CreditBalances`,
from `balancePills`): the viewer's own ("Yours", or "With Jun" beside others
in Everyone) and each partner's they manage, with their picture. Any the
viewer may set (`canSetBalance`) is editable in place, posting to
`?/setCredits`. Adding a reward is the dashed "Add a reward" row
(`QuickAddLink`); claim history is the clock icon beside the page title,
always there.

The row of a reward whose detail is open stays lit behind it. Each reward is
an `ItemRow` (the same row a task is; see
[docs/theme.md](theme.md#lists-of-items)): its title, and its cost at the end
in an amber pill when the balance covers it. A cost that becomes covered while
the page is open — the balance edited up, a task completed — glows once; one
already covered on load does not.

### Claiming, from the detail only

There is no Claim on the row. Tapping a reward opens `RewardDetailDialog` (a
`ResponsiveDialog`: a sheet on a phone, a dialog wider): its description, what
it costs, what the balance holds, and what will be left ("2 credits left") or
still to go; in its footer, first and widest, **Claim · 4 credits** on the
viewer's own wallets, then Edit where the viewer may edit it. A claim
spends credits and, unlike completing a task, cannot be undone, so it takes a
second, deliberate tap rather than an undo; that is also why tasks have an undo
and rewards do not.

Claiming is enhanced (`ItemAction`): the button becomes a gift, the page's
loads re-run, the dialog closes on the refreshed list and the balance counts
down to its new value (`RewardCreditsInline` tweens it). A refusal is said in
the dialog, since the page's own error line is behind it. Editing opens the
same form layout as adding, prefilled.

Claim history is a line per claim under the day it was made, with what it cost
at the time. It, and the add and edit forms (`RewardEditorBody`), are sheets
over the list with URLs of their own, as the tasks page's are (`RouteSheet`;
[docs/dialogs.md](dialogs.md#sheets-with-their-own-url)).

The add and edit form's save button is outlined until the form holds a valid
change (a title, and a whole-number cost), then solid amber — the app's save
convention.

## What the server can see

A reward's **title and description** are end-to-end encrypted, the same way
as a task's ([docs/tasks.md](tasks.md#what-the-server-can-see) has the full
account): one sealed record of kind `reward` (`src/lib/sealed-kinds/tasks.ts`)
in the vault of the reward's space. The server sees what it acts on — the
space, the cost, whether the reward is active, who wrote it and who it is for,
credits and claims — and checks only the sealed record's envelope and every
permission.

- **The form** (`RewardForm.svelte`) is a superform built in the browser
  from `defaults()` and `rewardEditorFormSchema`, rather than from a load's
  `superValidate`: the actions never read a superform. Its fields are the
  app's own (`InputField`, `CheckboxField`); its `onSubmit` validates, seals
  the title and description and posts the sealed record in their place
  (`sealed-forms.ts`), and a refusal comes back as a message. The title and
  description limits run in the browser and on every read.
- **Edits are compare-and-swap** on `revision`, so a partner's newer edit is
  never overwritten unseen.
- **A tick in the description** — a to-do item ticked in the reward's sheet —
  re-seals the content and posts it alone to `?/content`, under the same
  permission as an edit, so it cannot carry a stale cost or active flag back
  with it. See [rich-text.md](rich-text.md#to-do-lists).
- **A claim** copies the reward's ciphertext as it stood (`snapshot_*`
  columns). The copy still opens as a reward, sealed to the reward's id, so
  either partner's claim can take the snapshot without reading it.
- **Reading** goes through `openedReward` / `openedClaim` in
  `src/lib/sealed-views.svelte.ts`.

There is no plaintext content column, and the sealed columns are `NOT NULL`.

## Data model

Three tables, in `schema/app.ts`:

- `rewards` — `space_id`, `created_by_user_id`, `assignee_user_id`, `cost`,
  `active`, and the sealed record (`ciphertext`, `vault_id`,
  `payload_version`, `revision`)
- `reward_claims` — `space_id`, `reward_id`, `claimed_by_user_id`,
  `created_by_user_id`, `reward_cost` and the `snapshot_*` columns
- `reward_balances` — `space_id`, `user_id`, `credits`, unique on the pair;
  the wallets tasks pay into too

All ids are text UUIDs and all timestamps use the shared `timestamps` helper.
Every table's `space_id` is `NOT NULL` with `ON DELETE CASCADE` from `spaces`,
and `deleteSpaceStatements` deletes them explicitly as well
([spaces.md](spaces.md#deleting-a-space)), so ending a partnership removes its
rewards, claims and balances. `assignee_user_id` is nullable only for a space
with nobody else in it yet, where `createReward` refuses (`no-assignee`).

The rows were copied in from the old per-scope tables by
`drizzle/0052_copy_tasks_rewards_into_spaces.sql`, keeping their ids so every
sealed record still opens; [tasks.md](tasks.md#data-model) has the three
migrations.
