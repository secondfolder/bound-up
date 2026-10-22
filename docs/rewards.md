# Rewards

Rewards are two related features that deliberately do **not** share one table:

- **Self rewards** belong to one user, use one self-managed credit balance, and
  are created, edited and claimed only by that same user.
- **Partnership rewards** belong to one accepted partnership, are managed under
  the partnership's existing `control` setting, and are claimed against the
  viewer's partnership-scoped credit balance.

The split is deliberate. The permission model is different enough between the
two scopes that a single polymorphic table would force every read and write to
branch on nullable scope columns, which is exactly the kind of ambiguity this
codebase tries to keep out of its load-bearing rules.

## Self rewards

Self rewards live on `/home/rewards`, which is reached from the signed-in home
page.

Each user has:

- A list of rewards they can add, edit and mark active or inactive.
- One credit balance they can set directly.
- A claim history showing what they redeemed and what it cost at the time.

Claiming a self reward deducts credits and inserts a history row in the same
`db.batch()`. The reward's sealed content and its cost are copied onto the
claim row so the history stays truthful if the reward is edited later.

Inactive rewards stay visible for management but cannot be claimed.

## Partnership rewards

Partnership rewards live on `/partner/[id]/rewards`. The dedicated home rewards
page also shows one section per partner, so a user can browse every partner's
claimable rewards from one place without opening each partner page in turn.

Each accepted partnership has:

- A shared reward list.
- One credit balance per member of the partnership.
- A partnership claim history.

### What control means for rewards

The rewards feature reuses the existing partnership control rule instead of
inventing a second permission system:

| Current control value | Who may manage rewards | Who may claim rewards |
| --------------------- | ---------------------- | --------------------- |
| `inviter`             | inviter only           | invitee only          |
| `invitee`             | invitee only           | inviter only          |
| `both`                | both members           | both members          |

"Manage" means create a reward, edit any reward in the partnership, toggle a
reward active or inactive, and set the **other person's** partnership reward
credits.

"Claim" means redeem an active reward against your own partnership-scoped
credit balance.

### Authorship still matters under shared control

Shared control does **not** mean "everyone can claim everything". A user may
never claim a partnership reward they created themselves.

That rule is independent of later control changes:

- If a reward was created by Ada, Ada can never claim that reward.
- If control later flips from shared to one-sided, claimability still follows
  the current control setting **and** the original authorship.

The authorship check exists because shared control intentionally gives both
people creation rights. Without it, either person could create a reward and
instantly spend their own credits on it, which is the opposite of what the
feature is for.

### Credits

Partnership reward credits are stored per `(partnership_id, user_id)`.

- The controlling side sets the other member's balance directly.
- The claimant sees their own current balance.
- Claiming deducts from the claimant's balance and writes a claim history row
  in the same `db.batch()`.

As with self rewards, claim rows snapshot the reward's sealed content and its
cost so history does not rewrite when a reward changes later.

## Screens

| Route                              | What it shows                                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `/home`                            | The signed-in landing page, with a button through to the rewards hub.                                          |
| `/home/rewards`                    | The rewards hub: a wallet for the viewer's own balance, then one per partner.                                  |
| `/home/rewards/add`                | The rewards hub, with the form for a new self reward in a sheet over it.                                      |
| `/home/rewards/[rewardId]`         | The rewards hub, with one self reward's edit form in a sheet.                                                 |
| `/home/rewards/history`            | The rewards hub, with the self claim history in a sheet.                                                      |
| `/partner/[id]`                    | A summary page with links to Messages and Rewards.                                                             |
| `/partner/[id]/rewards`            | The partnership's rewards as wallets; a tab each for "For you" and "For them" under shared control.             |
| `/partner/[id]/rewards/add`        | The partner's rewards, with the form for a new partnership reward in a sheet.                                 |
| `/partner/[id]/rewards/[rewardId]` | The partner's rewards, with one partnership reward's edit form in a sheet.                                    |
| `/partner/[id]/rewards/history`    | The partner's rewards, with the partnership's claim history in a sheet.                                       |

The signed-in home page no longer carries the full rewards UI directly. It
links to `/home/rewards`, which keeps the route shallow for the landing screen
and gives rewards their own nested page structure, matching the partner flows.

### The wallet

Rewards are laid out around the balance they are paid from, because each reward
is paid from exactly one: the viewer's own, or theirs within one partnership. A
`RewardWallet` is one balance (its `RewardCreditsInline`, editable where the
viewer may set it) and the rewards it pays for, grouped by what it can do:

| Group                                       | Order                                 |
| ------------------------------------------- | ------------------------------------- |
| Within reach (or "Jun can afford")          | cheapest first                        |
| Saving up (or "Jun is saving up")           | closest first, with a bar and "6 more" |
| Inactive, a closed `wa-details`             | as loaded                             |

The grouping is decided against the balance, not `canClaim`, so it reads the
same from both sides of a partnership: whoever set a reward never claims it but
still wants to see whether their partner can. The rules are pure and
node-tested in `src/lib/reward-list.ts`.

`/home/rewards` shows a wallet for the viewer's own balance ("Yours", untitled
when there are no partners) and one per partner ("From Jun"); a merged list,
as the tasks page has, would hide which balance a cost comes out of. The
balances themselves are the tasks pages' row of pills (`CreditBalances`): on
`/home/rewards` "Yours", which the viewer may set, and "With Jun" for each
partner, with their picture; on the partner page the viewer's own when they
claim there and their partner's, editable, when they set rewards. The
partner rewards page is one wallet for one-sided control — the claiming side's
own balance, or the managing side's view of their partner's, editable — and
under shared control the same pill-shaped segmented control as the tasks page
(`SegmentedTabs`), "For you" and "For them". Adding a reward is the dashed "Add a reward" row on `/home/rewards` and the
round amber button over the bottom of the partner page; claim history is the
clock icon beside the page title, always there.

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
still to go; in its footer, first and widest, **Claim · 4 credits**, then Edit where the viewer may
edit it, and from `/home/rewards` a link to that partner's rewards. A claim
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
over the list with URLs of their own, as the tasks pages' are (`RouteSheet`;
[docs/dialogs.md](dialogs.md#sheets-with-their-own-url)).

The add and edit form's save button is outlined until the form holds a valid
change (a title, and a whole-number cost), then solid amber — the app's save
convention, which this form now follows too.

The home rewards page's partner wallets are claim-only rather than a second
management UI. Editing partnership rewards stays on the partner rewards screen,
and creating rewards or reviewing claim history happens on the dedicated nested
pages reached from there.

## What the server can see

A reward's **title and description** are end-to-end encrypted, the same way
as a task's ([docs/tasks.md](tasks.md#what-the-server-can-see) has the full
account): one sealed record of kind `reward` (`src/lib/sealed-kinds/tasks.ts`)
in the owner's vault for a self reward, or the partnership's vault for a
partnership reward. The server sees what it acts on — the cost, whether the
reward is active, who authored it, credits and claims — and checks only the
sealed record's envelope and every permission.

- **The form** (`RewardForm.svelte`) is a superform built in the browser
  from `defaults()` and `rewardEditorFormSchema`, rather than from a load's
  `superValidate`: the actions never read a superform. Its fields are the
  app's own (`InputField`, `CheckboxField`); its `onSubmit` validates, seals
  the title and description and posts the sealed record in their place
  (`sealed-forms.ts`), and a refusal comes back as a message. The title and
  description limits run in the browser and on every read.
- **Edits are compare-and-swap** on `revision`, so a partner's newer edit is
  never overwritten unseen.
- **A claim** copies the reward's ciphertext as it stood (`snapshot_*`
  columns). The copy still opens as a reward, sealed to the reward's id, so
  either partner's claim can take the snapshot without reading it.
- **Reading** goes through `openedReward` / `openedClaim` in
  `src/lib/sealed-views.svelte.ts`.

Rewards written before sealing keep `title` and `description` in plaintext
until a device seals them in the background; see
[docs/temporary-code.md](temporary-code.md#tasks-and-rewards-in-plaintext).

## Data model

The schema uses six reward tables:

- `self_rewards`
- `self_reward_credits`
- `self_reward_claims`
- `partnership_rewards`
- `partnership_reward_credits`
- `partnership_reward_claims`

All reward ids are text UUIDs, all timestamps use the shared `timestamps`
helper, and all credit rows are unique per owner scope. Partnership-scoped rows
cascade from `partnerships`, so disconnecting removes the live reward data for
that relationship.
