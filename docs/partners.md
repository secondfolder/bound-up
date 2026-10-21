# Partners

Two accounts can link with each other. One person answers a few questions, gets
a link, and sends it out-of-band; the other opens it, signs in if they need to,
confirms, and the two are linked. Each then sees the other as a tab in the
bottom nav.

This document is the current behaviour. For why it was built this way, see
[`docs/historical-plans/2026-09-07-partners.md`](historical-plans/2026-09-07-partners.md) —
a frozen record, not a description of the code as it stands.

## The shape of a link

A link is **one row** in `partnerships`, not one per direction. The two names,
the two optional roles, and the single control setting belong to the
relationship, so storing them twice would let the two halves disagree.

| Column                               | Meaning                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `inviter_id`                         | Who created the invite. Never changes, not even after acceptance.                |
| `invitee_id`                         | Who accepted it. `NULL` exactly while `status` is `'pending'`.                   |
| `status`                             | `'pending'` or `'accepted'`. There is no declined or ended state — see below.    |
| `names_*`                            | The names and roles, sealed in the partnership's vault. See below.               |
| `invite_*`                           | Before the names reach the vault: sealed under the invite key. See below.        |
| `inviter_name` … `invitee_role`      | Plaintext names and roles, only on a link from before sealing; empty otherwise.  |
| `control`                            | `'inviter'`, `'invitee'` or `'both'`. Who may change the names and roles.        |
| `invite_token` / `invite_expires_at` | The secret in the URL and its deadline. Both cleared on acceptance.              |
| `accepted_at`                        | When the link was made.                                                          |

Both foreign keys cascade on delete, so deleting a user removes every link they
were in — otherwise the other person would keep a nav tab pointing at nothing.

`invite_token` has a unique index. SQLite allows many `NULL`s in a unique index,
so clearing the token on acceptance also frees the inviter to send another
invite later.

### Roles are permanent, and that is deliberate

`inviter` and `invitee` are not just plumbing for the invite. They stay
meaningful for the life of the row, because `control` is expressed in terms of
them. That is what makes a single row readable from both ends: whoever loads it,
`control === 'inviter'` means the same thing.

### Names are sealed

The four fields — the name each side goes by, and each side's optional role
("dom", "coach") — are end-to-end encrypted. The server stores them and hands
them back, and can read none of them. They live under two keys in turn:

1. **The invite key.** Creating an invite makes a random 256-bit key in the
   inviter's browser, and seals the four fields, plus the inviter's own public
   key, as one record (kind `partnership-invite`, `sealed-kinds/partnerships.ts`)
   under it (`crypto/invite.ts`). The key goes **in the link's fragment**,
   `/invite/<token>#k=<key>`, which a browser never sends to a server — not
   this one, not its logs, not a link previewer. A wrap of the key to the
   inviter's own recipient is stored too, so their devices can show the pending
   invite and copy its link again. That wrap carries a MAC only the inviter's
   identity can make (docs/encryption.md, "The self vault's wrap"), so the
   server cannot hand the inviter a key of its own to build the link from.
2. **The partnership vault.** Once the invite is accepted and the device of a
   member who holds `control` has the vault open, that device seals the names
   into it (kind `partnership-names`, columns `names_*`) and the invite and its
   key wrap are cleared, in one write (`content-sealing.ts` and
   `/api/sealing/[scope]`, alongside tasks and rewards). Only a member who
   holds `control`, because sealing them is writing them: the server cannot
   compare the sealed copy with the invite, so a read-only member allowed to
   seal could rewrite the names. Their device is not handed them, and the
   names stay under the invite key until the controller's device runs. Edits
   after that are sealed into the vault, compare-and-swap on
   `names_revision`.

**Accepting needs no keys.** `/invite/[token]` is public and has no keyring,
so an accepter who may edit (see control, below) seals their changes back under
the same invite key, and the server keeps the invite past acceptance until the
names move into the vault. The invitee's device keeps the key from the link
(local storage, `rememberInviteKey`) because the fragment does not survive the
trip through signing up — the email confirmation link opens a new tab — and
forgets it once a page load serves the names from the vault (`openedNames`).
Not as soon as its own sealing pass has moved them: a page whose load read the
invite a moment before still needs the key to open it. On another device, the
invitee sees "…" for the names until a device of the member who holds control
has moved them.

**The inviter's key arrives out of band.** The invite carries the inviter's
recipient as their device knew it, sealed under a key the server never had.
The invitee's page compares it with the recipient the server serves for them;
a mismatch blocks accepting, and a match is pinned on the invitee's device as
**verified** — it reached them from the inviter, not from the server. That
closes trust-on-first-use in that direction ([docs/encryption.md](encryption.md)).

**What the server can no longer check** is what the names say. It still decides
who may write them — `acceptInvite`, `updatePartnership` and the sealing pass
(`sealUnsealedContent`) re-read `control` from the stored row (invariant 14)
— but a read-only accepter whose device posted re-sealed names anyway would be
ignored only because the server drops them, not because it compared them.
Partners are trusted to that extent.

**Where a name used to be drawn without a key**, it now says less:

- The invite page's title and its link preview are "You've been invited to
  Bound Up"; the names appear only once the page has opened the invite.
- Push notifications say "New message" or "New reaction", never from whom
  ([docs/notifications.md](notifications.md)).
- Everything server-rendered — nav tabs, page titles, widget lines — shows "…"
  until hydration opens the names.

A partnership from before names were sealed keeps them in the plaintext columns
until a member's device seals them ([docs/temporary-code.md](temporary-code.md#tasks-and-rewards-in-plaintext)).
A **pending** invite from before then has no invite key, so no link to it can
work: the invite page treats it as dead, and the inviter's settings page offers
a new link, which seals it under a fresh key.

### Never map the names yourself

Which stored name is "theirs" flips with who is looking. Getting that backwards
is the easiest bug in this feature, so exactly one function does the mapping:
`namesForViewer(stored, role)` in [`src/lib/partnership.ts`](../src/lib/partnership.ts)
(and its inverse, `storedNamesFrom`, for writes).

The server never sees names at all, so `viewPartnership` returns a
`PartnerNamesSource` — the sealed record, the invite, or the legacy plaintext,
plus the viewer's `role` — and the browser opens it with
[`src/lib/partner-names.svelte.ts`](../src/lib/partner-names.svelte.ts):

```ts
import { partnerName, viewerNames } from '$lib/partner-names.svelte';

partnerName(view.names); // what the viewer calls the other person, or "…"
viewerNames(view.names); // { partnerName, yourName, partnerRole, yourRole }, or undefined/null
```

`viewPartnership` **throws** for a user who is not a member, rather than
returning a half-built view. Every read path in
[`src/lib/server/partnerships.ts`](../src/lib/server/partnerships.ts) goes
through it.

### `id` in a URL is always the partnership id

`/partner/[id]` and `/settings/partners/[id]` are keyed on the partnership, not
on a user. That way a link can be addressed before the second user exists, and
no user id ever appears in a URL.

## The control question

The form asks **"Who calls the shots?"** with three answers: **Me**, **Them**,
**A mix**. It is always asked from the answerer's own side, and always stored
against the permanent roles. The page also states explicitly that this decides
who can set tasks, punishments, rewards, and the other editable settings on the
link. Two pure functions are the only translation:

```ts
controlFromAnswer('me', 'inviter'); // → 'inviter'
controlFromAnswer('me', 'invitee'); // → 'invitee'
controlFromAnswer('mix', anyRole); // → 'both'

answerFromControl('inviter', 'inviter'); // → 'me'
answerFromControl('inviter', 'invitee'); // → 'them'
```

The round trip holds for all six combinations, and there is a test that says so.
The Zod schema accepts only `me` / `them` / `mix` — posting the _stored_ value
`inviter` is rejected, so there is no way to set `control` without going through
`controlFromAnswer`.

### What control gates

| Action                                                | Who may do it                                    |
| ----------------------------------------------------- | ------------------------------------------------ |
| Change the names, the roles, the control setting      | Whoever `control` names, or both                 |
| Manage partnership rewards and set reward credits     | Whoever `control` names, or both                 |
| Manage partnership tasks                              | Whoever `control` names, or both                 |
| Complete partnership tasks                            | The non-controller, or both under shared control |
| Rewrite the names and roles while accepting an invite | The accepter, if control is theirs or shared     |
| Disconnect, or cancel a pending invite                | **Either member, always**                        |

Control also sets where a partner's view of the kink list starts: whoever
holds it starts on the dom side, the other on the sub side, and shared control
on both. It only decides what is shown first, and either person can change it
for the visit. See [kink-list.md](kink-list.md#answer-as).

Disconnecting is deliberately not gated: a user who handed control to their
partner must still be able to get out. `deletePartnership` checks membership and
nothing else.

### Permissions are enforced on the server

A hidden input is a rendering decision, not a permission. On the read-only
accept screen the control question is not shown at all (the page text instead
says what accepting would hand over — tasks, rewards and punishments), but every
field is still posted as hidden inputs so the payload satisfies the same Zod
schema — and `acceptInvite` then re-reads the stored row and ignores anything
submitted by someone who does not hold control, `control` included. Accepting an
invite is never a way to seize control of it.

The edit action does the same: it re-checks `control` against the database
rather than trusting that the page hid the form, because control can have
changed since the page was rendered.

### Privacy boundaries matter here

The general rule lives in the Privacy section of
[`docs/user-commitments-and-product-goals.md`](user-commitments-and-product-goals.md#privacy):
a user must not be
able to probe another user's information unless the app has already established
they are allowed to see that specific data.

For partners, that means counterpart details are shown only through
membership-checked partnership reads, and only for fields the product has
explicitly decided to share on partner surfaces.

## The invite link

- **Token**: 32 bytes from `crypto.getRandomValues`, unpadded base64url.
  `randomUUID` is not used — it carries only 122 bits and has a recognisable
  shape, and this value is the entire authorisation to join someone's account.
- **Stored in the clear.** Hashing would mean the inviter could never be shown
  the link again, and re-sending an already-created link is a requirement.
  Better Auth stores `session.token` the same way, so this grants an attacker
  with database read access nothing they would not already have.
- **Expires after 7 days** (`INVITE_TTL_MS`).
- **Single use.** Accepting clears the token, so the link cannot be replayed.
- **Renewable.** "Create a new link" rotates the token and extends the window,
  which invalidates the previous link, and seals the invite again under a new
  invite key, so the old link fails on both halves. It is offered rather than
  done automatically on every re-copy, because rotating silently would break a
  link the inviter had already sent.
- **Carries its key in the fragment.** `#k=…` opens the names; see "Names are
  sealed" above. A link with its fragment cut off shows "This link is
  incomplete" and nothing else.
- **Only ever sent to the inviter**, and only while it is live. The token is
  never included in the page data of anyone who could not already use it.
- **Its preview names nobody.** A chat app that unfurls the link fetches it
  signed out and without running the page, so the server-rendered Open Graph
  title is all it gets: "You've been invited to Bound Up" (`ShareMeta.svelte`;
  the card is in [docs/theme.md](theme.md#the-share-card)). The server could
  not say more if it wanted to. A dead link previews as "This invite link
  doesn't work".

Two accepts racing on the same link cannot both win: the token is matched again
inside the `UPDATE`'s `WHERE`, so the first clears it and the second matches no
rows.

`acceptInvite` refuses, with a distinct reason each time: an unknown or consumed
token (`not-found`), an expired one (`expired`), the inviter's own link
(`self`), and a second link between a pair who are already connected
(`already-linked`, checked in both directions).

## Screens

| Route                              | Group             | What it does                                                                                              |
| ---------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| `/settings/partners`               | `(auth-required)` | Linked partners and outstanding invites. "Add a partner", after the list, starts a new one.               |
| `/settings/partners/new`           | `(auth-required)` | Name/Title, Roles, and the control question. Creates the pending row and the link.                        |
| `/settings/partners/[id]`          | `(auth-required)` | Who is whose role, then: pending, the link, share, renew; accepted, edit. Disconnect/cancel last, apart.  |
| `/invite/[token]`                  | **`(public)`**    | The landing page for the person being invited.                                                            |
| `/partner/[id]`                    | `(auth-required)` | The partner's own page. Accepted links only. Shows their local time, and date too when their day differs. |
| `/partner/[id]/tasks`              | `(auth-required)` | Shared tasks and recent completion history for that link.                                                 |
| `/partner/[id]/tasks/add`          | `(auth-required)` | The add-task form for the controlling side of that link.                                                  |
| `/partner/[id]/tasks/[taskId]`     | `(auth-required)` | The edit screen for one partnership task, reusing the same form layout as add.                            |
| `/partner/[id]/rewards`            | `(auth-required)` | Shared rewards and reward credits for that link, with buttons to add rewards or open claim history.       |
| `/partner/[id]/rewards/add`        | `(auth-required)` | The add-reward form for the controlling side of that link.                                                |
| `/partner/[id]/rewards/[rewardId]` | `(auth-required)` | The edit screen for one reward on that link, using the same form layout as add.                           |
| `/partner/[id]/rewards/history`    | `(auth-required)` | Reward claim history for that link.                                                                       |
| `/playroom/kink-list/partner/[id]` | `(auth-required)` | Your kink list for that partner, linked from the partner page. See [kink-list.md](kink-list.md#partners). |

## Partnership rewards

Accepted partner pages now also have a rewards screen. It reuses the same
control setting instead of inventing a separate permission model:

- Whoever `control` names may create rewards, edit any reward in that
  partnership, toggle rewards active or inactive, and set the other member's
  reward credits.
- The claiming side may spend their own partnership-scoped credits on active
  rewards.
- Shared control means both members may manage rewards and both may claim
  rewards the other member created.
- A user may never claim a partnership reward they created themselves, even
  under shared control.

On the list page, editable rewards now show an edit icon rather than an inline
form. That icon opens a dedicated nested edit page which reuses the same reward
form layout as the add screen, prefilled with the reward's current values.

The full behaviour, including the dedicated home rewards hub at `/home/rewards`, is documented in
[`docs/rewards.md`](rewards.md).

## Partnership tasks

Accepted partner pages now also have a tasks screen.

The feature deliberately reuses the same `control` field as the rest of the
partnership, but its split is different from rewards:

- Whoever `control` names may create tasks, edit any partnership task, and pick
  which partner's timezone a scheduled task is relative to.
- The completion side may complete eligible tasks and receive the resulting
  reward credits.
- Shared control means both members may manage tasks and both may complete
  tasks the other member created.
- A user may never complete a partnership task they created themselves.

Partnership task scheduling is also partner-relative.

- A task stores `timezone_owner_user_id`, not a raw timezone string.
- Date and datetime fields default to the other partner's timezone on create.
- When the two partners currently share the same timezone, that extra UI is
  hidden.
- When they differ, task dates show the same compact timezone-note style used
  on the partner page.

The full task behavior is documented in [`docs/tasks.md`](tasks.md).

### Why `/invite/[token]` is public

The whole point is that it is opened by someone who may not have an account. The
`(auth-required)` guard would bounce them to `/login` and, since the guard
carries no `redirectTo`, lose the invite entirely. Its load returns one of five
states:

| State              | When                               | What the page shows                                                                                                                                                                              |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `invalid`          | Unknown, consumed or expired token, or an invite from before sealing | "This link doesn't work". Nothing else — see below.                                                                                                                                              |
| `sign-in-required` | Valid token, nobody signed in      | The inviter's chosen name, opened from the invite, plus login/signup buttons carrying `redirectTo`. "Create an account" is primary: someone opening an invite while signed out most likely does not have an account yet. |
| `self`             | The inviter opened their own link  | "That's your own link"                                                                                                                                                                           |
| `already-linked`   | The two are already connected      | "You're already linked"                                                                                                                                                                          |
| `confirm`          | Otherwise                          | The confirmation form, editable per `control`, once the invite is open and the inviter's key checked.                                                                                            |

An expired token and an unknown one are reported identically: there is no value
in telling an anonymous visitor which of the two they found. Before sign-in the
page shows the name the inviter chose for themselves, opened in the browser
from the link, and nothing else — no email, no account name, no user id.

Because actions run **before** layout loads, the group guard never gates an
action. Every action in this feature checks `locals.user` itself; that check is
not redundant.

### Getting back to the invite after signing in

`/login` and `/signup` accept `?redirectTo=`. The value is validated by
`safeRedirect` in [`src/lib/safe-redirect.ts`](../src/lib/safe-redirect.ts) both
on the way in (so a hostile value never renders as a link) and on the way out.
It rejects absolute URLs and protocol-relative ones — `//evil.example` and
`/\evil.example` are both read as off-site by browsers — and falls back to
`/home`.

The passkey sign-in path never touches the server action, so `LoginForm` applies
the same destination itself; otherwise a passkey login would drop the invite.

The login and signup pages also link to each other below the form, and each
carries `redirectTo` into that link — so someone who clicked "Log in" on the
invite, then realised they have no account, can switch to signup and still land
back on the invite after creating one.

## The bottom nav

`(auth-required)/(app)/+layout.server.ts` calls `listPartnersForNav`, which
returns one `PartnerView` per **accepted** partnership. Pending invites are
excluded on purpose: until the other person accepts there is nobody behind the
tab, and a tab that opens an empty page reads as a bug. They are visible in
settings instead.

Each tab shows the name _that viewer_ chose and, when the partner has one, their
avatar. `AppNav` decides the active tab from `page.route.id`, never a pathname —
see the note in `AGENTS.md`.

## Sharing the link

[`src/lib/share.ts`](../src/lib/share.ts) does both things at once: it writes the
link to the clipboard **and** opens the platform share sheet if there is one.
Three details are load-bearing:

- The clipboard write is **started but not awaited** before `navigator.share`.
  `navigator.share` needs transient user activation, and awaiting anything first
  consumes it — Safari then rejects the share outright.
- The clipboard write is capped at 2 seconds. When the document is not focused,
  Chromium leaves `writeText`'s promise _pending_ rather than rejecting, and a
  caller waiting on it would hang.
- An `AbortError` from the share sheet means the user dismissed it. That is a
  normal outcome, not a failure: the link is on the clipboard either way, and
  nothing is logged.

After creating an invite the action returns the link **instead of
redirecting**, so the share attempt happens inside the click that caused it;
the page adds the key's fragment, which the server never had. The page then navigates itself. The share call there is fired and not
awaited: the sheet stays open until the user picks something, and a client-side
navigation does not dismiss a browser-level sheet.

## Files

| Path                                          | What it holds                                                       |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `src/lib/partnership.ts`                      | The domain rules. Pure, alias-free, no database.                    |
| `src/lib/server/partnerships.ts`              | Every query and mutation, including the aliased join.               |
| `src/lib/schemas/partnerForm.ts`              | The Zod schemas: the fields, and the sealed shapes actually posted.  |
| `src/lib/sealed-kinds/partnerships.ts`        | The two sealed kinds: the invite, and the names in the vault.       |
| `src/lib/crypto/invite.ts`                    | The invite key: making, wrapping, the fragment, the device copy.    |
| `src/lib/partner-sealing.ts`                  | Sealing names on submit; opening an invite on its page.             |
| `src/lib/partner-names.svelte.ts`             | Opening names for display, from whichever source has them.          |
| `src/lib/components/SealedPartnerEditForm.svelte` | The settings form, mounted once the names are open.             |
| `src/lib/components/PartnerFields.svelte`     | Name/Title, Roles, and the control question, editable or read-only. |
| `src/lib/components/PartnerAcceptForm.svelte` | The accept form. Owns its `superForm`.                              |
| `src/lib/invite-url.ts`, `src/lib/share.ts`   | Building the URL, and handing it to the platform.                   |
| `src/lib/safe-redirect.ts`                    | The `redirectTo` allowlist.                                         |
| `src/lib/server/db/schema/app.ts`             | The `partnerships` table.                                           |

`partnership.ts` is **alias-free** (relative imports only), like
`src/lib/types.ts`: the Drizzle schema imports its two union types, and
drizzle-kit loads the schema outside Vite where `$lib` does not resolve.

There is no `relations()` for `partnerships`. Two foreign keys point at the same
table, which drizzle's relational query API can only disambiguate with a
`relationName` declared on _both_ sides — and the `user` side lives in the
generated `schema/auth.ts`, where an edit would be lost on the next
`npm run auth:schema`. Reads use explicit aliased joins instead.

## Tests

| Level     | Where                                                                                 | Covers                                                                    |
| --------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Pure      | `src/lib/partnership.test.ts`, `safe-redirect.test.ts`, `schemas/partnerForm.test.ts` | Permission rules, the per-viewer flip, the control round trip, validation |
| Server    | `src/lib/server/partnerships.test.ts` plus a `page.server.test.ts` per route          | Every query and action against a real in-memory SQLite database           |
| Component | `AppNav.svelte.test.ts`, `PartnerAcceptForm.svelte.test.ts`                           | Nav tabs and active state; editable vs read-only fields                   |
| E2E       | `e2e/partners.spec.ts`, `e2e/sealed-names.spec.ts`                                    | The whole flow in a browser, across two session cookies; nothing in the database, the cut-off fragment, a swapped inviter key |

`AGENTS.md` has the harness details — how to build a test database, how to fake
a `RequestEvent`, and the Playwright gotchas.

## Not built yet

- No decline action. The accept screen offers "Not now", which just leaves.
- No notification to the inviter when an invite is accepted.
- `/partner/[id]` has no shared content; it names the link and points at its
  settings.
- Permissions cover the names, the roles, and the control setting. They do not
  gate anything about guides or progress.
