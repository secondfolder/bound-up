# Parallel-safe e2e runs, and component tests in a real browser

## Context

Two problems, and they turn out to be unrelated to each other.

**1. E2E runs cannot coexist.** [playwright.config.ts](playwright.config.ts) hardcodes port
5175 with `--strictPort`, and its `webServer.command` starts with `rm -f e2e.db` against a
fixed path at the repo root. A second run — another worktree, another agent — either fails
on the port or deletes the first run's database out from under it. The suite is also pinned
to `workers: 1`.

**2. Component tests cannot see Web Awesome at all.** AGENTS.md explains this as "`wa-*`
elements are never upgraded in jsdom (they come from a CDN)". That reason is wrong — Web
Awesome is an npm package imported from [+layout.svelte](src/routes/+layout.svelte#L9-L22).
The real ceiling is `ElementInternals`:

| | jsdom 29 | happy-dom 20 | real Chromium |
|---|---|---|---|
| `attachInternals()` | yes | **absent** | yes |
| `ElementInternals.setFormValue` | **absent** | absent | yes |
| `adoptedStyleSheets` | absent | yes | yes |

Under jsdom, `WaInput` registers and then throws
`TypeError: this.internals.setFormValue is not a function` the moment Lit upgrades it.
happy-dom is worse — it has no `ElementInternals` whatsoever. 24 of Web Awesome's 70
components are form-associated, including every interactive one the app uses (`input`,
`button`, `checkbox`, `textarea`, `dialog`, `select`). No simulated DOM can host them.

### Why this is not the originally-requested change

The original ask was to move the Playwright specs onto
[Vitest browser mode's Playwright provider](https://vitest.dev/config/browser/playwright).
**That is structurally impossible.** Browser mode runs the test file *inside* the page as a
single script tag, so navigating away terminates the run — there is no `page.goto` and no
second browser context. The feature request was closed by a maintainer with exactly that
explanation ([vitest#7875](https://github.com/vitest-dev/vitest/issues/7875)), and the docs
say browser mode "does not completely replace standalone end-to-end test runners"
([Why Browser Mode](https://vitest.dev/guide/browser/why)). Every spec in `e2e/` is
navigation plus two contexts per test.

Running Playwright's *library* under a Vitest node project would work, but it would mean
hand-rolling replacements for the trace viewer, retry artifacts, `--ui`, the HTML reporter
and the VS Code integration — churn across all 9 spec files to arrive back where we started.
Parallel safety is orthogonal to the runner, and Playwright already does parallelism well.

So: fix problem 1 inside `playwright.config.ts`, and use browser mode where it genuinely
applies — problem 2.

### Outcome

- Runs in separate checkouts are fully independent and concurrent.
- A second run in the same checkout stops immediately with a clear message.
- E2E test files run in parallel within a run (currently `workers: 1`).
- Component tests render against real, upgraded Web Awesome elements, retiring AGENTS.md's
  "assert on the attributes the component emits, not on rendered behaviour" rule and letting
  coverage move down out of the 90-second e2e suite.
- `npm test` runs everything: `vitest run && playwright test`.

---

## Part 1 — parallel-safe e2e (`playwright.config.ts`)

### Derive everything from the checkout path

```ts
const KEY = createHash('sha1').update(process.cwd()).digest().readUInt16BE(0) % 20000;
const PORT = 20000 + KEY;                                  // 20000–39999
const RUN_DIR = join(tmpdir(), `bound-up-e2e-${KEY}`);
export const E2E_DATABASE_URL = `file:${join(RUN_DIR, 'e2e.db')}`;
```

Deterministic, not `mkdtemp`, and that is deliberate: **Playwright re-evaluates the config
in every worker process**, so a random path would differ between the main process and the
workers. A hash of `process.cwd()` is identical everywhere with no plumbing. Verified: the
three plausible checkout paths hash to 20476, 28405 and 35813. The range sits below macOS's
ephemeral port range (49152+), so it will not collide with transient sockets.

### The port is the mutex

No lock file. A lock file needs staleness detection, a release path, and a `SIGINT`
handler — three things to get wrong. A bound TCP port needs none of that: the OS releases
it when the process dies, however it dies.

`e2e/preflight.mjs` (new, ~15 lines) runs as the first step of the `webServer` command,
which executes exactly once in the main process and never in a worker:

```
node e2e/preflight.mjs <port>
```

It tries to bind the port. On `EADDRINUSE` it prints

> An e2e run is already in progress in this checkout (port 20476 is in use).
> Wait for it to finish, or run from a separate git worktree.

and exits 1, so Playwright fails fast with something readable instead of a raw Vite
`--strictPort` error. (A `--wait` flag that polls until free is a two-line addition if the
fail-fast behaviour turns out to be annoying.)

### Server command and env

```ts
webServer: {
  command:
    `node e2e/preflight.mjs ${PORT} && ` +
    `rm -rf ${RUN_DIR} && mkdir -p ${RUN_DIR}/media && ` +
    `npx drizzle-kit migrate && ` +
    `npx vite dev --port ${PORT} --strictPort`,
  url: `http://localhost:${PORT}`,
  env: {
    DATABASE_URL: E2E_DATABASE_URL,
    MEDIA_DIR: `${RUN_DIR}/media`,          // honoured by src/lib/server/media/dev.ts
    BETTER_AUTH_SECRET: 'e2e-secret-not-used-anywhere-else',
    VITE_DEV_ORIGIN: `http://localhost:${PORT}`
  }
}
```

The existing reason for rebuilding the database inside the server command rather than in
`globalSetup` still holds and its comment stays: Playwright starts the web server first, so
deleting the file afterwards leaves every write failing with `SQLITE_READONLY_DBMOVED`.
Nothing else changes about the sequencing. No `globalTeardown` is needed — the next run
wipes `RUN_DIR`, and leaving it behind means the database is still there to inspect after a
failure.

`MEDIA_DIR` is newly passed. Today the e2e run writes encrypted attachments into the repo's
shared `./local-media`, which is a cross-run collision nobody has hit yet.

### Parallelism

```ts
workers: process.env.CI ? 2 : 4,
fullyParallel: true,
```

The suite is already data-isolated: `uniqueEmail()` in [e2e/helpers.ts](e2e/helpers.ts)
mints a fresh address per account, `newSide()` gives each account its own browser context,
and the two `'You have no partners yet.'` assertions in
[partners.spec.ts](e2e/partners.spec.ts#L194) are scoped to accounts created inside that
test. One shared dev server across workers is a feature here — they share its warm
route-compile cache, which is where most of the current ~90s goes.

One change is needed in [e2e/fixtures.ts](e2e/fixtures.ts) to make this safe. The console
diagnostics check currently runs at **worker** teardown, so a failure is reported against
the whole spec file; with 4 workers each spanning several files, that attribution gets
materially worse. Keep the worker-scoped `browser` proxy that installs the watchers, but
move the *assertion* into a test-scoped `auto` fixture that snapshots the diagnostics list
at test start and throws at test end. Same net, better blame. The `IGNORED` patterns and
`FAILING_CONSOLE_TYPES` set carry over verbatim, as does the long comment explaining why
each exclusion exists.

### Spec changes

Two lines total. [encryption.spec.ts:30](e2e/encryption.spec.ts#L30) and
[timezone.spec.ts:14](e2e/timezone.spec.ts#L14) hardcode
`createClient({ url: 'file:e2e.db' })`; they import `E2E_DATABASE_URL` from the config
instead — which the config already exports today and nothing yet uses.

Nothing else in `e2e/` changes.

### Files

**New:** `e2e/preflight.mjs`
**Edited:** `playwright.config.ts`, `e2e/fixtures.ts`, `e2e/encryption.spec.ts`,
`e2e/timezone.spec.ts`, `.gitignore` (drop the now-unused `e2e.db*` entries)

---

## Part 2 — component tests in Vitest browser mode

### Extract the Web Awesome registration list

Move the 14 `import '@awesome.me/webawesome/...'` lines out of
[+layout.svelte](src/routes/+layout.svelte#L9-L22) into a new `src/lib/webawesome.ts`, with
their explanatory comment. `+layout.svelte` imports that module; so does the browser test
setup. One list, so a component registered for the app is automatically registered for its
tests — otherwise the two drift and a test silently falls back to an inert unknown tag,
which is the failure mode this whole part exists to remove.

### Config

```ts
// vite.config.ts — replaces the jsdom `client` project
{
  extends: './vite.config.ts',
  test: {
    name: 'client',
    include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
    exclude: ['src/lib/server/**'],
    setupFiles: ['vitest-browser-svelte', './vitest-setup-browser.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      screenshotFailures: false
    }
  }
}
```

The `server` project is untouched.

`vitest-setup-browser.ts` replaces `vitest-setup-client.ts`: it imports `$lib/webawesome`,
keeps the `globalThis.litIssuedWarnings` suppression (browser mode does not serve
`app.html`, so Lit's dev banner would otherwise be noise), and drops the `matchMedia` shim —
real Chromium has it.

**Deps:** add `@vitest/browser-playwright@4.1.11` (pinned to the installed Vitest — its peer
range is exact) and `vitest-browser-svelte@^3`, plus `playwright` explicitly as the
provider's peer. Remove `jsdom`, `@testing-library/svelte`, `@testing-library/jest-dom`.
`@playwright/test` stays for the e2e suite.

### Per-file migration pattern (22 files)

| Today | Becomes |
|---|---|
| `import '@testing-library/jest-dom/vitest'` | deleted — Vitest bundles these matchers, with retry |
| `import { render, screen } from '@testing-library/svelte'` | `import { render } from 'vitest-browser-svelte'` |
| `screen.getByText(x)` | `screen.getByText(x)` on the object `render` returns — now a locator |
| `expect(el).toBeInTheDocument()` | `await expect.element(loc).toBeInTheDocument()` |
| `expect(el).toHaveAttribute(k, v)` | `await expect.element(loc).toHaveAttribute(k, v)` |
| `screen.getAllByRole('link')` | `screen.getByRole('link').all()` |
| `await fireEvent.click(el)` | `await loc.click()` |

The `vi.mock('$app/state')` / `vi.mock('$app/paths')` blocks stay as written.

Representative files: [AppNav.svelte.test.ts](src/lib/components/AppNav.svelte.test.ts)
(mocks both SvelteKit modules, uses `getAllByRole`),
[EncryptionGate.svelte.test.ts](src/lib/components/EncryptionGate.svelte.test.ts) (mocks a
`$lib` module, uses `queryBy…` negatives).

**Pilot `AppNav.svelte.test.ts` before touching the other 21.** The one real unknown is
whether `vi.mock` of SvelteKit's *virtual* modules works under browser mode; `AppNav` mocks
both, so it settles the question in one file. If it does not work, the fallback is to stop
mocking `$app/paths` and let the real `resolve()` run.

Browser-mode limits to watch for: native `alert`/`confirm`/`print` cannot run, and spying on
module exports is restricted (`vi.mock(…, { spy: true })` is the workaround). Neither
appears in the current 22 files.

### Files

**New:** `src/lib/webawesome.ts`, `vitest-setup-browser.ts`
**Deleted:** `vitest-setup-client.ts`
**Edited:** `vite.config.ts`, `package.json`, `src/routes/+layout.svelte`,
all 22 `src/**/*.svelte.test.ts`

---

## Docs

- **AGENTS.md** — correct the CDN claim to `ElementInternals` (include the table above);
  rewrite the Component subsection now that rendered behaviour *is* assertable; drop the
  `workers: 1` bullet; document the per-checkout port and `RUN_DIR`; update the
  `VITE_DEV_ORIGIN` trap; refresh the "Honest baseline" numbers.
- **README.md** — run commands, and the note that a second e2e run in one checkout is
  refused by design.
- Copy this plan to `docs/historical-plans/2026-09-19-parallel-e2e-and-browser-mode.md` as
  part of done, per AGENTS.md's convention.

## Order of work

Part 1 and Part 2 are independent and can land separately.

1. `e2e/preflight.mjs` + the `playwright.config.ts` rewrite, still at `workers: 1`. Confirm
   a normal run is unaffected.
2. Move the diagnostics assertion to per-test, then turn on `workers: 4` /
   `fullyParallel: true`.
3. `src/lib/webawesome.ts` + the browser-mode project + pilot `AppNav.svelte.test.ts`.
4. The remaining 21 component tests; delete the jsdom project and its three deps.
5. Docs.

## Verification

**Part 1**
- `npm run test:e2e` — 51 specs green. Expect well under the current ~90s at 4 workers.
- Two worktrees at once — both pass; `lsof -i` shows two dev servers on different ports.
- Same directory twice — the second prints the preflight message and exits non-zero. It
  must *not* touch the first run's database: assert the first still passes.
- `Ctrl-C` a run mid-suite, then immediately start another — it must start cleanly, with no
  stranded state (this is what the port-as-mutex is buying over a lock file).
- After a run, `./local-media` is untouched and the attachments are under
  `$TMPDIR/bound-up-e2e-*/media`.
- Deliberately reintroduce something only the console watcher catches (an invalid `pattern`
  attribute) and confirm the run fails **and names the responsible test**, not just the file.

**Part 2**
- The decisive check, in the pilot test: `wa-input` must have a real shadow root with a real
  inner `<input>` — precisely what throws in jsdom. If that does not hold, Part 2 is not
  delivering its value and should stop.
- `npm test -- --project client` green across all 22 files.
- `npm run lint` and `npm run check` — 0 errors, 0 warnings, matching today's baseline.
  `e2e/**/*.ts` is in `tsconfig.json`, so the fixtures change is type-checked.
- The lint-staged hook (`vitest related --run`) still works and does not start a browser for
  unrelated changes.

## Risks

- **`vi.mock` of SvelteKit virtual modules under browser mode** — the one genuine unknown.
  Gated behind the pilot; fallback described above.
- **`fullyParallel` may expose hidden cross-test coupling.** It is one config line; drop back
  to `workers: 1` and fix the coupling separately if something surfaces.
- **Hash collision between two checkouts** is possible but harmless — the preflight message
  fires, and renaming either directory resolves it.
- **Another agent is editing this working tree right now.** ~30 files changed during
  planning, including `e2e/messaging.spec.ts` and 4 of the 22 component tests
  (`MessageBubble`, `RichText`, `RichTextEditor`, `UrlEmbed`). Part 1 barely overlaps; Part 2
  will conflict on those four. Worth doing this on a branch cut after their work lands, or
  at least doing Part 1 first.
