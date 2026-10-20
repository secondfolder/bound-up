# Server settings in-app (Admin → Server settings)

## Context

`.env.example` has grown to ~15 variables, all set through `scripts/secrets.mjs`
per environment (`.env`, `.dev.vars`, wrangler secrets, Preview base config,
self-hosted `.env`). Move every one of them except `DATABASE_URL`,
`CF_TUNNEL_NAME` and `CF_TUNNEL_AUTO_START` into the database, edited from a new
admin screen. Secrets that can be generated (`BETTER_AUTH_SECRET`, the VAPID
pair) are generated on first use and get a **Regenerate** button. Model choices
become presets (named by family, not version, so code can move them to newer
versions) plus a **Custom** option that searches OpenRouter / Runware; image
models also record their **base model**, which picks the prompt recipe.

Env vars are read **once, as a temporary import** (user's decision): when a
setting is missing from the DB and its env var is set, it is copied in. That
code is marked temporary and listed in `docs/temporary-code.md`, to be removed
once production has migrated. Nothing else (e2e included) may rely on it.

Test-only overrides `OPENROUTER_BASE_URL`, `RUNWARE_BASE_URL`, `AUTH_RATE_LIMIT`,
`MEDIA_DIR`, `ORIGIN` etc. are not in `.env.example` and stay env vars.

## Data

- New table `server_settings` in `schema/app.ts`: `key` text PK, `value` text
  NOT NULL, `timestamps`. Generated with
  `drizzle-kit generate --name add_server_settings`; read the SQL (no rebuild).
- A cleared setting is stored as `''`, never deleted, so the env import never
  resurrects something an admin removed.
- Keys (pure, alias-free registry in `src/lib/server-settings.ts`, shared by
  server and UI): `authSecret`, `vapidPublicKey`, `vapidPrivateKey`,
  `vapidSubject`, `mailFrom`, `mailTransport` (`resend|smtp|outbox|''`),
  `resendApiKey`, `smtpUrl`, `mailOutboxDir`, `openrouterApiKey`,
  `openrouterStoryModel`, `runwareApiKey`, `runwarePhotoModel`,
  `runwareIllustratedModel`. Model ids only mean anything to one provider, so
  every key, JSON field, type and label that holds one names it. Values:
  `{"preset":"hermes"}` or `{"openrouterModelId":"vendor/id"}`; image ones
  `{"preset":"dark-beast"}` or
  `{"runwareModelAir":"air:1@2","base":"illustrious"}`. Preset entries
  likewise carry `openrouterModelId` / `runwareModelAir`, and the UI labels
  the custom inputs "OpenRouter model ID" and "Runware model AIR".

## Presets (in `src/lib/server-settings.ts`)

Story model, on OpenRouter (ids verified live today):
- `hermes` — Hermes, Nous Research → `nousresearch/hermes-3-llama-3.1-70b` (default, unchanged behaviour)
- `hermes-large` → `nousresearch/hermes-4-405b`
- `euryale` — roleplay fine-tune → `sao10k/l3.1-euryale-70b`
- `cydonia` — small and cheap → `thedrummer/cydonia-24b-v4.1`

Photo model, on Runware: `dark-beast` → `persona:242173@2788849`, base `z-image-turbo` (default);
`lustify` → `civitai:573152@1094291`, base `sdxl`.
Illustration model, on Runware: `wai-illustrious` → `aiki:827184@2883731`, base `illustrious` (default).

Base models for custom: SDXL, Illustrious, Pony, NoobAI, Z-Image Turbo — each
maps to a `PictureArchitecture` recipe (`sdxl` / `z-image-turbo`) in
`image-prompt.ts`, so the finer choice is stored and recipes can diverge later.
`resolvePictureModel`, its runtime `modelSearch` lookup, `KNOWN_ARCHITECTURES`
and `PictureModelError` go: the architecture now comes from the stored base.

## Server: `src/lib/server/settings/`

- `index.ts` — `loadServerSettings(db)`: one `select` of all rows. If any
  generatable/importable key is missing: run the temporary env import
  (`legacy-env.ts`), generate `authSecret` (32 random bytes) and the VAPID pair
  together (reuse whatever `secrets.mjs` used to generate them — WebCrypto
  P-256, base64url), `insert … onConflictDoNothing` (race-safe across isolates
  and processes), then re-select. `saveServerSettings(db, partial)` upserts.
- Caching: **Workers only** (`!(dev || __SELF_HOSTED__)`), per isolate, 60 s
  TTL, dropped locally on write; comment explains why that is not a `db`
  singleton (invariant 2) and that a rotated secret takes ≤60 s to reach every
  isolate. Local backends read every request (microseconds, no billing), which
  also keeps tests and e2e seeding exact.
- `legacy-env.ts` (**TEMPORARY**): maps `BETTER_AUTH_SECRET`, `VAPID_*`,
  `MAIL_*`, `RESEND_API_KEY`, `SMTP_URL`, `OPENROUTER_API_KEY`,
  `DAYDREAM_MODEL` (→ `openrouterStoryModel`: preset if it equals one's id, else custom),
  `RUNWARE_AI_API_KEY`, `RUNWARE_AI_IMAGE_MODEL[_ILLUSTRATED]` (→ preset if it
  matches; else custom only when the base is known, otherwise skipped with a
  logged warning naming the admin page). Also exports `ignoredEnvVars(platform,
  settings)` for the admin warning below.
- `hooks.server.ts`: load settings once per request into
  `event.locals.settings`; secret from there (the missing-secret throw goes —
  it can no longer be missing). `lazyMailer` reads `locals.settings`. `init` no
  longer refuses to start without mail.
- Readers take settings instead of `platform`: `readDaydreamConfig`,
  `readImageConfig`, `readVapidConfig`, `readMailConfig` (callers listed by
  grep: daydream pages/APIs, `(app)/+layout.server.ts`, notifications,
  push subscriptions). Error messages point at Admin → Server settings.
- Defaults: under `vite dev` only, unset mail falls back to the outbox
  `./.mail-outbox` from `Bound Up <dev@localhost>` (what `secrets -- dev` did),
  shown as such in the UI. VAPID subject defaults to `mailto:` + the sender's
  address; push is off only if neither is set.
- **Rotations**: `authSecret` → signs everyone out, resets rate-limit buckets,
  voids escrows until each user's next load; action redirects to `/login`.
  VAPID → also deletes all `push_subscriptions` in the same `db.batch()`, since
  they are bound to the old public key.
- **First-account bootstrap**: a fresh install has no mail, so nobody could
  confirm an address. In the signup action, if the new account is the only
  account and mail is not configured, mark it verified and redirect to
  `/login?setup=1` ("You're the first account, so you're the admin — set up
  email in Settings → Admin"). Narrow on purpose: with mail configured
  (always in e2e) nothing changes; the first account is already the admin by
  the 0018 trigger, so this widens nothing.

## Admin UI

- `/admin` becomes a hub: **Server settings** (with status badges per area,
  and a warning banner when email isn't set up) and **Accounts**. The user
  search moves to `/admin/users` (beside the existing `/admin/users/[id]`;
  back links and `e2e/admin.spec.ts` updated).
- `/admin/server`: one card per area, each its own superform + action, save
  button outlined until tainted and valid. `requireAdmin` in load and every
  action. Secret values never go to the browser: only "set · ends in …3f2a".
  1. **Email** — status line; Sender; "How email is sent" radios: Resend / SMTP
     server / Files on this server (testing). SMTP and files disabled on
     Workers with the reason. Transport's field. **Send a test email** to the
     admin's own address — awaited and reported (comment: the
     never-await rule protects strangers' addresses; this is the admin's own).
  2. **Daydreams** — OpenRouter API key (`SecretSettingField`), OpenRouter story
     model (`ModelPicker`).
  3. **Pictures** — Runware API key; Runware photo model and Runware
     illustration model pickers, each with its base model.
  4. **Notifications** — contact address (placeholder = the default), public
     key shown, **Regenerate keys** with a `wa-dialog` confirm stating the
     consequence.
  5. **Sign-in** — session secret, "generated automatically on <date>",
     **Regenerate** with confirm dialog naming the consequences in plain words.
  - Temporary: a note on any field whose env var is still set but ignored
    ("copied in once; remove it from the environment") — tells you when prod's
    wrangler secrets can be deleted.
- `SecretSettingField.svelte`: set → masked tail + Replace / Remove; Replace
  reveals a password input. Empty input = keep.
- `ModelPicker.svelte`: preset radios (label + one-line description) +
  Custom. Custom shows a debounced search (`tryFetch`), results as native
  `<button>`s (option semantics, commented), the chosen id in an editable
  input, and for images a base-model `wa-select` prefilled from Runware's
  reported architecture via `pictureArchitecture()`.
- Search endpoints (admin only, `requireAdmin`):
  `GET /api/admin/models/openrouter?q=` (public `GET {base}/models`, filtered,
  top 20 with price/context) and `GET /api/admin/models/runware?q=`
  (`modelSearch`, checkpoints, using the saved key; 409 "save a Runware key
  first").
- Schemas in `src/lib/schemas/serverSettings*Form.ts`; components through
  `$lib/superform` and `InputField.svelte`.

## Removals / config

- Delete `scripts/secrets.mjs` and the `secrets` npm script. `.env.example`
  and `.dev.vars.example` keep only `DATABASE_URL` / the tunnel vars.
- `docker-entrypoint.mjs`: drop the `BETTER_AUTH_SECRET` refusal.
  `docker-smoke.sh`: drop the env secrets and the "refuses without MAIL_FROM"
  check. `docker-compose.yml`: keep the pass-through lines as optional,
  commented as temporary one-time import (upgrades keep their secret).
- `app.d.ts`: the `platform.env` entries stay, marked temporary.
- e2e: `playwright.config.ts` stops passing these vars; a new `globalSetup`
  (runs after the web server) upserts mail (outbox dir — host path, or
  `/tmp/mail-outbox` for the image), OpenRouter key + `{"openrouterModelId":"e2e/stub"}`,
  Runware key through `sql()`. `e2e/server.mjs` stops forwarding them.
  `model-stub.mjs` gains `GET /v1/models` and Runware `modelSearch`.

## Tests

- Pure: preset/base mapping, model-value parsing, legacy env mapping.
- Server (`createTestDb`): load generates secret + VAPID once and is idempotent
  under concurrent calls; import copies env once and never over a stored/
  cleared value; every action (save per area, remove key, rotate secret →
  redirect, rotate VAPID → subscriptions gone, test email); non-admin refused
  in load and actions; search endpoints (stubbed fetch, admin-only, no-key
  409); signup first-account bootstrap with and without mail.
- Existing tests that mutate `env.OPENROUTER_API_KEY` etc. switch to a
  `setTestSettings(db, …)` helper in `$lib/testing/`.
- Component: `ModelPicker` (preset ↔ custom, search result fills id and base),
  `SecretSettingField`.
- e2e `admin-settings.spec.ts`: admin saves email settings and sends a test
  email (read from outbox); picks a custom story model via search; regenerates
  VAPID; non-admin gets 403/redirect.

## Docs

New `docs/server-settings.md` (table row in AGENTS.md); update
`email.md`, `daydreams.md`, `notifications.md`, `features-and-admin.md`,
`development.md`, `self-hosting.md`, `README.md`, `temporary-code.md`
(legacy env import, with the removal checklist), AGENTS.md (invariant 9,
repo map). Roadmap entry if one exists. Copy this plan to
`docs/historical-plans/2026-10-20-server-settings-in-app.md`.

## Verification

`npm run check`, `npm run lint`, `npm test`, `npm run test:e2e`,
`npm run test:e2e:image`; `npm run preview` with an empty `.dev.vars` to
confirm the Workers path generates a secret on first request and the admin
page saves through D1. Before the prod deploy: confirm the import copied
`BETTER_AUTH_SECRET` (admin page shows "imported", not "generated").
