# Analysis: replacing the home/partner split with feature routes and a context switcher

> **Scope of this plan right now: analysis and design mockups only. No app code
> changes.**
>
> - The immediate next step is section 6: an interactive HTML mockup, published as a
>   private Artifact built from a scratchpad file. Nothing in the repo is touched.
> - Sections 3 and 5 are the proposed implementation, kept for later and **not**
>   approved by approving this plan.

## Context

Today the signed-in app has two kinds of place: `/home/*` (solo, with some partner
content mixed in) and `/partner/[id]/*`, one per partnership. The bottom nav is
Home · one avatar per partner · Settings. This causes two problems:

- **Duplicated routes.** Tasks and rewards are copied by hand under both trees. The
  paired route files are about 590/670 lines for tasks and 540/630 for rewards, plus
  roughly 1,300 lines of tests on each side. The action names differ too
  (`selfCompleteTask` against `completeTask`, and so on).
- **Switching is slow.** To see the same feature for another context you go back
  through that context's index page.

The proposal:

- **Nav:** Dashboard · Tasks · Rewards · Notebook · Playroom · context switcher ·
  Settings.
- **One route per feature:** `/notebook`, not `/home/notebook` plus
  `/partner/[id]/notebook`.
- **Contexts:** solo, each partnership, and "all".

This is the review. The phased plan at the end is what I would carry out once the
open decisions are settled.

---

## 1. What the codebase already gives us

- **Notebook is already scope-agnostic.**
  - Every loader and action in `src/lib/server/notebook-pages.ts` takes a
    `NotebookScope` (`{kind:'self'} | {kind:'partnership', partnershipId}`), and the
    page components are shared (`NotebookList`, `NotebookEntryPage`,
    `SceneMenuPage`).
  - `notebook_entries` is one table whose CHECK requires exactly one of
    `owner_id`/`partnership_id`, so "all" is a single query.
  - This is the cheapest feature to move first.
- **Kink list** already has a `'self' | {partnershipId}` scope (`vaultFor` in
  `src/lib/server/kink-lists.ts`).
- **Reading several vaults at once is already solved.** `EncryptionGate` opens the
  self vault and every partnership vault, and every sealed ref carries its own
  `vaultId`. `/home/tasks` already shows rows from several vaults. An "all" view
  costs nothing extra on the client.
- **Membership checks are already helpers:**
  - `getPartnershipForUser` (`src/lib/server/partnerships.ts:127`)
  - `requireTaskMembership` and `requireRewardMembership`
  - `requireMembership` (messaging)
  - `resolveScope` (notebook)

  These stay the auth boundary. Only the source of the id changes.
- **There is a pattern for keeping old URLs alive.** `daydreams/scenes/+page.server.ts`
  sends a 308.
- **No "current partner" state exists today.** No cookie, column or param holds it.
  This is a clean start, with nothing to migrate.

## 2. Where the codebase pushes back

### 2.1 Tasks and rewards are two tables each, and the roles differ per row

- Solo and partnership variants are separate tables (`self_tasks` and
  `partnership_tasks`; the same for rewards, credits and claims). This was a
  deliberate choice (`schema/app.ts` ~line 241). So "all" is a union of queries, not a
  filter.
- That is fine. `getSelfTasksSection` plus `listHomePartnerTaskSections` already do
  it. But the per-feature server modules (`tasks.ts`, 1,905 lines; `rewards.ts`,
  1,188 lines) need a scope-shaped entry point.
- The same partnership row means "do it" to one member and "manage it" to the other.
  - Today `/home` shows only rows you complete or claim.
  - `/partner/[id]` splits them into "For you" and "For them".
- **A model that covers all three contexts:** every Tasks page has
  - **To do:** rows I complete. Solo: my own. A partnership: ones set for me. All:
    the union.
  - **Set for others:** rows I manage on a partner's behalf. Empty, and so hidden,
    in solo.

  Rewards work the same way, but **stay grouped by wallet**. `docs/rewards.md`
  already rejects a merged list because it would hide which balance pays. In "all",
  that means one wallet section per balance, which is what `/home/rewards` already
  does.

### 2.2 Messages are not in the proposed nav

- Messaging is partnership-only, and today it is reached only through the partner
  tab. Under the proposal there is no route to it except the Dashboard card.
- If Messages becomes a feature tab:
  - In a partnership context it is that board.
  - In "all" it is a unified inbox, with each thread badged by partner.
  - In solo it is hidden or shows an empty state.
- **This also needs deciding (see Q2).**

### 2.3 The nav would have 7–8 items on a phone

- Dashboard, Tasks, Rewards, Notebook, Playroom, Messages, context and Settings is 8.
  Bottom bars stop being usable above about 5.
- The partner tabs currently fit because most users have 0–2 partners.
- **Options:**
  - Fold **Settings into the context switcher's popover.** Account switchers
    commonly carry "Settings" and "Manage partners". This saves a slot.
  - Fold **Rewards into Tasks**, as a tab inside one "Tasks & rewards" place,
    since credits tie them together.
  - Leave **Playroom on the Dashboard only**, as it is today.
- My lean: **Dashboard · Tasks · Notebook · Messages · [context]**. Rewards becomes a
  tab inside Tasks, Playroom and Daydreams stay Dashboard cards, and Settings goes in
  the context popover. That is 5 slots.

### 2.4 Not every feature has every context

| Feature | Solo | Partnership | All |
|---|---|---|---|
| Tasks / rewards | yes | yes | union (rewards grouped by wallet) |
| Notebook (incl. scenes) | yes | yes | one query |
| Messages | — | yes | unified inbox |
| Kink list | yes | yes | ? (probably a picker, not a merge) |
| Daydreams | yes | — | = solo |
| Guides, IQ test | context-free | | |

**A rule is needed for "the current context does not apply here".** I'd recommend:

- show the feature's own empty state with a one-tap "switch to …"; and
- never switch the context silently.

### 2.5 Creating something in "all" needs a target

New task, entry or thread in "all" (or in solo, for a partner-only feature) needs a
"for whom" picker:

- defaulted to the last one used;
- skipped when there is only one option.

Partnership tasks also carry timezone ownership (`timezone_owner_user_id`), which
only makes sense once the target is chosen.

### 2.6 The context must be a *view filter*, never an implicit write target

- This is the main safety invariant: **every action names its scope explicitly**
  (form field or URL), as `/home`'s `partnerCompleteTask` already does with a
  `partnershipId` field.
- If an action read the ambient context, switching context in a second tab would
  redirect the first tab's next write to the wrong partnership.
- The server re-validates the id through the existing membership helpers, per
  invariant 14.

### 2.7 Where the current context lives (the biggest technical decision)

| Option | Pros | Cons |
|---|---|---|
| **Cookie only** (chosen) | Cleanest URLs; SSR renders the right list | All tabs share it; Back doesn't undo a switch; a pasted link renders a different list for whoever opens it |
| **URL** (`/notebook?with=<id>` or `/c/<ctx>/notebook`) | Per tab, Back and reload work, a link means one thing | Context is in every href; switching has to rewrite the current URL |
| **Hybrid** | Item URLs carry their own scope; list URLs take `?with=`; a cookie remembers the last choice for bare URLs | Two sources, so precedence must be documented |

**Cookie-only details** (*revised 2026-10-27:* the user chose cookie only over hybrid):

- **One cookie holds the context per device**, for example `context=self|all|<partnershipId>`.
  - It is set when the switcher is used.
  - It is read in `hooks.server.ts`.
  - URLs never carry it: lists are `/notebook`, `/tasks`, `/messages`.
- **Item pages still need no context.** `/notebook/[entryId]`, `/tasks/[taskId]`,
  `/messages/[threadId]` and so on get their scope from the item, because each item
  belongs to exactly one scope.
  - This keeps push and notification URLs independent of the cookie.
  - Opening a partner's item while the cookie says something else shows the item with
    that partner's badge. The context is left as it was.
- **The switcher** writes the cookie, through a small form action or endpoint so it
  works server-side and without JavaScript. It then calls
  `invalidate('app:context')`, so the current page's loads re-run in place: same URL,
  same feature, new filter. Every context-dependent load calls `depends('app:context')`.
- **Consequences accepted with this choice:**
  - **Every tab on the device shares the context.** A switch in one tab shows up in
    another on its next load or navigation. A tab left open keeps its rendered list
    until then, so its header control can disagree with the cookie for a while.
  - **Back does not undo a switch.** History holds only URLs, and the URL never changed.
  - **A pasted list link** shows the list in whatever context the person opening it
    has.

  This makes 2.6 load-bearing rather than defensive. Since another tab can change the
  context at any moment, no action may ever read it to decide where a write goes.
- **The page must not go stale silently.** A `visibilitychange` (or `focus`) listener
  compares the cookie with the context the page was rendered for, and calls
  `invalidate('app:context')` if they differ. A tab coming back to the foreground then
  shows the context the control claims.
- **An unknown or ended partnership id** (unlinked, or someone else's) falls back to
  the default rather than returning 404, because it is ambient. An *item* that is not
  yours still returns 404.
- **Resolve the context once per request**, lazily, in `hooks.server.ts`
  (`locals.context()`):
  - it validates against the user's accepted partnerships;
  - hooks run before actions, unlike a layout load.

  It is display-only, like `features`, because of 2.6.

### 2.8 The context switcher itself

- **No per-partnership identity exists beyond sealed names and `user.image`**, and
  nothing sets `user.image`. So the stacked icons are initials, and they read "…"
  until the vaults open (and during SSR).
  - A per-partnership colour or icon would need either sealing or a closed list, like
    `THREAD_ICONS`. The schema calls that the one plaintext user choice, so as not to
    create a covert channel.
  - Recommend a **closed palette colour, chosen per viewer**: a per-member
    preference, not shared.
- **Solo** = your own initials or avatar, or a single-person icon.
- **"All"** = a stacked or group glyph.
- **The "spring up" list:**
  - Use a `wa-dropdown` (it manages `aria-expanded` itself), or a native `<button>`
    with a comment, because `wa-button` forwards no ARIA state.
  - Honour `prefers-reduced-motion`.
- **Hide the switcher when the user has no partnerships.** "All" then equals solo,
  and offering both is noise.
- **Privacy upside worth designing for:** showing your screen to partner A while in
  A's context keeps partner B's content off it. That argues for:
  - the context being *visible* on every list page (a header chip), not only in the
    nav;
  - deciding carefully whether to default to "all" after a reload.

### 2.9 The Dashboard replaces both index pages

- `/home` and `/partner/[id]` are both section-widget pages (`docs/section-widgets.md`).
  In the new model, one Dashboard follows the context:
  - **Solo:** your cards.
  - **A partnership:** today's partner page, with the header (avatar, role,
    `TimeZoneDisplay`, link to partner settings).
  - **All:** today's `/home`.
- Naming ideas:
  - For the place: **Today**, **Now**, **Overview**, **Home**, **Hub**, or something
    in the app's voice like **Den** or **Lounge**.
  - For the contexts: solo as **Me** / **Just me** / **Solo**; all as
    **Everyone** / **Everything** / **All of us** (it includes you, so "Partners"
    would be wrong).
  - "Today" fits if the Dashboard leans toward due tasks and unread messages, which it
    mostly does already.

### 2.10 Realtime cost in "all"

- A stream is one room: `user:<id>` or `partnership:<id>`. A live notebook list or
  unified inbox in "all" would need **one EventSource per partnership**, plus its
  presence beacons. `docs/realtime.md` puts one idle stream at about 83% of the Free
  plan's daily DO allowance.
- **Options:**
  - Fan out list-level events to `user:<id>` rooms, so one stream per user covers
    "all".
  - Keep "all" lists non-live, refreshing on focus or `invalidate`.

  Recommend the fan-out, for the list topics only. Entry and thread pages stay on their
  own room, since an item has exactly one scope.

### 2.11 External URL contracts that must keep working (308 redirects)

- **Push payloads:** `src/lib/server/push.ts:394` builds
  `/partner/${id}/messages?thread=…`. Notifications already delivered keep it forever.
- **The service worker fallback** is `/home`, and the PWA `start_url` is `/home` in
  `static/site.webmanifest`. Installed home-screen apps keep the old start URL.
- **The post-sign-in default** is `/home`, in `safe-redirect.ts` and the
  login/signup/recover pages.
- **The invite accept redirect** goes to `/partner/${id}`.
- Bookmarks.

**Plan:**

> *Superseded 2026-10-27 by 2C item 3:* there are no redirects. The old URLs 404, and
> `/home` is a temporary redirect to the Dashboard's new URL, `/today`. The original
> plan is kept below for the record.

- Keep `/home/**` and `/partner/[id]/**` as **thin redirect routes** into the new
  paths.
  - **A list URL** (`/home/notebook`, `/partner/<id>/tasks`) sets the context cookie to
    self or that partnership, then redirects to the bare list. The URL named a context,
    and the cookie is now the only place one can live.
  - **An item URL** redirects to the bare item route. Nothing is set, because the item
    carries its own scope.
  - **Use 303/307, not 308**, for the list redirects. A browser caches a 308 forever,
    and these responses depend on a cookie they set.
- Keep `/home` itself as an alias of the Dashboard, so the manifest and older clients
  keep working.

### 2.12 Smaller things that read route ids and will break

- `AppNav.svelte`: active state by `page.route.id`. Its test asserts the tab order.
- `(app)/+layout.svelte`:
  - the full-screen check `endsWith('/notebook/[entryId]/menus/[menuId]')`;
  - `TimezoneWarning` route gating;
  - hiding `HelpRequestCallout` on the partner board.
- `(app)/+error.svelte`: the back link chooses between partner and home.
- `MessageToasts`, `UnreadPartnerLinks`, `HelpRequestCallout`, `ThreadSticker`,
  `GuidesList`, and the kink-list compare page all build `/partner/...` links.
- Hard-coded redirect strings:
  - `notebookPath()` in `notebook-pages.ts`;
  - `board.server.ts`;
  - the tasks/rewards `add` and `[rewardId]` actions.
- Invalidation keys (`tasks:home`, `tasks:partner:${id}`, `notebook:self`,
  `messages:board:${id}`…) need a scope-keyed scheme, such as `tasks:<scope>` plus
  `tasks:all`.
- `/playroom/kink-list/partner/[partnershipId]` folds into the context.
- `answerFromControl` lives only in that kink-list layout today, and is reusable.

### 2.13 Size of the change

- **Route files:** about 2,700 lines of paired route code collapse to about half.
- **Tests:** about 2,600 lines of route tests are rewritten against the merged
  actions.
- **E2E:** 12 e2e specs (about 134 lines) reference `/home` or `/partner` URLs.
- **Docs to update:** `partners.md` (nav tabs), `section-widgets.md`, `tasks.md`,
  `rewards.md`, `notebook.md`, `messaging.md`, `kink-list.md`, `scenes.md`,
  `timezone.md`, `dialogs.md`, `features-and-admin.md`.
- **AGENTS.md:** "`/home` is the signed-in app", the repo map, active-nav guidance.
- **New doc:** `docs/contexts.md`, for the context model.
- **Roadmap entry** if this is on it.
- **No DB migration is needed** for the core change. The only possible one is the
  per-viewer partnership colour, if wanted.

---

## 2A. Assumptions the refactor reopens

### A1. Separate self and partnership tables for tasks and rewards

**The original reasoning** comes from `docs/historical-plans/2026-09-13-rewards.md`
(and tasks copied it on 2026-09-14), restated at `schema/app.ts:241`. It gave three
reasons:

1. **The permission models differ.**
   - Self: the owner manages and claims everything.
   - Partnership: whoever holds `control` manages, and nobody completes or claims what
     they wrote.
2. **One polymorphic table** would push those differences into nullable scope columns
   and "case-heavy queries on every read path".
3. **D1 cost.** The queries stay cheap.

**Does it still hold? Mostly not, and the codebase has already moved past it.**

- **Reason 1 is about logic, not storage.** The permission rules already live in pure
  functions (`canCompleteFromPartnershipView`, `canClaimFromPartnershipView`).
  - The notebook, built five weeks later, has the same kind of difference: a solo entry
    is `edit` for its owner, while a partnership entry has `partner_access` and control
    rules.
  - It handles that with **one table** (`notebook_entries`), nullable
    `owner_id`/`partnership_id`, a `CHECK` for exactly one, and a pure
    `entryAccessFor(scope, …)`. `vaults` uses the same shape.
  - That is the newer precedent, and it has worked.
- **Reason 2 flips under the new design.** "All" becomes a first-class read path.
  - With split tables, every "all" read is a hand-written union of two queries, mapped
    into a common row type.
  - The cost of the split is already visible: `tasks.ts` and `rewards.ts` export
    **17 self/partnership pairs** (`createSelfTask`/`createPartnershipTask`,
    `completeSelfTask`/`completePartnershipTask`, `claimSelfReward`/
    `claimPartnershipReward`, …). That duplication is what then forces the duplicated
    routes.
- **Reason 3 is roughly a wash.**
  - With two indexes, `(owner_id, …)` and `(partnership_id, …)`, SQLite answers
    `owner_id = ? OR partnership_id IN (…)` with a multi-index OR scan, as the
    notebook's indexes already do.
  - Rows read are the same as a union.
- **The shapes already line up.**
  - `self_tasks` deliberately carries `timezone_owner_user_id` "so the scheduling layer
    can treat both scopes uniformly".
  - Both share `sealedContent()`.
- **Sealed records survive a merge with no re-encryption.**
  - The AAD is `kind|recordId|vaultId|version` (`sealedAad`, `src/lib/sealed.ts:276`).
  - The kinds are already scope-free: `task` and `reward` in
    `src/lib/sealed-kinds/tasks.ts`.
  - The ids are UUIDs, so they cannot collide.
  - Copying rows with the same `id` and `vault_id` keeps every ciphertext valid.

**Three options:**

| | Shape | Fit |
|---|---|---|
| **Keep split** | One `ScopedTasks` service interface with two implementations, plus a union | Least migration, but the 17 pairs stay. The route merge only moves the duplication down a layer. |
| **Merge, notebook-style** (recommended unless A2 says groups) | `tasks`, `task_completions`, `rewards`, `reward_claims` with nullable `owner_id`/`partnership_id` + CHECK. `reward_balances(user_id, partnership_id NULL)` with a unique index on `(user_id, coalesce(partnership_id,''))`. `created_by_user_id` is set on solo rows too (= owner). | One code path per operation; matches notebook and vaults; "all" is one query. |
| **"Spaces"** | A first-class `spaces` table: everyone has a solo space, each partnership is a space. Every scoped table gets `space_id NOT NULL`. | Cleanest queries and no nullable scope, but it touches notebook, kink lists, messages, vaults and realtime rooms. Only worth it if groups larger than two are coming. |

**The migration risk is the D1 trap,** not the data:

- The merge is a new table plus `INSERT … SELECT`, then dropping the old tables
  **children first**: completions and claims before tasks and rewards, so no
  `ON DELETE CASCADE` fires.
- `src/lib/server/db/migrations.test.ts` fails on any `DROP TABLE`, so the drops need a
  documented exception there.
- Alternatively, leave the old tables orphaned for one release and drop them later.
- Per memory, real data now exists, so this is a **copy, never a drop-and-recreate**.
- Verify it against local D1 (`npm run test:e2e:worker`), where the cascade trap
  actually shows up.

### A2. A partnership is exactly two people

- `inviter_id`/`invitee_id`, `control ∈ {inviter, invitee, both}`, the "For you / For
  them" split, sealed names stored per role, and `namesForViewer` all assume a pair.
- The context switcher would make a group context easy to *show*. Whether groups are
  ever wanted decides between "merge" and "spaces" in A1. That is the one question that
  changes the data model.

### A3. Each feature has its own scope type

- `NotebookScope` (notebook), `'self' | {partnershipId}` (kink lists), `user:`/
  `partnership:` (realtime rooms), `kind: self|partnership` (vaults), and none at all
  for tasks and rewards.
- The refactor should introduce **one alias-free `Scope`/`Context` type** (say
  `src/lib/context.ts`), next to `partnership.ts`. Each feature adopts it as it moves.
- `NotebookScope` is the template.

### A4. `/home` shows only what you *do*; the partner page shows what you *manage*

- This split exists only because there were two places.
- It is replaced by **To do / Set for others** in every context (2.1).

**Keep `SegmentedTabs`.** "To do / Set for others" replaces the "For you / For them"
tabs on the partner tasks and rewards pages (shown under shared control). That can
leave `src/lib/components/SegmentedTabs.svelte` (with its test and `src/lib/testing/SegmentedTabsHarness.svelte`) with no users.

- **Do not delete it, or its test, as dead code.** The user has other plans for it
  (2026-10-27).

### A5. Credit balances are per partnership, never pooled

- Still sound. A context switcher makes "which balance" clearer, not less clear.
- Keep it. "All" shows one wallet per balance.

### A6. Messages are partnership-only; daydreams and the IQ test are solo-only

- These were fixed partly by where a feature could live.
- With contexts, sharing a daydream with a partner, or a partner context for the
  Playroom, stops needing new routes. This is not in scope; noted so the context type
  doesn't rule it out.

### A7. The partner page is a "place" (header, timezone, link to partner settings)

- It becomes the Dashboard in that partnership's context.
- Partnership management (`settings/partners/[id]`) can be reached from the context
  popover as "Manage …".

### A8. Action names encode the scope (`selfCompleteTask`, `partnerCompleteTask`)

- Replace them with one action per operation that takes the scope in the form (2.6).
- If A1 merges the tables, the server function underneath is one function as well.

### A9. "/ is the landing page; /home is the signed-in app" (AGENTS.md)

- *Revised 2026-10-27:* the Dashboard is **"Today" at `/today`**. `/home` survives only
  as a temporary redirect to it, for old home-screen installs (2C item 3).
- The AGENTS.md wording ("`/home` is the signed-in app") and the route map change to
  `/today`.

## 2B. Spaces

### The model

- **`spaces`:** `id`, `kind` (`solo` | `shared`), timestamps.
  - Every user has exactly one solo space.
  - Every partnership has one shared space.
- **`space_members`:** `space_id`, `user_id`, `can_manage`, `joined_at`, unique on
  `(space_id, user_id)`, indexed on `user_id`.
  - A solo space has one member. A shared space has two today.
  - Nothing in the schema caps the count. Only the invite flow does (see "Kept
    pair-shaped" below).
- *Revised 2026-10-27, after Phase 0:* **the rename was skipped.** drizzle-kit
  emitted the three RENAMEs plus ~28 full rebuilds, because it does not update
  foreign-key names on a renamed table, and a rebuild cascade-deletes on D1. The user
  chose to keep `vaults` / `vault_wraps` / `vault_escrows`. `vaults.space_id` and
  docs/spaces.md carry the relationship. The original decision follows for the
  record.
- **`vaults` is renamed `space_vaults` and gains `space_id`.** *Decided 2026-10-27.*
  Every vault belongs to a space, and the table name now says so.
  - Each space has one current vault. Every content row already references `vault_id`
    with `ON DELETE CASCADE`, so deleting a space's vault already removes its content.
  - **The rename is cheap and safe.** SQLite's `ALTER TABLE … RENAME TO` does not
    rebuild the table, so it avoids the D1 cascade trap, and it rewrites the foreign
    keys that point at it.
    - drizzle-kit asks interactively whether a table was renamed or created. Answer
      "renamed" and read the SQL: it must be a single `RENAME`, never a create, copy
      and drop.
    - Verify it on local D1 with `npm run test:e2e:worker`, like every step of this
      migration.
  - **No ciphertext changes.** The AAD binds the vault's *id*, and the domain strings
    are constants (`bound-up-sealed-v1`, `bound-up-vault-check-v1`), never the table
    name.
  - **Naming elsewhere:**
    - The drizzle export becomes `spaceVaults`.
    - `vault_wraps` and `vault_escrows` become `space_vault_wraps` and
      `space_vault_escrows`, so the family reads together.
    - "Vault" stays the word for the encryption concept in code and docs: `vaultById`,
      `docs/encryption.md`, "Vaults".
  - **The old columns stay** (`kind`, `owner_user_id`, `partnership_id`) along with
    their CHECK, which cannot change without a rebuild. They are written through the
    same helper and are redundant with `space_id`.
  - **The vault is not made the space.** Vault ids are chosen by the browser and bound
    into every ciphertext's AAD. A group losing a member will one day need a *new* key
    (see "The hard part"), and that means a new vault for the same space. A space
    outlives its vaults.
- **Content tables get `space_id`** in place of `owner_id`/`partnership_id`:
  tasks, rewards, credits/balances and claims (via the A1 merge), notebook entries,
  message threads, message tags, kink lists, history restore requests and vault escrows.
  - **Daydreams and their characters and ideas move to the solo space.** *Decided
    2026-10-27.*
    - Daydreams for a partnership may come later. They would then be daydreams in a
      shared space, sealed under that space's vault, with no schema change.
    - The daydream code must take a space, not assume the solo one. Places that read
      "the user's self vault" today become "the daydream's space's vault".
  - Account-level personal data stays user-owned: IQ test results, scene preferences
    and settings.
- **The context becomes trivial.** The cookie holds `all` or a space id.
  - "Everyone" is `space_id IN (my spaces)`, one query per feature.
  - "Me" is the solo space.
  - The switcher lists the user's spaces.
  - The `Scope` type in A3 collapses to a space id plus its kind.
- **Realtime rooms** become `space:<id>`, plus the existing `user:<id>` for per-user
  streams. `mayWatch` checks membership.

### Rules re-expressed in terms of members, now

The point is to remove the "exactly two" assumptions from the database and server
rules while the product still only makes pairs.

- **`control`** (`inviter` | `invitee` | `both`) becomes `space_members.can_manage` per
  member. `both` means both members can manage.
  - The authorship rule (nobody completes or claims what they wrote) is unchanged.
  - `answerFromControl` and the kink-list "control" reading derive from the same rule.
- **Who completes a task, or claims a reward,** is implicit today ("the other
  member"). It becomes an explicit nullable `assignee_user_id` on the merged `tasks`
  and `rewards` tables.
  - In a two-person space it is filled with the other member.
  - It costs nothing now, because those tables are being created anyway, and it is the
    column a group would need.
- **Notebook `partner_access`** ("for the member who did not set it") is read as "for
  every member other than the setter". That generalises without a schema change.
- **Credits** are already per `(space, user)`.
- **Messages:** read state is already per user. "Notify the partner" becomes "notify
  the other members".

### Naming

- **"Partnership" and "partner" stay the user-facing words.** *Decided 2026-10-27.*
  Copy, routes the user sees, and emails keep them.
- **Code and the database talk about spaces and members.**
- **The partnership row** remains the detail record of a shared space: invite, names
  and recovery.

### Kept pair-shaped for now, behind one module (*confirmed 2026-10-27*)

These stay pair-shaped until groups are actually designed. Each needs real product
decisions, not just plumbing.

- **Invites.** The invite token and key stay on the partnership row, which becomes a
  detail record of a shared space (`partnerships.space_id`, unique). An N-person
  invite flow is a later `space_invites` table.
- **Sealed names.** Today these are stored per role: "what do they call you" and
  "what's their name". `namesForViewer` (invariant 12) keeps mapping them for two.
  Groups need per-member display names, which is a design question, not a column.
- **Partner-assisted sign-in.** Escrow and approval trust a *person*. It keys on the
  shared space's membership, with the existing one-helper rule.

### The hard part, deferred and recorded

- **Removing one member from a space that continues.** Today ending a partnership
  deletes the shared vault and everything in it.
- In a group, the others keep the space. So the leaver's copy of the key must stop
  opening anything new. That means rotating to a new vault and re-wrapping for the
  remaining members, and either re-sealing old content or accepting that the leaver
  could read what existed before they left.
- This is why the vault stays separate from the space. It does not need solving until
  a space can have three members.

### Migration

- **IDs.** Each partnership's shared space takes **the partnership's own id**. Then
  every existing `partnership_id` value is already a valid `space_id`, and the backfill
  is a copy.
- **Solo spaces** get new ids, one per user, created in the same migration. Sign-up
  creates one from then on.
- **No rebuilds where avoidable.** This is the D1 trap again: a rebuild's
  `DROP TABLE` fires every cascade pointing at the table.
  - **Tables that already exist** (notebook entries, message threads and tags, kink
    lists, vaults, escrows, restore requests) get `space_id` by `ALTER TABLE … ADD
    COLUMN` and a backfill.
  - **Their old columns and CHECK constraints stay** and keep being written through a
    single helper. `notebook_entries_one_scope` and `vaults_scope_matches_kind` cannot
    change without a rebuild.
  - A column added this way gets **no `ON DELETE` action**. That is acceptable because
    content already cascades through `vault_id`. Deleting a space deletes its vaults
    explicitly.
- **The A1 merged tables** (`tasks`, `rewards` and so on) are new, so they get
  `space_id NOT NULL REFERENCES spaces ON DELETE CASCADE` properly.
- **Old task and reward tables** are dropped children first, with the documented
  `migrations.test.ts` exception, as already planned.
- **Verify every step against local D1** (`npm run test:e2e:worker`). Real data exists,
  so everything is copied and nothing is dropped and recreated.

### Docs and invariants this touches

- `docs/encryption.md` (vaults per space)
- `docs/partners.md` (control as `can_manage`; a partnership as a shared space's
  details)
- `docs/realtime.md` (rooms)
- `docs/notebook.md`, `docs/tasks.md`, `docs/rewards.md`, `docs/kink-list.md`,
  `docs/messaging.md`, `docs/account-recovery.md`
- `AGENTS.md`: invariant 12 is reworded, and the repo map gains `src/lib/spaces.ts`.
- A new `docs/spaces.md` covering the model, membership, what is still pair-shaped,
  and the deferred member-removal problem.

## 2C. Adjacent work folded in (*agreed 2026-10-27*)

### The rule for anything kept "for legacy reasons"

The user set this rule.

- **Drop it** if the worst case without it is that someone reloads the page, or lands on
  a 404 and navigates on.
- **Keep it only** to avoid losing data, until everyone whose data it is has used the
  app and so run the migration.
- **Anything kept** goes in `docs/temporary-code.md` with what it is, where it lives,
  what removes the need for it (a query where possible) and what to delete. Every
  touch point carries a `LEGACY-SPACES` comment, so `grep -rn 'LEGACY-SPACES' src`
  lists them all, as `LEGACY-RICHTEXT` does today.
- **Production has two users:** the user and their partner. The user arranges any
  sign-ins a migration needs.

### 1. Finish the old migrations before the table merge, then delete them

- **Run the production check** at
  `/private/tmp/claude-501/-Users-callumgare-repos-bound-up/8e7dc04a-b4ca-41f0-8ab5-976ed213fa92/scratchpad/legacy-data-check.sql`
  (read-only):
  `npx wrangler d1 execute bound-up --remote --file=<that file>`
  - It lists every row still waiting for a device to move it into a vault, grouped by
    what it is and **whose sign-in moves it**:
    - the owner, for their own items;
    - the member holding control, for partnership tasks, rewards and names;
    - either member, for completions, claims, tags, messages and reactions.
  - It covers four sections of `docs/temporary-code.md`: tasks and rewards in
    plaintext, messages in the original scheme, legacy markdown rich text, and
    plaintext tag and partnership names.
  - It ran clean against the local dev DB.
  - **Rows nobody can read** (old-scheme messages encrypted to keys both partners lost)
    are the residue that doc already accepts. They are not a blocker.
- **Result, 2026-10-27: production reads zero on all thirteen counts.** Nothing is left
  to move, so no one needs to sign in.
  - The check that worked is the single-statement count query in
    `legacy-counts.sql`, run with `--remote --json --command`. Wrangler's `--file`
    path imports without returning rows, and D1 refuses a 13-term `UNION`.
  - **Caveat for the rich-text cleanup:** `docs/temporary-code.md` also wants margin
    for "a client still holding an unsynced draft".
    - When implementing, check whether message drafts on the device go through
      `parseStoredRichText`'s legacy branch.
    - *Decided 2026-10-27:* the user accepts losing a pre-rich-text draft in this one
      case. Delete the legacy branch outright, with no `LEGACY-SPACES` keep and no
      sign-in step.
    - This is a one-off exception to "Never lose something a user typed", not a change
      to that convention.
- **Once production reads zero** (it does):
  - **The merged `tasks` and `rewards` tables are created sealed-only**, with no
    plaintext columns.
  - **Delete the temporary code for all four sections** as their "What to remove"
    lists say, including `/api/sealing/[scope]`, `content-sealing`, the
    original-scheme message code and the legacy rich-text code. None of it is ported
    to spaces.
  - **Drop the plaintext columns that survive on existing tables:**
    - the partnership names and roles;
    - `message_tags.name`;
    - `messages.body_format`.
    `DROP COLUMN` is an ALTER, not a rebuild. Remove each section from
    `docs/temporary-code.md`.
- **Kink list temporary code:** the numbers-as-levels and own-kinks sections.
  - Their removal criterion is "before the first deploy".
  - *Checked 2026-10-27:* the kink list **has** shipped (in release tags since
    v1.10.0), so its saved lists in production may still hold the old shapes. Its
    payloads are sealed, so no query can tell.
  - **Both sections stay.** They are out of scope for this work.
- **Self-hosted instances.** The Docker image is published, so other instances may
  hold rows nobody there has migrated.
  - Deleting the migration code strands their plaintext rows, and dropping the
    columns deletes them.
  - *Answered 2026-10-27:* none matter, so nothing is kept for them. A release-note
    line records that pre-vault data from very old versions is no longer read.

### 2. Removing a space removes everything

- Ending a partnership and deleting an account delete the space, its vaults and every
  row with its `space_id`, explicitly and in one `db.batch()`.
  - The `space_id` columns added to existing tables carry no `ON DELETE` (AGENTS.md
    trap), so cascades cannot be relied on.
  - This rewrites `deletePartnership` (`src/lib/server/partnerships.ts:501`), which
    today deletes one row and trusts the cascades.
- **A "no orphans" test**: a server test creates content in every space-scoped table,
  ends the partnership and deletes the account, then asserts zero rows anywhere with
  that `space_id`.
  - It enumerates the tables from the schema, so a new space-scoped table without
    cleanup fails it.

### 3. API routes and form actions move to spaces, with no aliases

- **What moves:**
  - `/api/partnerships/[id]/…`, `/api/kink-lists/[scope]` and `/api/vaults/[id]`
    become `/api/spaces/[spaceId]/…`.
  - `/api/sealing/[scope]` is deleted under item 1.
  - The scope-named form actions (`selfCompleteTask`, `partnerCompleteTask`, …) become
    one action each.
- **No aliases for the old ones, per the rule.**
  - A tab left open across the deploy gets a failure the next time it calls one.
  - That failure is reported through `reportRequestFailure`, the app-wide notice.
  - The open tab is told an update is ready (docs/versions-and-updates.md), and a
    reload fixes it.
  - Nothing typed is lost: message drafts and the notebook outbox are on the device
    until the server confirms them.
- **Old page URLs (2.11) get no redirects either.** `/partner/[id]/**` and
  `/home/<feature>/**` simply 404.
  - The worst case is an old notification or bookmark landing on the error page, which
    links back into the app.
  - **The exception is `/home`, which redirects to `/today`.** *Revised 2026-10-27,
    when the Dashboard became `/today`.*
    - An app installed to the home screen on iOS keeps the `start_url` it was
      installed with and never refetches the manifest. Without the redirect, every
      launch of an existing install would land on a 404, and reloading wouldn't fix it.
    - That fails the "worst case is a reload" test, so it is kept.
    - It carries `LEGACY-SPACES` and an entry in `docs/temporary-code.md`. Its removal
      criterion is "the user and their partner have re-added the app to their home
      screens".
    - Use a 307, not a 308, so a browser doesn't cache it for ever.
  - **This replaces the redirect plan in 2.11.**

### 4. Data on the device, keyed by scope

- **Message drafts.** Drafts for a new thread are keyed by partnership id
  (`src/lib/messaging/drafts.ts`). Shared spaces reuse partnership ids, so these keep
  working with no change.
- **The notebook outbox** is keyed by entry id, so it is unaffected.
- **Anything keyed `'self'` loses its key** when the solo space gets a real id. The
  kink-list device store (`src/lib/kink-list/store.svelte.ts`) and the keystore and
  notification stores are the ones to audit.
  - Each such store reads the old key once, writes the new one, and deletes the old.
  - That read is **kept code**, so it carries a `LEGACY-SPACES` comment and an entry in
    `docs/temporary-code.md`.
  - Its removal criterion is "the user and their partner have opened the app on every
    device they use". The server cannot see device storage, so this is the one
    criterion that is a promise rather than a query.
  - **If the audit finds only stores whose loss costs nothing** (dismissed hints, say),
    drop them per the rule instead.

### 5. Spaces in the test fixtures from Phase 0

- `createTestUser`, the partnership fixtures in `src/lib/testing/fixtures.ts`, and
  `newAccount`/`newAccounts` in `e2e/accounts.ts` (which write accounts straight to
  the DB) create a solo space per user, and a shared space and members per partnership.
- With that in place, every test in every later phase runs on spaces without extra
  work.

## 3. Recommended phasing (each phase shippable)

-1. **Clear the old migrations** (2C item 1). *Added 2026-10-27.*
   - The production check read zero on 2026-10-27, so this phase is purely deletion.
   - Then delete the four temporary-code sections and drop their columns.
   - This happens before anything else, so nothing old is ported to spaces.
0. **Spaces foundation.** *Added 2026-10-27. Done: commit 0eca6ac.*
   - Includes 2C items 2, 4 and 5: explicit deletion and the no-orphans test, the
     device-store audit, and the fixtures.
   - Add `spaces` and `space_members`, a solo space per user, and a shared space per
     partnership (with the same id).
   - Rename `vaults` to `space_vaults` (and the wraps and escrows tables to match), then
     add `space_id` there and on the content tables, with their backfill.
   - Add membership helpers replacing the per-feature `require…Membership` checks, and
     `can_manage` replacing `control`.
   - No UI change. Every later phase builds on it.

1. *Revised 2026-10-27:* **merged into phase 2.** Wiring the switcher onto the old
   `/home` and `/partner` routes would be thrown away when they merge, so the context
   infrastructure, the switcher and the colours land with the first merged feature.
   The original wording follows for the record.
   **Context infrastructure plus switcher on the *existing* routes.**
   - Add `locals.context()` and the context cookie, `invalidate('app:context')`, and
     the top-right switcher.
   - Add the per-viewer colour column and picker (in `settings/partners/[id]`).
   - Map the current route id to its counterpart in the other context, for example
     `/home/notebook` to `/partner/X/notebook`.
   - This removes the "go back to the index" pain immediately, with no route merge.
2. **Notebook.**
   - New `/notebook`, `/notebook/[entryId]` and `/notebook/[entryId]/menus/[menuId]`
     over the existing `NotebookScope` code.
   - Add the "all" list query and the create-target picker.
   - Make the old routes 308 redirects.
3. **Tasks and rewards.**
   - If A1 is "merge", run the table merge first as its own migration and commit:
     copy the rows, then collapse the 17 server pairs to one each with no route
     changes. Then do the route merge on top.
   - Add scope-explicit server entry points and one set of actions that take
     `scope`/`partnershipId` in the form.
   - Build the To do / Set for others model, keeping rewards grouped by wallet.
   - Make the old routes redirects.
4. **Messages.** `/messages` and `/messages/[threadId]`, the unified inbox for "all",
   and updated push URLs (old ones redirect).
5. **Dashboard** merges `/home` and `/partner/[id]` and follows the context. Rewire
   the post-sign-in default, the invite redirect and the manifest.
6. **Realtime fan-out** to user rooms for the "all" lists.
7. **Final nav layout.** Remove the partner tabs and delete the redirect-only code
   paths that are safe to drop (keep `/home` and push URLs indefinitely).

Each phase includes, per AGENTS.md:

- tests at the cheapest level, plus e2e for switching and redirects;
- updated docs;
- a copy of the plan into `docs/historical-plans/`.

## 4. Decisions (answered 2026-10-27)

1. **Where context lives: cookie only.** *Revised 2026-10-27, replacing hybrid.*
   - One cookie per device; URLs never carry a context.
   - Item pages still take their scope from the item.
   - Tabs share the context, and Back doesn't undo a switch.
   - Writes always name their scope explicitly (2.6).
   - Details are in 2.7.
2. **Nav: 5 slots** — Dashboard · Tasks (Rewards as a tab inside it) · Notebook ·
   Messages · Settings.
   - Playroom and Daydreams stay Dashboard cards.
   - *Revised 2026-10-27:* the context switcher is no longer a nav slot.
3. **The context switcher sits top right** on every context-dependent page (option I
   from the mockups); Settings has no switcher.
   - **The control:** a pill whose left end is the context's avatar at full control
     height, then the name and a caret.
   - **Tap:** the contexts fan out on a quarter-circle around the screen's top-right
     corner.
   - **Press and hold, or press and drag:** opens the same fan. Releasing over an
     avatar picks it.
   - **Keyboard:** Enter or Space toggles the fan. The avatars are buttons.
   - **The Everyone avatar is the "avatar pie" for now** (*decided 2026-10-27*, open to
     revisiting). The pattern comes from Teams and Fluent 2's avatar group.
     - One slice per person, in their colour: you first in amber, then each partner in
       the colour you gave them. Thin dark gaps separate the slices.
     - Each slice carries that person's initials once the avatar is 36px or larger.
       Below that it is colour only.
     - Partner initials come from sealed names, so they show "…" until the vaults open,
       as names do everywhere else.
     - The other candidates are on the canvas's two "Everyone avatar" boards.
   - **Not decided yet:** whether a dot for unread items in another context (option F)
     goes on the control.
3. **Default context: the last one used**, kept per device in the cookie. The first
   ever load is "all".
4. **Per-viewer partnership colour**, from a closed palette.
   - Stored per member, so it needs a small migration
     (`drizzle-kit generate --name add_partnership_colour`).
   - It lands in phase 1 with the switcher.
5. **Tables (A1): merge, notebook-style.**
   - Tables: `tasks`, `task_completions`, `rewards`, `reward_claims`,
     `reward_balances`.
   - Each is keyed by `space_id` (2B) rather than nullable owner/partnership columns,
     and `tasks`/`rewards` carry `assignee_user_id`.
   - Rows are copied, never dropped and recreated. The old tables are dropped children
     first, with a documented exception in `migrations.test.ts`.
   - This is its own phase, before the task and reward routes merge.
6. **Spaces (A2).** *Revised 2026-10-27, replacing "nullable owner/partnership
   columns".*
   - Solo and every partnership each get a **space**. Scoped data belongs to a space,
     and access goes through **space membership**, not through the partnership row or
     an owner column.
   - The goal is that broadening partnerships to more than two people later needs no
     database or low-level rework.
   - The design is in 2B. The tables merged in A1 are created with `space_id` from the
     start.
7. **No self-hosted instances whose data matters** (*answered 2026-10-27*).
   - The old migration code is deleted outright, with no upgrade-path note.
   - `docs/self-hosting.md` still gets a line in the release notes saying unmigrated
     pre-vault data from very old versions is no longer read.
8. **Names** (*decided 2026-10-27*, see 2.9):
   - **The Dashboard is "Today"**, at **`/today`**. It replaces `/home`.
   - **The solo context is "Me".**
   - **The all context is "Everyone".**
   - Code keeps `solo`/`all` and spaces; these are the words users see.
   - **What moves to `/today`:**
     - the post-sign-in default (`src/lib/safe-redirect.ts` and the
       login/signup/recover pages);
     - the landing page's "Open" button;
     - the invite-accept redirect;
     - the service worker's and `notifications.ts`'s fallback `navigate`;
     - `static/site.webmanifest`'s `start_url`;
     - AGENTS.md ("`/home` is the signed-in app").
   - **One redirect stays: `/home` → `/today`.** See 2C item 3.

## 6. Design mockups (next step)

### Sketches

**Nav, closed.** The context slot shows the current context, with the others peeking
out behind it.

```
┌──────────────────────────────────────────────┐
│  ⌂        ☑         📓        💬      (Jn)◖◖  │
│ Today   Tasks   Notebook  Messages   Jun     │
└──────────────────────────────────────────────┘
```

**Switcher, open.** The context icons spring up in a column above the slot. The
current one is ringed. Settings is at the foot.

```
                                   ╭────────────╮
                                   │ ◉ Everyone │
                                   │ (Me) Me    │
                                   │ (Ad) Ada   │
                                   │ ((Jn)) Jun │ ← current, ringed
                                   │ ─────────  │
                                   │ ⚙ Settings │
                                   ╰────────────╯
```

**Tasks in "Everyone".** Rows from every scope, each with a scope chip. Credit balances
show as pills, one per balance.

```
 Tasks                       [Me 12] [Ada 4] [Jun 9]
 ┌ To do ──────────────────────────────────────┐
 │ ○ Morning stretch          (Me)   +2  9am   │
 │ ○ Write Jun a note          (Jn)  +5  Jun's │
 │ ○ Plan Friday               (Ad)  +3  Fri   │
 └─────────────────────────────────────────────┘
 ┌ Set for others ─────────────────────────────┐
 │ · Evening walk          for (Jn)   repeats  │
 └─────────────────────────────────────────────┘
                     [ Tasks | Rewards ]           (+)
```

**Rewards in "Everyone".** One wallet per balance, never merged.

**Create in "Everyone".** A "For whom?" picker defaulted to the last one used:
`(Me) (Ad) (Jn)`.

**Messages in "Me".** An empty state with a one-tap switch: "Messages are between you
and a partner — [Switch to Jun] [Switch to Ada]".

**Dashboard ("Today")** in each context:

- **Me:** solo cards.
- **Jun:** the partner header (avatar, role, Jun's time), then messages, tasks, rewards,
  notebook and kink-list cards.
- **Everyone:** today's `/home`, with unread messages at the top.

**Context chip on every list page's header.** For example "Notebook · with Jun ▾", which
opens the same switcher. This covers the privacy point in 2.8.

### The artifact to build

Build one self-contained HTML page in the scratchpad, published as a private Artifact
(icon "layout"). It contains:

- **An interactive phone-frame prototype.**
  - Bottom nav. Tapping the context slot springs the contexts up. The motion is
    removed under `prefers-reduced-motion`.
  - Switching context re-renders the current page in place: Today, Tasks (with
    Rewards tab), Notebook and Messages, for Me, Ada, Jun and Everyone.
  - The "For whom?" sheet, and the empty state for messages in "Me".
- **A side-by-side "today vs proposed" strip**, showing the 3-tap route from Jun's
  notebook to Ada's notebook today against 2 taps proposed.
- **A naming panel.** Toggle Dashboard names (Today / Home / Overview / Den) and context
  names (Me / Just me / Solo; Everyone / All of us / Everything), with the prototype
  relabelled live.
- **A variant toggle for the closed switcher:** stacked peeking avatars, a ringed avatar
  with a count badge, or a pill with the name.
- **Styling:** follows `src/lib/theme.css`.
  - Always dark: surfaces at `oklch(21% 0.055 37)` / raised `oklch(26% 0.065 38)`.
  - Amber accent `#ffac00`, text `oklch(94% 0.035 78)`.
  - Rethink Sans for the body, a heavy display face for titles.
  - Per-viewer partnership colours from a small closed palette.
- **Data:** placeholder names only (Ada, Jun), no real content. It mocks the
  structure, not the adult prose.
- **Short notes beside each screen,** linking each one back to the relevant analysis
  section.

## 5. Verification (when implementing)

- `npm run check`, `npm run lint` and `npm test`, plus
  `npx playwright test e2e/<feature>.spec.ts` per phase, and the full
  `npm run test:e2e` and `npm run test:e2e:worker` before done (because of the
  realtime changes).
- New e2e coverage:
  - switching context keeps you on the same URL and feature, and re-filters it;
  - a second tab switching context does not change where the first tab's write
    lands;
  - a tab brought back to the foreground after another tab switched context
    re-renders in the new context;
  - a push notification sent after the change opens the right item, and an old
    `/partner/…` URL shows the error page with a way back into the app;
  - a tab open across the change gets the failure notice and the update prompt when it
    calls a removed action, and its unsent message draft survives the reload;
  - ending a partnership and deleting an account leave no rows behind (the no-orphans
    test, 2C item 2);
  - an item page opened from another context shows the right scope;
  - "all" lists show rows from several vaults with partner badges;
  - creating in "all" asks for a target.
