# Self-hostable Docker image + release CI

## Context

Bound Up only deploys to Cloudflare Workers today (D1, R2, a Durable Object for
the live feed, and a cron job that deletes expired media). The goal is a
**self-hostable Docker image** that uses a SQLite file for the database and a
Docker volume for media. Cloudflare stays a supported target alongside it.

Alongside the image goes a **GitHub Actions pipeline** that:

- works out the next version from conventional commits (semantic-release),
- runs every test suite, with the Playwright e2e suite pointed at the built
  image itself,
- pushes a multi-arch image (amd64 + arm64) to GHCR only if everything passes.

Most of the work already exists. Each binding has a working Node
implementation, but it is only picked when `dev` is true:

| Binding | File that chooses | Node implementation |
| --- | --- | --- |
| Database | `src/lib/server/db/dev.ts` | libsql |
| Media | `src/lib/server/media/dev.ts` | `local.ts`, a filesystem store |
| Live feed | `src/lib/server/realtime/dev.ts` | `local.ts`, an in-process SSE fan-out |

The job is to make those switches also fire for a new Node build target. On top
of that, the plan fills three gaps: a streaming media store, a replacement for
the cron sweep, and migrations applied when the container starts.

Decisions already taken with you:

- Keep both targets (Cloudflare and Docker).
- semantic-release.
- First release is `0.1.0`.
- Publish amd64 + arm64.

## 1. Build target switch

- **`BUILD_TARGET=node` selects the Node build.** Put a tiny `buildTarget()`
  helper in `vite-plugins/build-target.ts`, with a test beside it. It is shared
  by the two config files:
  - `svelte.config.js` uses `@sveltejs/adapter-node` (new devDependency) when
    the target is `node`, and keeps the `{...cloudflare, emulate: undefined}`
    arrangement otherwise.
  - `vite.config.ts`:
    - adds `cloudflareDoExporter` and `scheduledHandler` only for the
      Cloudflare target. `scheduledHandler` would fail the build without
      `_worker.js`.
    - adds `define: { __SELF_HOSTED__: JSON.stringify(target === 'node') }`.
- **Declare the new constant.** `declare const __SELF_HOSTED__: boolean` goes in
  `src/app.d.ts`, and vitest gets `false`.
- **New script:** `"build:node": "BUILD_TARGET=node vite build"`. The existing
  `build` and Cloudflare deploy-on-push are unchanged.
- **Dependency moves in `package.json`:**
  - `@libsql/client` goes into `dependencies`. It has native prebuilt binaries,
    so adapter-node must leave it external rather than bundle it.
  - `@cloudflare/vite-plugin` goes into `devDependencies`. It pulls in
    wrangler/workerd, which would bloat the runtime image.

## 2. Backend selection (the three `dev.ts` files)

- **Rename the files.** Rename `db/dev.ts`, `media/dev.ts` and `realtime/dev.ts`
  to `backend.ts` in each directory, since they no longer serve dev only.
  Update importers. `hooks.server.ts` and the 8 route files use
  `createMediaStore` / `createNotifier`.
- **Change the condition.** In each one, `if (dev)` becomes
  `if (dev || __SELF_HOSTED__)`. Both are build-time constants, so the Cloudflare
  bundle still drops `node:fs` and libsql. The module-level caches stay correct
  because a self-hosted instance is one process.
  - Rewrite the "safe ONLY because dev-only" comments to say "only in the
    local-backend branch".
  - Record in a comment that live updates are single-replica by design.
- **Share the database and store with the sweep.** Extract `getLocalDb()` and
  `getLocalMediaStore()` from those branches so the media sweep (§4) uses the
  same instances.
- **Update the secret error message.** In `hooks.server.ts`, it should also name
  the Docker route (`-e BETTER_AUTH_SECRET=…`).

## 3. Media store fit for production (`src/lib/server/media/local.ts`)

The store currently buffers each upload in memory, and says so is "not
acceptable in production".

- **`put`** streams through `Readable.fromWeb` into `<file>.tmp-<uuid>` while
  counting bytes. It deletes the temp file and throws if the size does not
  match. Otherwise it `rename`s the temp file into place, which is atomic, so a
  reader never sees a partial file.
- **`get`** returns `Readable.toWeb(createReadStream(path))` and takes the size
  from `stat`.
- **Tests:** extend `local.test.ts` with:
  - a streamed round trip,
  - a size mismatch leaves no file behind,
  - the traversal guard still holds.

## 4. Replace the cron sweep and the R2 lifecycle rule

- **New `src/lib/server/self-hosted/sweep.ts`:**
  `startMediaSweep({ db, store, intervalMs = 15 min })`.
  - It runs `sweepExpiredMedia` (from `media/expiry.ts`, unchanged) once at
    startup and then on an interval. It logs results.
  - It also deletes files under `expiring/` whose mtime is more than 31 days
    old. That stands in for the R2 lifecycle rule in the README.
  - It returns a stop function.
- **Wire it into `hooks.server.ts`** through SvelteKit's
  `export const init: ServerInit`, which runs once at server start. Guard it
  with `if (__SELF_HOSTED__ && !building)`, so it never runs in `vite dev`.
- **Tests:** `sweep.test.ts` with fake timers, a test DB and a temp-dir store.

## 5. Health endpoint

- **`src/routes/api/health/+server.ts`** runs `select 1` through `locals.db`
  and returns `{ ok: true }`. It exists for Docker's `HEALTHCHECK` and the CI
  smoke test.
- **Test:** a server test in the `page.server.test.ts` style.

## 6. Docker image

- **`scripts/docker-entrypoint.mjs`** (plain Node):
  1. Fail fast with an actionable message if `BETTER_AUTH_SECRET` is unset.
  2. `mkdir -p` the database and media directories.
  3. Apply `drizzle/` with `migrate()` from `drizzle-orm/libsql/migrator`. It
     keeps the same `__drizzle_migrations` ledger as `drizzle-kit migrate`, so
     this is the runtime version of `db:migrate:dev`.
  4. `await import('../build/index.js')`.
- **`Dockerfile`**, multi-stage on `node:24-bookworm-slim` (glibc, because of
  libsql's prebuilt binaries):
  - **deps:** `npm ci` with `HUSKY=0`.
  - **build:** `npm run build:node`.
  - **prod-deps:** `npm ci --omit=dev --ignore-scripts`.
  - **runtime:** copies `build/`, the prod `node_modules`, `drizzle/`,
    `package.json` and the entrypoint. Runs as `USER node`. Exposes port 3000.
    Has a `HEALTHCHECK` that `fetch`es `/api/health`.
  - **Runtime defaults:**
    - `DATABASE_URL=file:/data/db/bound-up.db`
    - `MEDIA_DIR=/data/media`
    - `PORT=3000`
    - `BODY_SIZE_LIMIT` set to at least `MAX_REQUEST_BYTES` from
      `src/routes/api/partnerships/[id]/send.ts`. adapter-node's default is
      512 KB, which would reject every attachment. A node test reads the
      Dockerfile and asserts this, so raising the attachment cap cannot
      silently break Docker.
  - **`VOLUME ["/data/db", "/data/media"]`**
  - **Version metadata:** `ARG VERSION` and OCI labels come last, so every
    earlier layer is identical between the tested image and the released one.
    `org.opencontainers.image.source` links the package to the repo in GHCR.
- **`.dockerignore`** excludes:
  - `node_modules`, `.svelte-kit`, `build`
  - `local.db*`, `local-media`
  - `.env*`, `.dev.vars*`, `.git`
  - `test-results`, `e2e`, `docs`
- **`docker-compose.yml` example** with:
  - named volumes `bound-up-db` and `bound-up-media`,
  - `BETTER_AUTH_SECRET`,
  - `ORIGIN`. This one matters behind a TLS proxy. Without it adapter-node sees
    `http://`, so the form-action CSRF origin check fails, and so do Better
    Auth's `baseURL` and passkey `rpID`, which both come from `event.url`. Also
    document `PROTOCOL_HEADER` / `HOST_HEADER` as the alternative.

## 7. Run the e2e suite against the image

- **Add a container mode to `e2e/server.mjs`**, used when `E2E_IMAGE` is set.
  It keeps the same lock and wipes the run directory the same way. Instead of
  `drizzle-kit migrate` + `vite dev`, it runs:

  ```
  docker run --rm --name bound-up-e2e-<KEY> --user <uid>:<gid> -p <E2E_PORT>:3000 \
    -v <E2E_RUN_DIR>:/data/run \
    -e DATABASE_URL=file:/data/run/e2e.db -e MEDIA_DIR=/data/run/media \
    -e BETTER_AUTH_SECRET=… -e ORIGIN=<E2E_BASE_URL> <E2E_IMAGE>
  ```

  - SIGINT/SIGTERM trigger `docker stop`.
  - `--user` keeps the bind mount writable on the CI runner.
- **The database-poking specs keep working.** Because of the bind mount, the
  host path behind `E2E_DATABASE_URL` is the same file the container writes, so
  `admin`, `encryption`, `messaging` and `timezone` work unchanged. That holds
  on Linux. On Docker Desktop for macOS, SQLite locking across the VM boundary
  is unreliable; the doc will say so.
- **`playwright.config.ts`** passes `E2E_IMAGE` through to the web server. It
  stays at the same timeouts.
- **New script:**
  `"test:e2e:image": "docker build -t bound-up:local . && E2E_IMAGE=bound-up:local playwright test"`.
- **Risk to watch.** This is the first time e2e has run against a production
  build. Spec or fixture assumptions tied to `vite dev` may surface; one example
  is Lit resolving to its `node/` shims, which Node's `node` export condition
  should handle when Lit is left external. Fix them in the app, not by
  loosening the fixture.
- **`scripts/docker-smoke.sh`** covers volume persistence and migrations that
  are safe to re-run:
  1. Start the image on fresh named volumes and wait for a healthy status.
  2. Stop it and start it again on the same volumes.
  3. Assert it is healthy again and that the migration ledger row count has
     not changed.

## 8. Versioning (semantic-release)

- **devDependencies:** `semantic-release`, `@semantic-release/exec`,
  `conventional-changelog-conventionalcommits`.
- **`.releaserc.json`:**
  - `branches: ["main"]`, `tagFormat: "v${version}"`.
  - **commit-analyzer** uses the `conventionalcommits` preset. Its
    `releaseRules` include `{ "breaking": true, "release": "minor" }` so the
    project stays on 0.x. A comment says to delete that rule to go to 1.0.
  - **release-notes-generator.**
  - **exec** with `prepareCmd: "scripts/publish-image.sh ${nextRelease.version}"`.
    The image is pushed in `prepare`, before the tag exists, so a failed push
    leaves no orphan tag and a rerun retries cleanly.
  - **github** with `successComment: false` and `failComment: false`, which
    keeps the token permissions small.
  - No npm or git plugins, so nothing is committed back to the repo.
- **`scripts/publish-image.sh`:** runs
  `docker buildx build --platform linux/amd64,linux/arm64 --build-arg VERSION --push`.
  It pushes these tags:
  - `ghcr.io/secondfolder/bound-up:<x.y.z>`
  - `:<x.y>`
  - `:latest`
- **Seed tag for 0.1.0:** tag the current `main` HEAD `v0.0.0` before this work
  merges. The first `feat:` after it then releases `0.1.0`. Pushing that tag
  needs your go-ahead at the time.
- **Enforce the commit format.** The version now depends on it, and history
  already has `pref:` and `tests:` typos that would silently not count. Add a
  husky `commit-msg` hook running commitlint with
  `@commitlint/config-conventional`.

## 9. CI workflow (`.github/workflows/ci.yml`)

It runs on pull requests and on pushes to `main`. `concurrency` cancels
superseded PR runs, and release runs are queued one at a time. It uses
Node 24 with the npm cache.

1. **`verify`:**
   1. `npm ci`
   2. `npx playwright install --with-deps chromium`
   3. `npm run lint`
   4. `npm run check`
   5. `npx vitest run` (node + browser projects)
2. **`image`** (needs `verify`):
   1. Set up buildx with the GHA cache.
   2. Build `linux/amd64` with `--load` as `bound-up:ci`.
   3. Run `scripts/docker-smoke.sh`.
   4. Run `E2E_IMAGE=bound-up:ci npx playwright test`.
   5. Upload `test-results/` on failure.
3. **`release`** (needs `image`; push to `main` only):
   - Permissions: `contents: write`, `packages: write`.
   - Steps: QEMU and buildx (same GHA cache), log in to GHCR with
     `GITHUB_TOKEN`, then `npx semantic-release`. When no commit calls for a
     release (only `chore:`, `docs:` and similar), nothing is pushed.

## 10. Documentation (part of done, per AGENTS.md)

- **New `docs/self-hosting.md`**, added to the AGENTS.md feature-doc table. It
  covers:
  - the build target and `__SELF_HOSTED__`,
  - which backends run where,
  - volumes and env vars (`ORIGIN`, `BODY_SIZE_LIMIT`),
  - migrations on start and the sweep,
  - the single-replica limit,
  - the release pipeline and versioning rules.
- **README:** a "Self-hosting with Docker" section (compose snippet, first-run
  admin) and new rows in the scripts table.
- **AGENTS.md:**
  - Invariant 1 and the repo map: `db/dev.ts` becomes `db/backend.ts`.
  - Invariant 2: the cache lives in the local-backend branch.
  - Invariant 4: add "or self-hosted without a platform".
  - Add `test:e2e:image` to the verification loop.
  - Add a Traps note about `ORIGIN` / `BODY_SIZE_LIMIT`.
  - Mention the commit-msg hook.
- **`docs/messaging.md`:** the self-destructing media section gets the
  self-hosted sweep.
- **Historical plan:** copy this plan to
  `docs/historical-plans/2026-09-28-docker-self-hosting.md`.

## Critical files

- **New:**
  - `Dockerfile`, `.dockerignore`, `docker-compose.yml`
  - `.github/workflows/ci.yml`, `.releaserc.json`, `commitlint.config.js`,
    `.husky/commit-msg`
  - `scripts/docker-entrypoint.mjs`, `scripts/publish-image.sh`,
    `scripts/docker-smoke.sh`
  - `vite-plugins/build-target.ts` (+ test)
  - `src/lib/server/self-hosted/sweep.ts` (+ test)
  - `src/routes/api/health/+server.ts` (+ test)
  - `docs/self-hosting.md`
- **Modified:**
  - `svelte.config.js`, `vite.config.ts`, `package.json`, `src/app.d.ts`,
    `src/hooks.server.ts`
  - the three `*/dev.ts` files (renamed to `backend.ts`) and their 8 route
    importers
  - `src/lib/server/media/local.ts` (+ test)
  - `e2e/server.mjs`, `playwright.config.ts`
  - README, AGENTS.md, `docs/messaging.md`

## Verification

1. **The standard loop:** `npm run lint`, `npm run check`, `npm test`. The dev
   e2e path must still pass, which proves `dev` behaviour is unchanged.
2. **Cloudflare is unaffected:** `npm run build`, then check that
   `.svelte-kit/cloudflare/_worker.js` still has the `RealtimeRoom` export and
   the `scheduled` wiring, and contains no `@libsql` or `node:fs`.
3. **The image:** `npm run test:e2e:image` passes the full Playwright suite
   against the container, and `scripts/docker-smoke.sh` passes.
4. **By hand:** `docker compose up`, then:
   - sign up (the first account becomes admin),
   - send a message with an attachment,
   - `docker compose restart`,
   - check the account, message and attachment all survive,
   - check `docker compose logs` shows the startup sweep.
5. **Architectures:** `docker buildx build --platform linux/arm64 .` succeeds
   locally (libsql's arm64 binary installs).
6. **CI:** open a PR and confirm `verify` and `image` run and nothing is
   pushed. After merge, confirm `release` publishes `0.1.0` to GHCR and creates
   a GitHub Release. The `v0.0.0` seed tag is pushed first, with your approval.
