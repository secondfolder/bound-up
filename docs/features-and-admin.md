# Features and admin

Some parts of the app are **features**: off for every account until that
account is given them. Nothing can be bought yet; for now an admin grants a
feature from the admin page. When purchases arrive, buying a feature will write
the same row a grant does, so nothing that checks access has to change.

Guides are the first, and so far only, feature.

## The pieces

| Piece                           | What it is                                                             |
| ------------------------------- | ---------------------------------------------------------------------- |
| `src/lib/features.ts`           | `FEATURES`, the registry: every feature's key, name and description    |
| `user_features` (`schema/app`)  | One row per (user, feature) held. No row, no feature                   |
| `src/lib/server/features.ts`    | `requireFeature`, `listUserFeatures`, `grantFeature`, `revokeFeature`  |
| `user.role` (`schema/auth`)     | Better Auth's admin plugin: `'admin'`, `'user'`, or null (pre-plugin)  |
| `src/lib/server/admin.ts`       | `requireAdmin`, `isAdmin`, and the admin page's queries                |
| `/admin`, `/admin/users/[id]`   | Find an account; grant or revoke features; make or unmake an admin     |

## Features

### The registry

`FEATURES` in `src/lib/features.ts` is the one list. The admin page renders a
row per entry, so adding an entry is all it takes for a feature to become
grantable. The file is alias-free because the Drizzle schema imports
`FeatureKey` from it.

### The table

`user_features` holds `user_id`, `feature`, `source` and `granted_by_user_id`,
unique on `(user_id, feature)`:

- **Revoking deletes the row.** "Holds it" is "a row exists", with no flag or
  expiry to also check. Add an expiry column when something needs one.
- **`source` is `'grant'` or `'purchase'`.** Only `'grant'` is written today.
  `'purchase'` is in the type now so the column does not have to widen later,
  and the admin page already labels it.
- **`granted_by_user_id` is `ON DELETE SET NULL`.** A grant outlives the admin
  who made it. Deleting the account that holds it cascades the row away.
- **`feature` is a plain string in SQL.** A key later removed from `FEATURES`
  can leave rows behind; `listUserFeatures` filters them through `isFeatureKey`
  instead of handing page data a key nothing can resolve.

### Where access is checked

**On the server, in every load and every action that serves the feature**, with
`requireFeature(db, userId, feature)`, which throws a 403 naming the feature.
It runs before anything is read — on `/home/guides/[id]` that means a made-up
id is a 403 too, so the 404 cannot be used to find out which ids are real.

The app shell layout also returns `features` (and `isAdmin`) as page data.
**That list decides what is shown, never what is allowed.** Loads run in
parallel, so a page cannot count on the layout having run, and a form action
runs before any load at all. The `/home` load uses it to decide whether to run
the guides card's query; `/home/guides` still checks for itself.

Features are read from the database on every request, so a grant or a revoke
applies on the next page load.

Access is **per account**. A partner does not get a feature because the other
person has it. Sharing within a partnership would be a second check alongside
`requireFeature`, not a change to the table.

### Adding a feature

1. Add an entry to `FEATURES`.
2. Call `requireFeature` in every load and action that serves it.
3. Use `page.data.features` (with `hasFeature`) to hide its entry points from
   accounts without it — links, cards, nav.
4. Add tests at the server level for the 403 and the allowed path.

### Guides

`/home/guides` and `/home/guides/[id]` require `guides`. The `/home` Guides card
shows only when the account holds it — see
[section-widgets.md](section-widgets.md).

## Admin

### The role

Admin is Better Auth's admin plugin, which adds `role` (and some ban and
impersonation columns this app does not use) to `user` and `session`. The
plugin's endpoints live under `/api/auth/admin/*`.

The plugin's own `admin` role can impersonate, set passwords, create and delete
accounts. `src/lib/server/auth.ts` narrows it to `user: list, get, set-role` and
`session: list, revoke`, because the rest breaks promises this app makes:

- **Impersonation** would put an admin inside someone's partner data.
- **Creating an account or setting a password** makes a credential the browser
  never derived. There is no password wrap for it, so the account's message key
  can never be opened again (see [encryption.md](encryption.md)).
- **Email, update, delete and ban** have no screen and no use yet.

Granting features is not an admin plugin permission at all: `user_features` is
an app table, written only by the admin page's own actions.

### The first admin

**The first account created is an admin.** A trigger in
`drizzle/0018_promote_first_user_to_admin.sql` sets `role = 'admin'` on the row
inserted into an empty `user` table. It is a trigger rather than a Better Auth
hook so the rule holds however the row arrives — signup, a test fixture, or a
raw `wrangler d1 execute` — and it runs after the admin plugin has written
`role = 'user'`, so it overrides that. The same migration promoted the earliest
existing account of any database that already had accounts when it was
applied.

Every later admin is made by an existing one, with **Make admin** on the account
page. An admin cannot remove their own admin access; another admin can. That
refusal is on the server.

The known gap: on a brand new deployment, **whoever signs up first becomes
admin**. Sign up yourself straight after the first deploy.

In tests the trigger means creation order decides who is an admin, which a test
must never rely on. `createTestUser` writes the role it is given (default
`'user'`) after its insert, and the e2e specs set roles in the database
themselves before signing in afresh.

### Where admin is checked

`requireAdmin(locals)` returns the admin or throws a **404** — not a 403, so the
pages do not confirm they exist. The admin layout calls it, but a layout load
never runs for a form action, so every admin load and every admin action also
calls it. Changing a role goes through `locals.auth.api.setRole`, so the
plugin's own permission check applies as well.

The role travels in the session, and sessions use Better Auth's cookie cache
(`session.cookieCache`, 60 seconds). A role change therefore reaches an
already-signed-in account within a minute, or at once on their next sign-in.
Feature grants have no such lag.

### The pages

- `/admin` searches accounts by email or name, case-insensitively, and lists
  the newest accounts when the box is empty. It is a GET form with `?q=`, not a
  superform: searching is navigation, so the query belongs in the URL. `instr`
  rather than `LIKE`, so a typed `%` or `_` means itself.
- `/admin/users/[id]` lists every feature with how and when it was granted and
  by whom, a Grant or Revoke button per row, and the account's admin access.
  The feature buttons share one superform: each carries its feature as the
  submitter's `name`/`value`, and its `formaction` picks grant or revoke.

Settings shows an **Admin** link only when `page.data.isAdmin`.
