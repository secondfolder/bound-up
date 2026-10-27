# Self-hosting

Bound Up builds for two platforms from one codebase. Cloudflare Workers (D1,
R2, a Durable Object, a cron trigger) is the default, and is what `npm run build`
and CI's deploy job produce. The **self-hosted** build is a plain
Node server in a Docker image, over a SQLite file and a media directory, each on
a Docker volume. This doc covers the second: how the build is selected, what
runs in place of each Cloudflare service, how the image is put together and
tested, and how it is versioned and published.

## Running it

```sh
docker compose up -d
```

That is all it needs: no `.env`, and nothing to generate first. The server
makes its own auth secret and push keys the first time it needs them and keeps
them in the database volume, beside every other server setting
([server-settings.md](server-settings.md)).

**Then sign up, and set it up from inside.** The first account to sign up
becomes the admin, as on Workers (see
[features-and-admin.md](features-and-admin.md)). A new server has no email,
and accounts confirm their address before they can sign in, so while that
account is the only one and email is not set up, it is let in without a link
(see [email.md](email.md#the-first-account-on-a-new-server)). Then, at
Settings → Admin → Server settings:

- **Email** — a sender address and either an API key from resend.com allowed
  to send from it, or any SMTP server as a URL (`smtps://` for TLS on
  connect, `smtp://` for STARTTLS). Until it is set, nobody else can finish
  signing up, and the admin pages say so. The page has a "Send a test email"
  button.
- **Notifications** — optional: the contact address push services are given
  defaults to the email sender's.
- **Model providers**, **Language models** and **Image models** — optional:
  an OpenRouter key and a Runware key, each paid for per use and set once
  under Model providers, and which models to use. Daydreams need the first
  for their stories and the second for their pictures.

**Upgrading from a version that took these as environment variables**
(`BETTER_AUTH_SECRET`, `VAPID_*`, `MAIL_FROM`, `RESEND_API_KEY`, `SMTP_URL`,
`OPENROUTER_API_KEY`, `DAYDREAM_MODEL`, `RUNWARE_AI_*`): keep your `.env` for
the first start. `docker-compose.yml` still passes them through, and each is
copied into the database once, the first time the server finds that setting
missing — keeping your auth secret keeps everyone signed in, and keeping your
push keys keeps every device's notifications. After that the database owns
them and the variables are ignored; the admin page lists any still set, so
they can be removed. A `RUNWARE_AI_IMAGE_MODEL*` is imported only if it is
one of the presets' models; any other is skipped with a logged warning, since
its base model is not known, and is chosen again on the admin page. This
import is temporary (see
[temporary-code.md](temporary-code.md)).

`docker-compose.yml` at the repo root is a working example: the image from
`ghcr.io/secondfolder/bound-up`, a volume for the database and a volume for
media. The environment variables left are about where and how the container
runs; everything else is a server setting.

| Variable             | Default                     | What it is                                                     |
| -------------------- | --------------------------- | -------------------------------------------------------------- |
| `ORIGIN`             | none                        | The URL people use, e.g. `https://bound.example.com`           |
| `DATABASE_URL`       | `file:/data/db/bound-up.db` | The SQLite file. Must be a `file:` URL                         |
| `MEDIA_DIR`          | `/data/media`               | Encrypted attachments                                          |
| `PORT`               | `3000`                      | Where the server listens inside the container                  |
| `BODY_SIZE_LIMIT`    | `32M`                       | adapter-node's request cap. Must stay above the attachment cap |
| `ADDRESS_HEADER`     | none                        | Behind a proxy: where it puts the client's address             |
| `XFF_DEPTH`          | none                        | With `X-Forwarded-For`: how many proxies are in front          |
| `AUTH_RATE_LIMIT`    | on                          | `off` disables the sign-in rate limit                          |

**Back up the database volume** as you would any secret: it holds the auth
secret, the push keys and the provider keys as well as everyone's data.

`/data/db` and `/data/media` are the two volumes. Back up both together: a
database row without its file shows as missing media, and a file without its
row is an unreachable orphan.

**`ORIGIN` is not optional behind a reverse proxy.** The container speaks plain
HTTP, and without `ORIGIN` adapter-node builds `event.url` from what reaches
it — `http://` and the internal host. SvelteKit's CSRF check then refuses every
form post, Better Auth's `baseURL` and trusted origins are wrong, and passkeys
are registered to the wrong relying party (the rpID is `event.url.hostname`;
see [passkeys.md](passkeys.md)). `PROTOCOL_HEADER=x-forwarded-proto` and
`HOST_HEADER=x-forwarded-host` are the alternative when one container answers
to several names. Passkeys and the Web Crypto API need a secure context, so
anything but `localhost` needs HTTPS in front.

**Behind a proxy, also set `ADDRESS_HEADER`** (usually `X-Forwarded-For`, with
`XFF_DEPTH` set to the number of proxies). Signing in is rate limited per
client address, and without it every client looks like the proxy, so they all
share one allowance. Directly exposed, leave it unset: the connection's own
address is used, and a client cannot pick its own by sending the header. See
[rate-limiting.md](rate-limiting.md#self-hosted-the-clients-address).

**One replica only.** The live message feed fans out through an in-process
`Map` (below), so a second container would never hear the first one's
messages, and two processes writing one SQLite file over a network volume is
not something SQLite promises to survive. Scale up, not out.

## The build target

`BUILD_TARGET=node` selects it: `npm run build:node`, which is what the
Dockerfile runs. `vite-plugins/build-target.ts` reads the variable and both
configs import it, so they cannot disagree:

- `svelte.config.js` picks `@sveltejs/adapter-node` instead of the Cloudflare
  adapter.
- `vite.config.ts` leaves out the two plugins that rewrite the Cloudflare
  adapter's output (the Durable Object export and the cron handler), and
  defines `__SELF_HOSTED__` as `true`.

An unknown `BUILD_TARGET` fails the build rather than quietly producing a
Workers bundle.

`__SELF_HOSTED__` is a build-time constant, like `dev`, and the three backend
factories branch on `dev || __SELF_HOSTED__`. In the Workers bundle both are
`false`, so the local branches — and libsql and `node:fs` with them — are dead
code, exactly as they were when the branch was `dev` alone. Biome knows the
global through `javascript.globals` in `biome.jsonc`; TypeScript through
`src/app.d.ts`.

## What replaces each Cloudflare service

| Workers                       | Self-hosted                                           | Chosen in                         |
| ----------------------------- | ----------------------------------------------------- | --------------------------------- |
| D1                            | libsql over `DATABASE_URL`                            | `src/lib/server/db/backend.ts`    |
| R2                            | a directory, `MEDIA_DIR` (`media/local.ts`)           | `src/lib/server/media/backend.ts` |
| `RealtimeRoom` Durable Object | an in-process `Map` of SSE streams (`realtime/local`) | `src/lib/server/realtime/backend.ts` |
| cron trigger → `scheduled.ts` | `startMediaSweep` from the `init` hook                | `src/hooks.server.ts`             |
| R2 lifecycle rule on `expiring/` | `deleteOlderThan` in the same sweep               | `src/lib/server/self-hosted/sweep.ts` |
| Resend over `fetch`           | Resend, or SMTP through nodemailer (`mail/local.ts`)  | `src/lib/server/mail/config.ts`   |
| `wrangler d1 migrations apply` | the entrypoint, on every start                       | `scripts/docker-entrypoint.mjs`   |

These are the same local backends `vite dev` has always used, so everything
the Playwright suite proves against `vite dev` it proves for them too. Three
were strengthened for production:

- **The media store streams.** It used to buffer each upload whole, which was
  tolerable only while it was dev-only. A write now goes to a
  `<file>.tmp-<uuid>` beside its target and is renamed into place once its
  length matches the declared size, so a reader never sees half a file and a
  failed upload leaves nothing (bar a temp file from a process killed
  mid-write, which the lifecycle pass below removes). Reads stream from disk.
- **Each backend is one instance per process.** `getLocalDb()` and
  `getLocalMediaStore()` are module-level caches. That breaks invariant 2's
  rule for D1, where a binding only exists per request, but it is what the
  local backends need: one process, one file, one directory. The sweep shares
  the same instances.
- **The expiry sweep has a scheduler.** `startMediaSweep` runs
  `sweepExpiredMedia` (the same function the cron trigger calls; see
  [messaging.md](messaging.md#self-destructing-media)) at startup and every
  15 minutes, never two passes at once, logging and carrying on when one fails.
  Each pass then deletes files under `expiring/` older than 31 days, which is
  what the R2 lifecycle rule does on Workers: a backstop for orphans the sweep
  cannot see. It is started from SvelteKit's `init` hook, behind
  `__SELF_HOSTED__`, so `vite dev` still has no sweep.

## The image

`Dockerfile`, multi-stage on `node:24-bookworm-slim` (glibc, because
`@libsql/client` ships prebuilt glibc binaries):

1. **deps** — `npm ci`, dev dependencies included, with `HUSKY=0`.
2. **build** — `npm run build:node`.
3. **prod-deps** — `npm ci --omit=dev --ignore-scripts`. adapter-node bundles
   `devDependencies` into `build/` and imports `dependencies` at runtime, which
   is why `@libsql/client` (native) is a dependency and
   `@cloudflare/vite-plugin` (which pulls in workerd) is not.
4. **runtime** — `build/`, the production `node_modules`, `drizzle/` and the
   entrypoint, run as the unprivileged `node` user. `/data/db` and
   `/data/media` are created owned by `node` before being declared volumes, so
   a fresh named volume inherits that ownership. A `HEALTHCHECK` polls
   `/api/health`, which answers 200 while `select 1` succeeds and 503 when it
   does not.

The version label and `APP_VERSION`, which the app reads to show its version,
are set in the last layer, so every layer above them is identical between the
image CI tests and the one it publishes.

`BODY_SIZE_LIMIT` deserves its note. adapter-node refuses bodies over 512 KB
by default, which is every message with a photo. The routes enforce the real
cap themselves (`MAX_REQUEST_BYTES` in `api/partnerships/[id]/send.ts`, with a
message that says what went wrong), so the image's limit only has to sit above
it. `src/lib/server/self-hosted/dockerfile.test.ts` reads the Dockerfile and
fails if it does not, so raising the attachment budget cannot silently break
self-hosted sends.

**The entrypoint** (`scripts/docker-entrypoint.mjs`) refuses to start with a
non-`file:` `DATABASE_URL`, creates the volume
directories, applies `drizzle/` with drizzle-orm's `migrate()`, and only then
imports the server. It keeps the same `__drizzle_migrations` ledger as
`drizzle-kit migrate` (`npm run db:migrate:dev`), so a database made by one can
be carried on by the other, and a restart applies nothing. A migration that
fails stops the container before it serves anything against a half-migrated
database. `drizzle-kit push` is still never used. It checks for no secrets:
the server generates its own, so a container with nothing but `ORIGIN` set is
a working one.

## How the image is tested

Before anything is published, CI runs the image through three checks.

- **`scripts/docker-smoke.sh`** starts it on fresh named volumes with
  nothing set but `ORIGIN`, checks every
  migration was applied, checks over HTTP that a sixth sign-in in a minute is
  refused as too many (and that Better Auth never logged that it could not tell
  clients apart), checks the server generated an auth secret, writes a marker
  row and a marker file, then replaces
  the container with a new one on the same volumes. The new one must be
  healthy, must not re-apply migrations, must still have both markers, and
  must have kept the same auth secret — a new one would sign everyone out.
- **The whole Playwright suite runs against it.** With `E2E_IMAGE` set,
  `e2e/server.mjs` runs the image instead of `vite dev`, on the same
  per-checkout port, with two fresh named volumes mounted where a self-hoster's
  go, and `AUTH_RATE_LIMIT=off` — every test signs up from the same address,
  which is why the smoke test checks the limit instead. `e2e/global-setup.ts`
  writes every server setting into the container's database, and email goes
  to an outbox directory under `/tmp` inside the container, which `e2e/mail.ts`
  reads through `docker exec` the same way `e2e/db.ts` reaches the database. `npm run test:e2e:image` does this locally (it builds `bound-up:local`
  first).
- **The specs that touch the database go through the container.** `e2e/db.ts`
  is their one `sql()` helper. Against `vite dev` it opens the run's SQLite
  file; against an image it runs the statement with `docker exec`, inside the
  container, through the container's own libsql. Bind-mounting the run
  directory and opening the file from both sides was tried first. It works on
  Linux but not under Docker Desktop on macOS, where the file crosses into a
  VM: writes from the host went unseen by the server, and the server's own
  inserts failed with `SQLITE_IOERR_DELETE_NOENT`. SQLite's locking holds only
  when one kernel sees every handle on the file.

The container and its volumes are named after the port
(`bound-up-e2e-<port>`), so a run that was killed outright leaves them for the
next run to replace. They are kept after a run, like the `vite dev` run
directory, to be inspected.

## Versioning and publishing

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

1. **verify** — commitlint over a PR's commits, then `lint`, `check` and
   `vitest run` (node and browser projects).
2. **image** — at the same time as verify: build the amd64 image and run the
   smoke test, then hand the image to the next job as an artifact. Only a
   push to `main` writes the layer cache; pull requests read it.
3. **e2e** — the Playwright suite against that image, split four ways with
   `--shard`, one runner each. A shard's traces are uploaded when it fails.
4. **release** — on `main` only, and only if verify and every shard passed.
   semantic-release (`release.config.mjs`) reads the conventional commits
   since the last `v*` tag and decides the version. Its `prepare` step runs
   `scripts/publish-image.sh`, which builds amd64 and arm64 and pushes
   `ghcr.io/secondfolder/bound-up` as `:<x.y.z>`, `:<x.y>` and `:latest`.
   Only then is the tag pushed and the GitHub Release written. A push that
   fails therefore leaves no tag behind, and a rerun starts clean.
5. **deploy** — migrates production's D1 and runs `wrangler deploy`.

Both architectures are built without emulation. Every Dockerfile stage that
runs a command is pinned to the build platform (`--platform=$BUILDPLATFORM`):
`build/` is plain JavaScript, so it is built once and shared, and the
production dependencies are installed for the target with npm's `--os`,
`--cpu` and `--libc`, which choose which prebuilt native binaries (libsql's)
it downloads. The target-platform stage only copies files in. Building arm64
under QEMU took ten to fifteen minutes of every release; it now reuses the
image job's cache for everything except arm64's `node_modules`.

The `deps` stage installs from `package.json` with its `scripts` and tool
config stripped (the `manifest` stage), so editing an npm script does not
reinstall every dependency.

The preset behind the notes generator is pinned on purpose.
`conventional-changelog-conventionalcommits` is a direct devDependency because
`@semantic-release/release-notes-generator` loads it from the project root, and
it is held at `^9`: preset v10 needs `conventional-changelog-writer` v9, while
semantic-release 25 — the latest stable — pins writer v8, and the mismatch
throws "Missing helper" in the release job after everything else has passed.
`src/lib/server/self-hosted/release-notes.test.ts` renders a commit through the
same preset-plus-writer pairing, so a bad bump fails on the PR instead. Bump
the preset to v10 only together with a semantic-release that ships writer v9.

The version rules:

- `feat:` → minor
- `fix:` / `perf:` → patch
- anything else (`chore:`, `docs:`, `refactor:`, `style:`, `test:`) → no
  release, and no image
- a breaking change (`feat!:`, or a `BREAKING CHANGE:` footer) → **minor**,
  while the project is on 0.x. That is the one custom rule in
  `release.config.mjs`; delete it to let the next breaking change make 1.0.0.

**Data from very old versions is no longer read.** Tasks, rewards, tag names
and partnership names stored in plaintext, messages age-encrypted to both
partners rather than sealed in the partnership vault, and message bodies stored
as plain text rather than rich text were all moved over by the app itself, in
the background, by a device that opened it — and that code is gone. An
instance holding any of them must have been opened, signed in, on a version
from before migration `0047_drop_legacy_migrations` to carry them over: that
migration drops the plaintext columns, and a message still in the old scheme
shows as one that cannot be read. A task, reward, completion or claim that was
never sealed stops migration `0052_copy_tasks_rewards_into_spaces` outright,
since the tables it copies into require the sealed columns, rather than
arriving there unreadable.

The history before the first release carries a `v0.0.0` seed tag, so the first
release is 0.1.0 rather than a version computed from years of pre-release
commits.

Nothing is committed back to the repository: the version lives in the tag, the
GitHub Release, the image's `org.opencontainers.image.version` label and its
`APP_VERSION` variable, which the settings page shows.
`package.json`'s `version` is a placeholder. Builds that semantic-release does
not make (production's, Worker Previews, `vite dev`) work the same version out from the git
history; see [versions-and-updates.md](versions-and-updates.md).

Because the version depends on the commit messages, they are checked: the
husky `commit-msg` hook runs commitlint (`commitlint.config.js`,
`@commitlint/config-conventional`) on every local commit, and CI checks every
commit in a pull request. The rule on subject case is off; the history does not
follow one, and nothing reads it.
