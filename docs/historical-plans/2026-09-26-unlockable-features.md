# Unlockable features: per-account access, the admin role, and guides as the first gated feature

## Context

Some features will eventually be paid for. Payment is out of scope for now,
but the question it will answer ("may this account use feature X?") needs to
exist today, so specific accounts can be given features that other accounts do
not have. Decisions already made:

- **Access is granted from an admin page in the app.** Admin is Better Auth's
  **admin plugin**, and **the first account ever created becomes admin**, so
  there is a way to create every later admin.
- **Guides are the first gated feature.** They are currently hidden (commit
  `2ba6bb1`): the `/home` card is removed, but `/home/guides` still loads for
  anyone who has the link. After this change an account that has been granted
  `guides` gets the card and the pages back. Any other account gets a 403.
- **Access is per account.** A partner does not inherit it. The model leaves
  room to add partnership sharing later.

A grant is stored as a row, which is the same shape a purchase will need.
Adding purchases later means a new `source` value and a new writer, not a
redesign.

## Data model

**`user_features`** (`schema/app.ts`) is one row per (user, feature) the user holds:

- `id` text UUID PK; `userId` FK → `user.id`, `onDelete: 'cascade'`
- `feature` text, `$type<FeatureKey>()`
- `source` text, `$type<FeatureSource>()`. For now it is always `'grant'`.
  `'purchase'` is reserved and is not written by anything yet.
- `grantedByUserId` nullable FK → `user.id`, `onDelete: 'set null'`, for the
  audit trail.
- `...timestamps`
- `uniqueIndex('user_features_user_feature_idx').on(userId, feature)` makes
  granting idempotent and doubles as the index for "this user's features".
- Export `UserFeature` / `NewUserFeature`.

There is no expiry column. Nothing needs one yet, and a column that nothing
reads would only look as though it did something. Revoking a feature deletes
its row.

**The admin plugin's user and session columns** (`role`, `banned`, `banReason`,
`banExpires`, `session.impersonatedBy`) come from `npm run auth:schema`. They
land in `schema/auth.ts` (invariant 7).

**Migrations**, all made with drizzle-kit:

1. `drizzle-kit generate --name add_admin_and_user_features`, generated
   from the two schema changes above.
2. `drizzle-kit generate --custom --name promote_first_user_to_admin`. This
   migration **is** the first-account rule, and it has two statements
   separated by `--> statement-breakpoint`:
   - A SQLite trigger, `user_first_account_is_admin`:
     `AFTER INSERT ON user WHEN (SELECT count(*) FROM user) = 1 BEGIN UPDATE
     user SET role = 'admin' WHERE id = NEW.id; END`. It fires however the row
     arrives: Better Auth signup, a fixture, or raw `wrangler d1 execute`.
     That is why it lives in the database rather than in an auth hook. D1
     supports triggers. `npm run preview` (which runs `wrangler d1 migrations
     apply`) is the check that wrangler's SQL splitter accepts the `BEGIN … END`
     body.
   - A one-off `UPDATE user SET role = 'admin'` for the earliest existing user
     (`ORDER BY created_at, id LIMIT 1`), and only when no admin exists yet.
     Existing databases (your `local.db`, and production if it has an
     account) already have their first account, which the trigger will never
     see. On a fresh database this is a no-op.
   - The migration's header comment explains both statements, and the known
     gap: on a fresh deployment, whoever signs up first becomes admin.

## Feature registry (pure, alias-free)

The new file **`src/lib/features.ts`** is alias-free so the schema can import
its types. It holds:

- `FEATURES = { guides: { name: 'Guides', description: '…' } } as const`. This
  is the single list, and the admin page renders from it.
- `type FeatureKey = keyof typeof FEATURES`, `FEATURE_KEYS`,
  `isFeatureKey(value)`, and `type FeatureSource = 'grant' | 'purchase'`.
- `hasFeature(features: readonly FeatureKey[], key)`.

## Admin role

In `src/lib/server/auth.ts`, add `admin()` from `better-auth/plugins/admin`
before `sveltekitCookies`, with a comment explaining each choice:

- **A narrowed `admin` role**, built with `createAccessControl(defaultStatements)`:
  `user: ['list', 'get', 'set-role']` and `session: ['list', 'revoke']`. This
  role deliberately drops the following permissions, because each one breaks
  a promise this app makes:
  - `impersonate` would give an admin a session inside someone's private
    partner data.
  - `set-password` and `create` would produce a credential with no password
    wrap, which leaves an account that can never unlock
    (docs/encryption.md).
  - `set-email`, `update` and `delete` have no use case yet.
  - `ban` is left out as well, because no screen uses it.
  - The `/api/auth/admin/*` endpoints still exist, but they refuse everything
    outside this list.
- There is no signup hook for the first-account rule. The trigger in migration
  2 does it. The plugin's own before-hook writes `role: 'user'` on insert,
  and the trigger then overwrites it, because an `AFTER INSERT` trigger runs
  after that value has been written.

The new file **`src/lib/server/admin.ts`** holds:

- `isAdmin(user)`, which is `user?.role === 'admin'`.
- `requireAdmin(locals)`, which returns the user or throws `error(404)`. A 404
  rather than a 403 so the page does not advertise that it exists. Every admin
  **load and action** calls it, because actions run before layout loads, so a
  layout guard alone does not gate them (invariant 14 and the route recipe).

## Server feature access

The new file **`src/lib/server/features.ts`** holds:

- `listUserFeatures(db, userId): Promise<FeatureKey[]>`. It selects `feature`
  only and filters through `isFeatureKey`, so a row for a feature later
  removed from code is ignored rather than crashing.
- `grantFeature(db, { userId, feature, grantedByUserId })`, which uses
  `onConflictDoNothing`.
- `revokeFeature(db, userId, feature)`.
- `requireFeature(db, userId, feature)`, which throws `error(403, 'Your account
  does not have access to <name>.')`.

## Page data

- `(auth-required)/(app)/+layout.server.ts` adds `features` (from
  `listUserFeatures`, in the existing `Promise.all`) and `isAdmin` (from
  `locals.user.role`) to its return. It goes here rather than in the root
  layout because the root layout makes no queries and serves anonymous pages.
  It also returns a boolean rather than the role (never return the user row
  wholesale). The layout degrade path returns `features: []` and
  `isAdmin: false`.
- Pages must **not** use this layout data to enforce access. It only decides
  what to show. Enforcement stays in each page's own load or action.

## Gating guides

- `home/guides/+page.server.ts` and `home/guides/[id]/+page.server.ts` call
  `await requireFeature(locals.db, locals.user.id, 'guides')` before querying,
  with a narrow on `locals.user`.
- The `home/+page.server.ts` load reads `features` from the `parent()` it
  already awaits. When `guides` is present, it restores the removed query from
  `2ba6bb1` (preview limit 3, ordered by `createdAt` then `id`, with a separate
  `$count`) and returns `guides`. Otherwise it runs no query and returns
  `guides: null`. The `emptyPage()` path returns `guides: null` too.
- `home/+page.svelte` renders `<GuidesWidget>` again, only when `data.guides`
  is set. This replaces the "No GuidesWidget for now" comment with the reason
  the card is conditional.
- `e2e/encryption.spec.ts:408` and `e2e/passkey.spec.ts:287` use
  `/home/guides` only as "some signed-in page". Switch both to
  `/home/tasks` so they do not start hitting the new 403.

## Admin pages

These live in `(auth-required)/(app)/admin/`, inside the app shell.

- `+layout.server.ts` calls `requireAdmin` as a first line of defence. The
  page loads and actions still call it themselves.
- `admin/+page.svelte` with `+page.server.ts` is a user search. It is a GET
  form with `?q=` because searching is navigation, not a mutation, which is a
  documented deviation from superforms. The load matches emails with `like` in
  Drizzle, selects explicit columns (id, name, email, role), and uses
  `limit 20`.
- `admin/users/[id]/+page.svelte` with `+page.server.ts` shows name, email and
  role, and has:
  - **Features**: one row per `FEATURES` entry, showing whether the user holds
    it, where it came from, and who granted it, with a Grant or Revoke button.
    The actions are `grantFeature` and `revokeFeature`, backed by the schema
    `src/lib/schemas/featureGrantForm.ts` (`feature: z.enum(FEATURE_KEYS)`),
    which uses superforms with a distinct `id` per form.
  - **Admin**: Make admin or Remove admin. The action `setRole` goes through
    `locals.auth.api.setRole({ body, headers })`, so the plugin's permission
    check applies too, and maps `APIError` to `setError`. The schema is
    `src/lib/schemas/adminRoleForm.ts`. Removing your *own* admin role is
    refused on the server so an admin cannot lock themselves out.
  - The `wa-*` components are `wa-button` and `wa-badge`; the imports get
    added to `src/lib/webawesome.ts` if they are missing.
- In `settings/+page.svelte`, add an "Admin" row to the list, shown only when
  `page.data.isAdmin`.

## The first-account rule in tests

The trigger is part of the committed migrations, so it runs wherever they are
applied:

- **Server tests**: in every `createTestDb()`, the first `createTestUser` would
  become admin. `createTestUser` gains a `role` option, default `'user'`, and
  writes it explicitly after the insert. That way a fixture's role is always
  what the test asked for, never an accident of creation order. Admin tests
  pass `role: 'admin'`.
- **E2E**: whichever worker signs up first in a run becomes admin. That is the
  real rule, so there is no placeholder row. Specs make their roles explicit
  instead. `e2e/admin.spec.ts` sets the admin's role to `'admin'` and the
  ordinary user's to `'user'` by SQL against `E2E_DATABASE_URL`, the same way
  `timezone.spec.ts` already opens that database. No spec may assume that a
  fresh account is not an admin without setting it.

## Tests

- **Pure** (`src/lib/features.test.ts`): `isFeatureKey` and `hasFeature`.
- **Server** (`src/lib/server/features.test.ts` and `admin.test.ts`, run with
  `createTestDb`):
  - Granting is idempotent, and revoking removes the row.
  - The list filters unknown keys, and rows cascade on user delete.
  - `requireFeature` throws 403.
  - `requireAdmin` throws 404 for a non-admin and for no user.
  - The trigger: a raw insert into an empty test DB leaves that user as admin,
    and a second insert leaves the second user as `'user'`.
- **Route server tests**:
  - The guides list and `[id]` loads return 403 without the feature and data
    with it.
  - The `/home` load returns `guides: null` without the feature, and the
    preview and total with it (update the existing expectation in
    `home/page.server.test.ts`).
  - `layout.server.test.ts` covers `features` and `isAdmin`.
  - The admin loads and each action return 404 for a non-admin. That includes
    posting to an action directly.
  - Grant and revoke write and delete the row, with `grantedByUserId` set.
  - The self-demotion refusal.
- **Component**: `settings/page.svelte.test.ts` shows the Admin link only for
  an admin.
- **E2E** (`e2e/admin.spec.ts`), with an admin context and a user context:
  1. The user gets a 403 at `/home/guides` and has no guides card.
  2. The admin searches for the user and grants guides.
  3. The user now sees the card and `/home/guides`.
  4. The admin revokes, and the user is back to a 403.
  5. The admin makes the user an admin, and the user now sees the Settings
     Admin link.
  6. A non-admin gets a 404 at `/admin`.

## Docs

- A new `docs/features-and-admin.md` covers the registry, the table, the grant
  flow, where checks must live (server, per load or action, never the layout
  flag), the admin role and why its permissions are narrowed, the first-user
  bootstrap and its gap on a fresh deploy, how purchases slot in later, and how
  to add a new feature. Add it to the AGENTS.md feature-docs table.
- `docs/section-widgets.md` changes to say the Guides card shows only to
  accounts holding `guides`, with the query restored.
- `AGENTS.md` gets a short Convention: a gated feature is enforced with
  `requireFeature` in every load and action that serves it, and `page.data.features`
  is for display only. The repo map gains a row for `src/lib/features.ts`.
- `README.md` gets a line on becoming the first admin.
- Copy this plan to `docs/historical-plans/2026-09-26-unlockable-features.md`.

## Critical files

- `src/lib/server/auth.ts`, `src/lib/server/db/schema/{auth,app}.ts`, and
  `drizzle/` (generated)
- New: `src/lib/features.ts`, `src/lib/server/features.ts`,
  `src/lib/server/admin.ts`, `src/lib/schemas/{featureGrantForm,adminRoleForm}.ts`,
  `src/routes/(auth-required)/(app)/admin/**`
- `src/routes/(auth-required)/(app)/+layout.server.ts`, and `home/+page.server.ts`
  / `+page.svelte`, `home/guides/**/+page.server.ts`, `settings/+page.svelte`
- `src/lib/testing/fixtures.ts` (the `role` option), `e2e/encryption.spec.ts`,
  `e2e/passkey.spec.ts`, and the new `e2e/admin.spec.ts`
- Reuse: `GuidesWidget.svelte` and `GuidesWidgetView` (kept for this), the
  `timestamps` helper, `createTestDb` / `createTestUser` / `fakeEvent` /
  `runAction` / `runAndCatch`, and `InputField.svelte`

## Verification

1. `npm run auth:schema`, then the two `drizzle-kit generate` commands. Read
   both SQL files, then run `npm run db:migrate:dev` and confirm your own
   earliest `local.db` account now has `role = 'admin'`.
2. `npm run check`, `npm run lint` and `npm test` should all be clean.
3. `npm run dev`: as admin, open Settings → Admin, find a second account, grant
   Guides, and confirm that account sees the card and pages. Then revoke it.
4. `npm run preview` (auth plugin and bundle change), and load a page signed in.
