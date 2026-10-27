# Temporary code cleanup

This document tracks code that is intentionally temporary and is expected to
be removed once a specific dependency, platform constraint, or migration window
goes away.

Each section should name:

- what is temporary
- where it currently lives
- what removes the need for it
- what should stay after the cleanup

## Temporal polyfill

The task scheduling layer uses `@js-temporal/polyfill` today, not because the
app wants an abstraction over Temporal, but because the repo still needs a
portable implementation that works across the current browser and runtime set.

The goal is to keep **Temporal-based code** and remove only the **polyfill**
once the app can rely on native Temporal everywhere it cares about.

### Current temporary dependency

- package dependency: `@js-temporal/polyfill`
- current import site: `src/lib/task-schedule.ts`

If more files start importing the polyfill directly, add them to this list so
the eventual cleanup stays explicit.

### What to remove when native Temporal is enough

1. Remove `@js-temporal/polyfill` from `package.json`.
2. Update the lockfile by running the normal package-manager uninstall flow.
3. Replace imports shaped like:

   ```ts
   import { Temporal } from '@js-temporal/polyfill';
   ```

   with code that reads Temporal from the native global instead.

4. Remove any compatibility comments that exist only to explain the polyfill.
5. Re-run the full verification loop, including any browsers the project still
   supports in Playwright.

### What should stay

- The `Temporal`-based scheduling model itself.
- The owner-local wall-clock storage model.
- The task timezone ownership rules.
- Any tests that pin recurrence behavior, DST handling, or timezone-relative
  scheduling outcomes.

The cleanup is specifically **polyfill removal**, not a rewrite away from
Temporal.

## Kink list fantasy and doing as numbers

The kink list's *into it as a fantasy* and *into actually doing it* were
0–4 sliders during development, and are now levels on the answer's own
scale (docs/kink-list.md). Lists saved in between still hold the numbers.

### Current temporary code

- `OLD_INTEREST_STEPS` and the `z.preprocess` in `detailSchema`, in
  `src/lib/kink-list/answers.ts`, which read a number as the nearest level.

### What removes the need for it

The kink list has never been deployed, so only development databases and
devices hold a number. Once every list there has been saved again (any
answer change rewrites it in the new shape), or before the first deploy at
the latest, nothing holds one.

### What to remove

The preprocess and `OLD_INTEREST_STEPS`; `fantasy` and `doing` go back to
`z.enum(LEVELS).optional()`, and the test that reads old numbers goes.

### What should stay

The schema refusing anything that is not a level.

## Kink list own kinks

Kink lists once held kinks of the person's own, from an import's unmatched
rows: answers under `custom:<random>` keys and a `custom` record. They were
removed (docs/kink-list.md), and lists saved in development may still hold
some.

### Current temporary code

- `withoutOwnKinks` and the `z.preprocess` on `answers` and `skipped` in
  `listPayloadSchema`, in `src/lib/kink-list/answers.ts`, which drop those
  keys as a list is read. `custom` itself needs nothing: the schema does not
  name it, so Zod drops it.

### What removes the need for it

The kink list has never been deployed, so only development databases and
devices hold one. Once every list there has been saved again, or before the
first deploy at the latest, nothing does.

### What to remove

`withoutOwnKinks` and both preprocesses, and the test that reads a list
with own kinks in it.

### What should stay

The schema refusing a key that is not a catalogue id.

## Server settings from the environment

The server's secrets, email and model providers moved from environment
variables into the database (docs/server-settings.md). So that existing
deployments carry over — production's `BETTER_AUTH_SECRET` above all, since a
new one signs everyone out and stops every recovery escrow working — each
setting that has no row yet is copied **once** from its old variable, and
the variable is ignored from then on.

### Where it lives

- `src/lib/server/settings/legacy-env.ts` — the import itself
  (`legacyEnvSettings`) and `legacyEnvStillSet`, which the admin page uses to
  say which old variables are still set.
- `src/lib/server/settings/index.ts` — `fillsFor` calls `legacyEnvSettings`
  before generating anything.
- `src/routes/(auth-required)/(app)/admin/server/` — the `legacyEnv` load
  field and the `envNote` snippet that renders it.
- `src/app.d.ts` — the old names in `App.Platform['env']`, under a
  TEMPORARY comment.
- `docker-compose.yml` — the optional pass-through lines, so an upgraded
  self-hoster's `.env` is read on the first start.
- `src/lib/server/settings/index.test.ts` — the
  "the one-time import from the environment" tests.

### What removes the need for it

Production (and its previews) having started once on this build, with the
admin page no longer listing any old variable as still set — at which point
delete them (`wrangler secret delete …`, and the Preview base config's) —
and enough time passed that self-hosters have upgraded through it.

### Removing it

1. Delete `legacy-env.ts`, and in `fillsFor` the loop over
   `legacyEnvSettings`.
2. Drop the `legacyEnv` load field, the `stillInEnv` helper, the `envNote`
   snippet and each `{@render envNote(…)}` on the settings page.
3. Drop the old names from `App.Platform['env']` (keep
   `OPENROUTER_BASE_URL` and `RUNWARE_BASE_URL`, which are test seams) and
   the pass-through block from `docker-compose.yml`.
4. Delete the import tests, and the paragraph about it in
   docs/server-settings.md and docs/self-hosting.md.

What stays: everything else in `src/lib/server/settings/`, including
generating the secrets — a new server still needs nothing set.

## Partnership control beside can_manage

Spaces (docs/spaces.md) say who manages a shared space per member, in
`space_members.can_manage`, and every read of a partnership's `control` is
worked out from those flags (`partnershipControl` in
`src/lib/server/spaces.ts`). The `partnerships.control` column is still
**written**, because the partner settings form asks and answers in terms of
it, and the task, reward and notebook rules are still written against it.
`can_manage` is kept in step from it by one helper. Grep for `LEGACY-SPACES`.

### Where it lives

- `src/lib/server/spaces.ts` — `syncSharedSpaceMembers`, which sets
  `can_manage` from `control` after every write of it, and
  `partnershipControl`, which reads it back.
- `src/lib/server/partnerships.ts` — `createInvite`, `acceptInvite` and
  `updatePartnership`, which write `control` and batch the sync.
- `src/lib/testing/fixtures.ts` — `setTestPartnershipControl`.

### What removes the need for it

The partner settings form writing members' `can_manage` directly, and the
rules in `src/lib/tasks.ts`, `src/lib/rewards.ts`, `src/lib/notebook.ts` and
`src/lib/partnership.ts` taking members rather than a `control` value. Nothing
on a device or in old data depends on the column: every accepted
partnership's members already say what it says.

### What to remove

1. `syncSharedSpaceMembers`'s `can_manage` update, and its callers' batching
   of it (keep adding the invitee as a member on accept).
2. `partnershipControl`'s accepted branch, reading the members directly where
   `control` was read.
3. The column itself only by `ALTER TABLE … DROP COLUMN`, never a rebuild.

### What should stay

What a pending invite offers: an invite has one member, so the offered
control stays on the invite (the partnership row, or an invites table of its
own).
