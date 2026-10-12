# Playroom + Bimbo IQ test

## Context

Bound Up needs a home for small, miscellaneous kink tools that are not Sessions, Notebook or Tasks. That home is the **Playroom**. Its first tool is a **dumbification IQ test**. The test is built to give a low score to a sub who wants one, either openly or subtly depending on settings, and a flattering score to a dom taking it to lord it over their sub.

The test works on its own: it is public at `/playroom/iq-test`, needs no account, and avoids looking like part of the app (a subtle Bound Up link is fine). Signed-in users get their result history saved to their account. Anonymous users get a history on their device.

Decisions already made with the user:
- **Imagery** comes from Reddit/Redgifs feeds.
- **Placement:** a Playroom card on `/home`, with no feature flag and no new nav tab.
- **URL:** `/playroom/iq-test`.
- **Sober IQ and target IQ** are optional inputs under an "extra options" section of the dialog. They are only used for comparison in the results; the target does not steer the rigging.
- **Storage:** plaintext on the server, like tasks and rewards.
- **Anonymous history** is kept on the device only.

## 1. Playroom shell (in the app)

- **`src/routes/(auth-required)/(app)/playroom/+page.svelte`**: an index page laid out like `home/guides/+page.svelte`, with an 800px column, `h1` "Playroom" and a single root element.
  - It shows a list of tool cards. A tool's name, blurb, icon and `href` come from a small registry, `src/lib/playroom/tools.ts`, which is alias-free.
  - It has no load function and no feature gate.
  - Tools open in their own standalone pages, which leaves the app shell.
- **`src/lib/components/PlayroomWidget.svelte`**: built on `SectionWidget` (title "Playroom", icon `dice` or `masks-theater`, `href` = `resolve('/(auth-required)/(app)/playroom')`).
  - Its body shows the latest IQ result when there is one ("Last IQ test: 74").
  - It is added last in `home/+page.svelte`.
  - `home/+page.server.ts` gets a one-row query for the latest result, with explicit columns.

## 2. Standalone route group

- **New group `src/routes/(standalone)/`.** This is a third shell next to `(public)` and `(app)`. Its route is `(standalone)/playroom/iq-test/`.
  - SvelteKit allows this alongside `(app)/playroom` because the two are different routes.
- **Its `+layout.svelte`** undoes the app look through `<svelte:head><style>`, the same trick the other shells use:
  - `--page-texture: none`
  - its own `body` background and fonts
  - an `h1` override to beat theme.css's Muddy Tractor
  - a wrapper carrying `wa-light` or `wa-dark` and the presentation's tokens
- **Page title** is "Cognitive Assessment", or a vibe-specific variant. A fictional institute name is used, never a real organisation such as Mensa.
- **Footer** has a small "made in Bound Up's playroom" link.
- The root layout's notices (`RequestFailureNotice`, `UpdateAvailableNotice`) stay. That is acceptable.

## 3. Test engine: pure, alias-free, `src/lib/playroom/iq-test/`

### `settings.ts`

A Zod schema and types for the settings:

- `role`: `'dom' | 'sub'`
- `presentation`: one of five modes. These are internal ids; the user-facing copy is written fresh, not the brief's wording.

  | Id | What it is |
  | -- | ---------- |
  | `clinical` | Official throughout |
  | `clinical-debrief` | Official during the test, mocking or degrading at the results |
  | `illustrated` | A normal test with porn around it |
  | `overload` | Porn and distraction (flashes, ramping up) |
  | `suggestive` | Lightly and evocatively themed |

- `vibe`: `'bambi' | 'misogyny' | 'denial' | 'feminisation' | 'degradation'`. Required unless the presentation is `clinical`; ignored when it is.
- `soberIq?`, `targetIq?`: integers from 40 to 200.

### `random.ts`

A seeded PRNG (mulberry32) with `pick`, `shuffle` and `int` helpers. A run is reproducible from its seed, which keeps tests deterministic and lets the seed be stored with each result.

### `questions/`

One generator per kind: `(rng, difficulty 1–5, context) => Question`. The `context` carries the presentation and vibe, so wording and word banks can be flavoured; `clinical` stays neutral. A `Question` is either `{kind, prompt, choices, answer}` or `{kind, prompt, freeText, normalise, answer}`, plus optional `stages` for multi-step questions.

| Kind | Format | Notes |
| ---- | ------ | ----- |
| Number series | Free text at high difficulty | |
| Letter series | Multiple choice | |
| Analogies | Multiple choice | Vibe word bank |
| Odd one out | Multiple choice | |
| Synonym / vocabulary | Multiple choice | |
| Syllogism | Choice of true / false / can't tell | |
| 3×3 shape matrix | Multiple choice | Inline SVG; rules for count, rotation and fill |
| Stroop | Multiple choice | A colour word in a different ink. Asks either "what does the word *say*" or "what colour is the *ink*", and the instruction flips between questions. |
| Working memory | Free text | Remember N words, then do an arithmetic problem, then recall the words. |
| Backwards digit span | Free text | |
| Arithmetic word problem | Free text | |

The working-memory kinds are where distraction hits hardest.

### `run.ts`

Builds a run of 30 questions from the seed: shuffled kinds, with difficulty ramping and offset by role. It also tracks answer and skip state, and exposes `canFinish` once 12 questions have been attempted.

### `scoring.ts`

Turns a raw score into an IQ, which is where the rigging happens:
- **Sub:** difficulty +1 and a harsher norm (a higher expected-correct baseline).
- **Dom:** difficulty −1 and a lenient norm.
- **Both:** skipped questions count as wrong, the IQ is clamped to 40–160, and the percentile comes from a normal CDF (mean 100, SD 15).
- The rigging is never mentioned in `clinical` mode, which is the subtle mode. Explicit modes may admit to it in their copy.

### `analysis.ts`

Picks results copy from the IQ band × presentation × vibe:
- **Comparisons**, e.g. "as sharp as a high schooler" or "a golden retriever", with sets that vary by vibe.
- **Bell-curve explainer**, shown when the IQ is below 85.
- **Sober and target deltas.**
- **Simplicity level** (`full` / `simple` / `very-simple`) for IQs above 85, 70–85, and below 70.

### `copy/`

Per-presentation and per-vibe strings for the intro, the question chrome and the results. This is adult prose, treated as data.

## 4. UI: `(standalone)/playroom/iq-test/`

### `+page.svelte`

A three-stage state machine: intro → questions → results. Components live in `src/lib/components/iq-test/`.

### `SetupDialog.svelte`

A `wa-dialog` sized to nearly the full viewport (a small margin around the edges shows the page below).
- **Open on every visit.** It is rendered open server-side, so nothing flashes before it appears.
- **Content:**
  - The kink-only, adults-only disclaimer.
  - A photosensitivity warning, shown when `overload` is chosen.
  - The presentation options.
  - The vibe picker, only when the presentation is not `clinical`.
  - A "More options" `wa-details` holding the sober and target IQ fields.
- **Two submit buttons:** "I'm the one in charge and know what I'm doing" and "I'm a dumb little sub, but even I get it". Each sets the role and starts.
- **The X button** closes the dialog with the last-used settings, which are kept in `localStorage` (wrapped in try/catch), or the defaults (`sub`, `clinical`).

### `QuestionView.svelte`

- Navigation: Back, Skip and Next.
- A progress indicator. After 12 attempts it adds a banner, "That's enough for a score — finish now or keep going", with a Finish button.
- Free-text questions use `wa-input`, and their state is read from the element, per the autofill note in AGENTS.md.
- The in-progress run (seed, index and answers) is kept in `sessionStorage`, so a reload resumes after the dialog instead of losing typed answers.

### Presentation layer: `Stage.svelte`

- **`illustrated`:** side and background media panels.
- **`overload`:** CSS flashes and media cuts whose frequency ramps with progress. They are timed to land during the retention gap of memory questions. Under `prefers-reduced-motion` the flash rate drops, but the images remain.
- **`suggestive`:** palette, type and copy only.
- **`clinical` and `clinical-debrief`:** a sterile light theme.

### `Results.svelte`

- The IQ and percentile.
- An inline SVG bell curve with the score marked, plus the explainer when the score is low.
- The comparisons, and the sober and target comparisons.
- The layout simplifies by level: bigger type, fewer words and fewer sections as the score drops.
- **History list:**
  - Signed-in users see their server history from the load, with delete per row.
  - Anonymous users see their device history and a subtle "Keep these with an account" link to `/signup?redirectTo=…`. The allowlist needs checking.

## 5. Media feed

- **`src/lib/playroom/iq-test/media-sources.ts`**: a fixed map from vibe to a subreddit allowlist. Candidates are listed below for the user to confirm while implementing.
- **`src/routes/api/playroom/iq-test/media/+server.ts`**: `GET ?vibe=` is public, and only allowlisted subreddits are fetched, so it is not an open proxy.
  - It fetches each subreddit's `top/.rss?t=week`, the same RSS route `/api/oembed` already uses for `outbound`.
  - It extracts `i.redd.it` image URLs and Redgifs ids, then returns a shuffled `{images, redgifs}`.
  - Results are cached in a module-level `Map` with a 1-hour TTL and returned with `Cache-Control: public, max-age=3600`. This holds public data only, not `db` or `auth`, so it does not break invariant 2.
- **Client:**
  - Images are `<img referrerpolicy="no-referrer">`.
  - Redgifs is the existing sandboxed `/ifr/<id>` frame, reusing `redgifsSpec` and the related pieces in `src/lib/embeds.ts`.
  - The fetch goes through `tryFetch`. A failure falls back to effects only, with no notice, because it is decoration nobody is waiting on.
- **Candidates to confirm:** r/BimboFetish, r/bimbofication, r/BambiSleep, r/sissyhypno, r/feminization, r/chastity, r/humiliation, plus a few general NSFW subreddits for misogyny.
- **Risk:** Reddit may throttle server fetches. The design degrades to effects-only.

## 6. Persistence

- **Schema:** `iq_test_results` in `schema/app.ts`.
  - Columns: `id`, `ownerId` (cascade delete), `role`, `presentation`, `vibe` (nullable), `questionCount`, `attempted`, `correct`, `iq`, `soberIq?`, `targetIq?`, `seed`, `...timestamps`.
  - Index on `(ownerId, createdAt)`.
  - Export `$inferSelect` and `$inferInsert`.
  - Generate the migration with `npm run db:generate -- --name add_iq_test_results` and read the SQL.
- **Zod schema** in `src/lib/schemas/iqTestResult.ts`, shared by the client and the endpoint.
- **`POST /api/playroom/iq-test/results`**: returns 401 when signed out, validates the body, inserts, and returns the row. The score is self-reported, which is fine for a toy.
- **`DELETE /api/playroom/iq-test/results/[id]`**: scoped to the owner, 404 otherwise.
- **Writes** happen on finishing, through `tryFetch`. A failure shows an inline "couldn't save" with a retry, and the local copy is kept so the result is not lost.
- **`+page.server.ts` load:** the user's last 20 results with explicit columns, or `null` when signed out.
- **View type:** `IqTestResultView` in `src/lib/types.ts`.
- **Device history:** a `localStorage` list capped at 20, wrapped in try/catch.

## 7. Docs, roadmap and AGENTS.md

- **`docs/playroom.md`**, a new doc covering:
  - the Playroom container and the tool registry
  - the standalone group
  - the test's settings, the rigging rules, the question kinds
  - the media feed and its allowlist
  - storage
- Add `docs/playroom.md` to the feature-docs table in AGENTS.md.
- **AGENTS.md changes:**
  - Repo-map rows for `src/lib/playroom/` and `(standalone)/`.
  - "Two shells, one per group" becomes three, with the standalone group's rule: no app chrome, and undo `theme.css` locally.
- **Roadmap:** add a `playroom` branch to `roadmap.json` with a `bimbo-iq-test` item (`shipped`, with `shippedOn` set to the ship date). `kink-quizzes` stays under Notebook.
- **Historical plan:** copy this plan to `docs/historical-plans/YYYY-MM-DD-playroom-and-iq-test.md`, using the implementation date.

## 8. Tests

- **Pure** (node project):
  - PRNG determinism.
  - Each generator: the answer is among the choices or satisfies `normalise`, the output is the same for the same seed, and a higher difficulty gives harder parameters.
  - `run.ts`: skip/back state and the `canFinish` threshold at 12.
  - `scoring.ts`: for an identical raw score, sub < dom; clamping; percentile.
  - `analysis.ts`: band and simplicity selection, the explainer below 85, and sober/target deltas.
  - The settings schema: vibe is required unless the presentation is `clinical`.
- **Server:**
  - Results endpoint: 401 when anonymous, 400 on a bad body, an insert, and delete scoped to the owner.
  - Page load: `null` for anonymous, own rows only for a signed-in user.
  - Home load: includes the latest result.
  - Media endpoint: stubbed `fetch` RSS, the allowlist enforced, cache hit on the second call, and an empty list when upstream fails.
- **Component** (browser project):
  - `SetupDialog`: open by default, the vibe picker appears only for non-clinical presentations, X closes with defaults, and the role buttons start the test with the right role.
  - `QuestionView`: skip, back, and the finish banner at 12.
  - `Results`: simplified layout for a low IQ, and the bell-curve marker.
  - `PlayroomWidget`.
- **e2e** (`e2e/iq-test.spec.ts`), with the media endpoint stubbed through `page.route`:
  - Signed out: `/playroom/iq-test` loads without a redirect, the dialog shows on every visit, answering or skipping 12 questions lets you finish and see a result, and the device history appears on the next visit.
  - Signed in: a result is saved to the account and shown in the history.
  - The Playroom card on `/home` leads to `/playroom`, which leads to the test.

## Verification

1. Run `npm run check`, `npm run lint` and `npm test` (vitest plus Playwright).
2. Run `npm run test:e2e:image`, because it is a new route group and the Node build must render it.
3. Run `npm run preview` and load `/playroom/iq-test` against the Workers runtime to check the media endpoint's fetch.
4. Check each presentation × role by hand in `vite dev`: the dialog, a full run, finishing early, the results at low and high IQs, and the history both signed in and signed out.
