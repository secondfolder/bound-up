# Development

How to set up, run, test and deploy Bound Up from source. What the app is, and
how to use it, is in the [README](../README.md). Running the published Docker
image is [self-hosting.md](self-hosting.md). The conventions and invariants
every change has to respect are in [AGENTS.md](../AGENTS.md): read that before
changing anything.

The stack is SvelteKit 2 and Svelte 5 on Cloudflare Workers, with Drizzle ORM
over Cloudflare D1 and Better Auth (email/password and passkeys). The same
codebase also builds as a plain Node server for the Docker image.

## First-time setup

Local development needs **no Cloudflare account** — it runs against a plain
SQLite file.

```sh
npm install
cp .env.example .env         # just the database path and the tunnel settings
npm run db:migrate:dev       # create the tables in ./local.db
npm run db:seed              # insert the dev guide + edge task
npm run dev
```

There are no secrets to make: the auth secret and the push keys are generated
the first time the server needs them (see [Secrets](#secrets)). Email goes to
`./.mail-outbox` until you set something else, so the newest JSON file there
holds your sign-up link. The first account you create is the admin, and
Settings → Admin → Server settings is where everything else is configured.

To click through the app while code is changing underneath it, start the dev
server with `NO_HMR=1 npm run dev`. Open pages then never hot-update or reload
on their own, so state on the page survives an edit; reload by hand to pick up
the latest code.

## Deploy setup (only when you actually deploy)

```sh
npx wrangler login
npx wrangler d1 create bound-up        # paste database_id into wrangler.jsonc
npx wrangler r2 bucket create bound-up-media
# Deletes self-destructing media (and orphans from failed sends) that outlive the
# 30-day maximum. Lives on the bucket, not in wrangler.jsonc. See docs/messaging.md.
npx wrangler r2 bucket lifecycle add bound-up-media expire-self-destructing expiring/ --expire-days 31
npm run db:migrate:production
npm run deploy
```

No wrangler secrets are needed. Once it is deployed, sign up — the first account
is the admin, and while no mail is set up it skips email confirmation — then set
up email (and the Daydreams providers, if wanted) at Settings → Admin → Server
settings. Workers can only send through Resend: SMTP and the outbox need a Node
build. The sender's domain must be verified in Resend.

Run `npm run preview` before every deploy — it is the only local step that
exercises the real Workers runtime (`nodejs_compat`, the assets binding,
`platform.env`, the R2 bucket, the Durable Object, the real bundle), and
therefore the only one that can catch the dev/production divergences described
below.

Both it and `deploy` run wrangler with no entry argument: `main` in
`wrangler.jsonc` is the worker the adapter generates, and wrangler is happy with
that. The one wrinkle is the `RealtimeRoom` Durable Object class, which has to be
exported from the worker's own module — a module the adapter generates, so there
is nowhere in the source tree to put the export. The `sveltekit-cloudflare-do`
plugin in `vite.config.ts` appends it once the adapter has written the file.
The cron handler that deletes self-destructed message media from R2 is attached
to the same file the same way, by `vite-plugins/scheduled-handler.ts`; its
schedule is `triggers.crons` in `wrangler.jsonc` and is applied by `deploy`. To
run it by hand against `npm run preview`, start wrangler with
`--test-scheduled` and request `/cdn-cgi/handler/scheduled`.

Because wrangler needs no custom entry, Cloudflare's deploy-on-push works on its
defaults — build command `npm run build`, deploy command `npx wrangler deploy`.

> **Why `overrides` in package.json:** `sveltekit-cloudflare-do@0.2.1` ships a
> self-referential `"sveltekit-cloudflare-do": "link:"` dependency — a pnpm
> workspace artefact that was published by mistake — and npm refuses it outright
> with `EUNSUPPORTEDPROTOCOL`. The override redirects that nested self-dependency
> back at the top-level spec, which is the only way the package installs under
> npm. Delete it if the package ever ships a fixed release.
>
> The `@lit-labs/ssr` override is for Cloudflare's build image, which runs
> `npm ci` with npm 10. Web Awesome's nested `@lit-labs/ssr` declares an
> optional peer `@types/node: >=20 <25`, which our `@types/node@^26` does not
> satisfy. npm 11 leaves an unmet optional peer out of the lockfile; npm 10's
> `npm ci` then reports the lockfile out of sync (`Missing: @types/node@24…`)
> and the build fails before it starts. Pointing that peer at our own
> `@types/node` makes both versions agree. It is types only, so nothing runs
> differently. Delete it once `@lit-labs/ssr`'s peer range admits our version.

## Secrets

The server's secrets live in its database, beside the rest of the server
settings ([server-settings.md](server-settings.md)), not in an env file or in
wrangler secrets. That way the Docker image, `vite dev` and a Worker are set up
the same way — from the admin page — and a self-hoster has nothing to generate
before the first start.

- **The auth secret and the VAPID push key pair generate themselves** the first
  time the server finds them missing, so each database — `local.db`, the
  emulated D1, production's, the previews' shared one, a container's volume —
  has its own.
- **Each has a Regenerate button** on the admin page, because replacing either
  is never harmless: a new auth secret signs every account out (the admin's
  included), resets the rate-limit counts and stops partner-assisted recovery
  working until each user next opens the app; a new VAPID pair deletes every
  push subscription, so each device has to turn notifications on again.
- **Email is not required to start.** A server with no mailer runs, and the
  admin pages say so. Under `vite dev` only, unset email falls back to the
  outbox `./.mail-outbox`, from `Bound Up <dev@localhost>`, so signing up
  works without configuring anything. See [email.md](email.md).
- **Daydreams need an OpenRouter key and their pictures a Runware key**
  ([daydreams.md](daydreams.md)), both set on the admin page; without them each
  is simply off. The Playwright suite never uses a real key for either: it runs
  its own stand-in provider (`e2e/model-stub.mjs`), which answers both, and
  `e2e/global-setup.ts` writes every setting into the run's database.

An installation whose settings are still in the environment
(`BETTER_AUTH_SECRET`, `VAPID_*`, `MAIL_FROM` and the rest) has each one copied
into the database once, on the first request that finds the setting missing,
and ignored after that — the admin page lists any that are
still set so they can be removed (`wrangler secret delete …` on Workers). That
import is temporary; see [temporary-code.md](temporary-code.md).

## Branch previews

Cloudflare builds every non-production branch as a **Worker Preview**
(`wrangler preview`), on a URL of its own. Previews read the `previews` block
in `wrangler.jsonc`, which **inherits nothing from the top level**:

- `DB` and `MEDIA` point at `bound-up-preview` and `bound-up-media-preview`,
  shared by every preview and kept apart from production's data.
- `REALTIME` and `PORN_RELAY` are declared again. Each preview gets its own
  Durable Object namespaces automatically, but without the bindings
  `env.REALTIME` and `env.PORN_RELAY` are absent.
- `TUNNEL_REDGIFS` and `TUNNEL_PMVHAVEN`, the Workers VPC services through the
  tunnel to darcy, are declared again with the same service ids. Without them
  the Playroom's Redgifs pictures have no fallback (see docs/playroom.md).
- No cron trigger: Cron Triggers only run against production, so previews
  never run the media sweep.

One-time setup, and again whenever a migration lands:

```sh
npm run db:migrate:remote-preview  # --remote --preview: the D1 entry's preview_database_id
# The same expiry rule production's bucket has, since no sweep runs here.
npx wrangler r2 bucket lifecycle add bound-up-media-preview expire-self-destructing expiring/ --expire-days 31
```

Add a binding at the top level and it is missing in previews until it is
added to `previews` too.

Previews need no secrets of their own. Their server settings live in
`bound-up-preview`, so they generate their own auth secret and push keys —
never production's — and are set up from the admin page of any preview.

## How the database works

|                             | Driver                     | Applier                             |
| --------------------------- | -------------------------- | ----------------------------------- |
| `npm run dev`, seed, studio | libsql → `./local.db`      | `npm run db:migrate:dev`            |
| `npm run preview`           | D1 (wrangler-emulated)     | `npm run db:migrate:local-preview`  |
| Worker Previews (branches)  | D1 → `bound-up-preview`    | `npm run db:migrate:remote-preview` |
| production                  | D1                         | `npm run db:migrate:production`     |
| Docker image                | libsql → `/data/db`        | the entrypoint, on every start      |

- Schema: `src/lib/server/db/schema/app.ts` (hand-written) and `schema/auth.ts`
  (generated by `npm run auth:schema` — regenerate rather than hand-edit).
- Migrations live in `drizzle/` and **are committed**. One migration set feeds all
  three databases; each keeps its own ledger table, so there is no double-apply.
- The Drizzle client and the Better Auth instance are built **per request** in
  `src/hooks.server.ts` and exposed as `event.locals.db` / `event.locals.auth`.
  There is no module-level singleton: a D1 binding only exists inside a request.

### Changing the schema

```sh
npm run auth:schema     # only if Better Auth's own tables need regenerating
npm run db:generate     # writes drizzle/000N_*.sql — READ IT
npm run db:migrate:dev  # local
npm run db:migrate:production   # production
```

Never run `drizzle-kit push` — see the comment in `drizzle.config.ts`.

### The first admin

The first account created in a database is made an admin by a trigger in the
migrations, and every later admin is made from that account's Settings → Admin
page. On a fresh deployment, sign up straight after the first deploy. See
[features-and-admin.md](features-and-admin.md).

## Gotchas

- **Nothing under `src/lib/server/db/` may import `$lib`, `$env` or `$app`.**
  drizzle-kit and the seed script load those files outside Vite, where SvelteKit's
  aliases do not resolve. The one exception is `db/backend.ts`, which is imported only
  by the SvelteKit side.
- **`db.transaction()` works locally but fails on D1.** Drizzle's D1 driver emits
  raw `begin`/`commit`; D1 is auto-commit and offers `batch()` instead. Use
  `batch()`. (Better Auth is unaffected — its adapter runs writes sequentially.)
- **Secrets live in the database**, as server settings, everywhere. What is
  left in the environment — `.env` in dev, `.dev.vars` for `npm run preview`,
  the container's environment when self-hosted — is the database path, the
  tunnel and a few deployment details. There is no `platform` in dev:
  `svelte.config.js` strips the adapter's `emulate` hook so `vite dev` needs no
  workerd.
- **Passkeys are bound to a hostname.** One registered on `localhost` will not work
  on a tunnel host or in production, and vice versa. That is WebAuthn, not a bug.
- **Logging in and signing up need JavaScript, and always did.** Every text
  field is a `<wa-input>` custom element whose real `<input>` only exists once
  Web Awesome upgrades it, so with scripting off there are no usable inputs on
  those pages at all. The client-side key derivation did not change that; it
  just added a `<noscript>` block that explains it.
- **The password is also the encryption key.** It is stretched in the browser
  (PBKDF2-SHA256, 650k iterations) into an auth secret that goes to the server
  and a wrap key that never leaves the device. Two consequences worth knowing
  before you touch either: changing the email-normalisation rule or any KDF
  parameter locks every existing account out of its own message history, and
  there is a frozen test vector in `src/lib/crypto/kdf.test.ts` whose job is to
  fail loudly if you do. See [encryption.md](encryption.md).
- **Partner task dates are timezone-relative, not fixed to one stored offset.**
  The tasks feature stores local wall-clock values plus which partner they are
  relative to, so changing an account timezone later changes how that task is
  interpreted. See [tasks.md](tasks.md) and [timezone.md](timezone.md).
- `npm run db:reset` uses `rm -f` and is not Windows-portable.

## Tests

```sh
npx playwright install chromium   # once — both suites use it
npm test                          # everything: vitest, then the Playwright suite
npm run test:unit                 # vitest alone, in watch mode
npm run test:e2e                  # the Playwright suite alone
npm run test:e2e:image            # the Playwright suite against a fresh Docker build
```

The landing page's feature screenshots in `static/landing/` are real screens,
staged through the UI by `e2e/landing-screenshots.capture.ts`. Retake them with
`npm run screenshots:landing` when one of those screens changes; it runs
against the same throwaway server as the Playwright suite, which never picks up
`*.capture.ts` files, so `npm test` leaves the committed images alone.

The server tests build a SQLite database in memory from the committed
migrations. The component tests run in headless Chromium (Vitest's browser
mode), sealed off from the network. The Playwright suite starts its own
`vite dev` against a throwaway database under the OS temp directory, on a port
derived from the checkout's path, so it never touches your `local.db` or
`npm run dev`, and two worktrees can run it at once. A second run in the same
checkout is refused until the first finishes. The app fetches its icons from
Font Awesome's CDN, so the Playwright suite expects a network connection.
[AGENTS.md](../AGENTS.md) has the details of how each level is meant to be used.

### Pre-commit

`git commit` runs [husky](https://typicode.github.io/husky/) +
[lint-staged](https://github.com/lint-staged/lint-staged): svelte-check over the
whole project first, then over the staged files — [Biome](https://biomejs.dev)
formats them and fixes what it can, `scripts/format-svelte.mjs` formats the
`<script>` and `<style>` blocks of any staged component, and `vitest related`
runs the unit tests whose files import the staged ones (see the `lint-staged`
entry in `package.json`). Anything a task rewrites is re-staged automatically.
It is not a substitute for the full loop in [AGENTS.md](../AGENTS.md) — the
e2e suite is too slow for a hook and runs in CI (`.github/workflows/ci.yml`, against the Docker
image) or by hand.

A `commit-msg` hook runs [commitlint](https://commitlint.js.org) too: release
versions are computed from conventional commit messages, so a `feat:` spelled
`feat;` would otherwise be left out of one. See
[self-hosting.md](self-hosting.md#versioning-and-publishing).

How the linter and formatter are set up, and why one is a Biome config and the
other is half a script, is in
[linting-and-formatting.md](linting-and-formatting.md).

## Scripts

| Script                                                        | What it does                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| `dev` / `build`.                                              | Vite dev server / production build                            |
| `build:node`                                                  | The self-hosted Node server, as the Dockerfile builds it      |
| `preview`                                                     | Build, migrate the emulated D1, then run the real worker      |
| `deploy`                                                      | Build and deploy to Cloudflare                                |
| `check` / `lint` / `format` / `test`                          | svelte-check / Biome check / Biome write / all tests          |
| `test:unit` / `test:e2e`                                      | Vitest in watch mode / Playwright against `vite dev`          |
| `test:e2e:image`                                              | Build the Docker image, then Playwright against it            |
| `screenshots:landing`                                         | Retake the landing page's feature screenshots (`static/landing/`) |
| `db:generate`                                                 | Generate a migration from the schema                          |
| `db:migrate:dev` / `db:migrate:production`                    | Apply migrations to local.db / production D1                  |
| `db:migrate:local-preview` / `db:migrate:remote-preview`      | Apply migrations to the emulated D1 / the Worker Previews' D1 |
| `db:seed` / `db:reset`                                        | Seed dev data / wipe local.db and re-seed                     |
| `db:studio`                                                   | Drizzle Studio against `./local.db`                           |
| `auth:schema`                                                 | Regenerate the Better Auth tables                             |
| `cf-typegen`                                                  | Regenerate Cloudflare binding types (not currently committed) |
