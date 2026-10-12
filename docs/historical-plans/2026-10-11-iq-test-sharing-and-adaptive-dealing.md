# IQ test: second round of changes

## Context

The IQ test (`/playroom/iq-test`, branch `iq-test`, nothing committed yet beyond `main`)
works end to end. This round reworks how questions are dealt and navigated, makes results
shareable, adds a `gooner` vibe, and reworks the media (porn columns, lightbox, overload
background, the media dock's tabs and panels). The user's answers to clarifying questions:

- **Word problems**: keep them, but drop the silly themed props ("18 lipsticks"). Items may
  be subtly suggestive, never cringe.
- **Sharing**: signed-in results use the stored row's id. Signed-out results use a URL that
  carries the result itself, signed so it can't easily be edited.
- **Bambi**: keep the label "Bambi & bimbo". Switch the porn to Bambi-specific sources, and
  have the copy lean Bambi without being too Bambi-specific.
- **Gooner**: the new default vibe. No hypno.

Docs: `docs/playroom.md` is the feature doc and changes with every section below.

---

## 1. Dealing and navigation (`src/lib/playroom/iq-test/run.ts`)

**Lazy, adaptive dealing.** The run currently deals all 30 questions at once. Instead, a
question is generated when its slot is first reached:

- `Run` gains `variants: number[]` (regenerations per slot) and `enoughDismissed?: boolean`.
  `questions`, `responses` and `statuses` grow together, so `isRunShaped` in `device.ts`
  still holds. Totals read `RUN_LENGTH` rather than `questions.length`, in `QuestionView`,
  `isExhausted` and `progress` on the page.
- **Per-slot rng**: `createRng(mixSeed(seed, index, variant))`. Add a small 32-bit hash
  `mixSeed` to `random.ts`. A run is then reproducible from its seed plus its answers. Say
  so in the doc's "Questions" section, which currently says "from its seed".
- **Kind for slot i**:
  - Slots 0–11 are one shuffled round of all 12 kinds, from `createRng(seed)`, the same as
    `dealKinds` does today. Every kind is asked once first.
  - Later slots are a weighted pick, excluding the previous kind. Each kind's weight comes
    from its record so far, counting a skip as wrong:
    - sub (rigged down): `clamp((1 + 2·wrong) / (1 + 2·right), 0.25, 4)`;
    - dom (rigged up): the reciprocal.
  - The clamp means no kind is ever excluded, only made rarer. Put this in a pure
    `nextKind(run, index, rng)`. The difficulty curve (`difficultyFor`) is unchanged.
- **Moving on: "next unanswered"**. `advance()` moves to the first index after the current
  one whose status is not `answered`. That covers a skipped question or the frontier. If
  the frontier is past the last generated question and under `RUN_LENGTH`, the next
  question is generated. If nothing is left, `index = RUN_LENGTH`, the "That's every
  question" page.
  - This one rule covers both "answering or skipping a returned-to question goes on to the
    next unanswered one" and ordinary forward progress.
- **`returnToSkipped(run)`** jumps to the first skipped index. `firstSkipped(run)` /
  `skippedCount(run)` are exported for the UI.
- **`goTo(run, index)`** is the single entry point for every move (advance, back,
  returnToSkipped). When the target is a **skipped question with a `memorise` phase**, it
  bumps `variants[index]` and regenerates that slot: same kind and difficulty, new rng.
  The digits or words are therefore new, and still deterministic from the seed.
- **Back on question 1**: `QuestionView`'s Back is always enabled. At index 0 it calls a
  new `onexit`. The page then goes to the intro stage:
  - nothing attempted: the run is dropped, and the button says "Begin assessment";
  - something attempted: the run is kept as `resumable`, and the button says "Carry on".

## 2. Question UI

`src/lib/components/iq-test/QuestionView.svelte`:

- **Controls**: Back · **Return to skipped** (shown when some other question is skipped) ·
  Skip. Add `margin-block-start` (~1rem extra) to `.controls`.
- **The "enough for a score" banner**:
  - It shows only while `!isExhausted(run)`. The end page has its own finish button.
  - With skips, it adds "You skipped N." and a "Go back to them" button, which calls
    `returnToSkipped`.
  - It is dismissible: an icon `wa-button` with `<wa-icon name="xmark" label="Dismiss">`,
    which sets `run.enoughDismissed`, so the choice survives a reload.
  - Once dismissed, a small outlined "Finish early" button sits in the header row.
  - The banner copy in `copy.ts` gets a `skipped` variant per vibe.
- **End page**: also offers "Return to skipped" when there are skips.

`QuestionCard.svelte`:

- **Stroop "What does this word say?"**: the answers become colour blocks. `stroop.ts`
  sets `swatch: Colour` on those choices; the label stays as the accessible name, and the
  card draws a filled block in `INK[swatch]`. The "what colour is the ink" variant keeps
  its word labels.
- **Matrix answers** are too small and off-centre. The likely cause is `place-items:
  center` on `.shapes .choice`: it shrinks the SVG's `inline-size: 100%` to almost
  nothing. Stretch the SVG instead. Widen `.choices.shapes` and `.matrix` to about
  `min(100%, 24rem)`, keeping `margin-inline: auto`. Check in the browser at both layouts.

**Word problems** (`questions/words.ts` `WORD_PROBLEM_CAST`, `word-problem.ts`):

- Replace the prop items with ordinary countable things from each vibe's world, worded
  plainly and only subtly suggestive. Examples: dresses or heels; days locked; hours
  online; clients; photos sent.
- Let a template's verbs come from the cast, so no sentence reads as absurd.
- Keep every answer a whole number. Add a test that no prompt contains the old items.

## 3. Gooner vibe, and Bambi leaning Bambi

- `settings.ts`: `VIBES = ['gooner', 'bambi', …]`. `SetupDialog` defaults to `'gooner'`
  (`initial.vibe ?? 'gooner'`), and so does the `analysis.ts` fallback.
- TypeScript will list every `Record<Vibe, …>` that needs a `gooner` entry:
  - `copy.ts`: `VIBE_OPTIONS`, `VIBE_BRANDS`, intros, banners, `TAUNTS`;
  - `themes.ts`: `VIBE_THEMES`, dark with a neon or PMV feel;
  - `analysis.ts`: `VIBE_BELOW`, `SUB_LOW_HEADLINES`, `SUB_HIGH_HEADLINES`, and the new
    skip lines;
  - `words.ts`: `MEMORY_WORDS`, `VIBE_RELATIONS`, `VIBE_VOCABULARY`, `SYLLOGISM_TERMS`,
    `WORD_PROBLEM_CAST`;
  - `media.ts`: `SOURCES`.
- `playsHypno` stays bambi-only.
- **`SOURCES`**:
  - Bambi: Bambi-specific tags (candidates: "Bambi Sleep", "Bambisleep", "Bimbo Hypno",
    "Hypno", "Brainwash", "Trance", "PMV") and a Bambi-adjacent subreddit.
  - Gooner: gooning tags ("Gooning", "Goon", "PMV", "Edging") and a gooning subreddit.
  - **Check each candidate live** against the Redgifs search API and reddit's feed during
    implementation. Keep only those with real, on-theme results, and record the check in
    the doc's Pictures table, as was done for the current list.
- **Bambi copy review**: the brand, taunts, intros and results lines lean towards Bambi
  Sleep ("good girl", dropping deeper, Bambi as a name, the occasional trigger phrase),
  without becoming an in-joke for Bambi Sleep fans only.
- Treat all of it as data, the same as the existing copy.

## 4. Results

`Results.svelte`, `BellCurve.svelte`, `analysis.ts`, `scoring.ts`:

- **The marker line** stops at the dot: `y1 = y(iq)` instead of `y(iq) - 14`.
- **The classification** (`classify()`) is shown directly under the number, at matching
  prominence, scaling with simplicity like `.number` does. It moves out of the facts list.
  It is shown in every presentation.
- **Skips**: `Score` gains `skipped`. `Analysis` gains `skipLine: string | null`, a per-vibe
  mocking line naming the count. It is set only for an explicit run by a sub; it is null
  for a dom and for clinical. Facts gain a neutral "Skipped" entry.

## 5. Shareable results (`/playroom/iq-test/<id>`)

- **The route**: move `src/routes/(standalone)/playroom/iq-test/` to `…/iq-test/[[id]]/`.
  - Since the route is the same, `goto` keeps the page component, so the hypno keeps
    playing.
  - Update the route id in `tools.ts` and in every `resolve()` that names it.
  - The cookie path `/playroom/iq-test` already covers sub-paths.
- **The account-result URL is the row's UUID.** A new `getIqTestResult(db, id)` in
  `src/lib/server/iq-test.ts`:
  - it selects explicit columns plus `ownerId`, and the load turns that into `isMine` and
    never returns the owner;
  - the result page is public, by unguessable id;
  - a deleted result answers 404.
- **The signed-out URL is a signed token.** A new `src/lib/server/iq-test-share.ts`:
  - it packs role, presentation, vibe, iq, correct, attempted, skipped, sober, target and
    createdAt into about 14 bytes;
  - it appends a 12-byte HMAC-SHA256 under the auth secret, with purpose
    `iq-test-share`, reusing the approach of `keyed-hash.ts`;
  - the whole is base64url, around 35 characters, opaque and not editable.
  - The secret is read as `api/account-recovery` does: `(await locals.auth.$context).secret`.
  - A new `POST /api/playroom/iq-test/results/share` validates against
    `iqTestResultSchema` and returns `{ token }`, storing nothing.
  - Say in the doc and at the site that this stops URL editing only. The score is reported
    by the browser either way, as it already is for accounts.
- **The DB and schema**:
  - `iq_test_results` gains `skipped integer not null default 0`. No real users yet, so
    delete the uncommitted `0022` migration and its snapshot, and regenerate it with
    `npm run db:generate -- --name add_iq_test_results`.
  - `iqTestResultSchema` gains `skipped`, refined to `correct + skipped <= attempted`.
  - `IqTestResultView` gains `skipped`.
- **Finishing** (`finish()` on the page):
  1. Show the results first, as now.
  2. Save to the account, or get a share token.
  3. `goto(resolve('/(standalone)/playroom/iq-test/[[id]]', { id }), { noScroll, keepFocus })`.
  - A failed save leaves the URL alone and offers the existing retry.
  - Device history entries store their `shareToken`.
- **The load** with an `id`:
  - a UUID gives the row, or a 404;
  - anything else is verified as a token, or 404s;
  - it returns `shared: { result, isMine }` and renders with the dialog closed.
- **The page** with `data.shared` shows the results stage from it.
  - Its theme comes from the result's settings, which are **not** remembered.
  - For someone else's result, the history is replaced with "Take the test yourself".
  - "Take it again" and "Start over" go to the bare route with the dialog open.
  - `ResultHistory` rows link to their result URLs.

## 6. Page layout and media

`+page.svelte`, `MediaPanel.svelte`, `ClipPlayer.svelte`, new components:

- **The footer**: `align-items: center`, plus a line of the current settings: role,
  intensity, vibe, and sober/target when set. Pull the label lookup from `ResultHistory`
  into a shared `describeSettings()` in `copy.ts`, used by both.
- **Wide layout**:
  - `.with-media` uses `grid-template-columns: repeat(n, minmax(0,20rem)) minmax(0,44rem)
    repeat(n, minmax(0,20rem))`.
  - `n` per side is `clamp(floor((frameWidth − 44rem − gap) / 2 / (20rem + gap)), 1, 3)`,
    measured with `bind:clientWidth`.
  - Each extra column is another `MediaPanel` with its own `offset`, and a new `stride`
    prop (the total column count) so no two show the same clip. Only the first is audible.
- **The columns start at the top of the page.** On the wide layout, the brand header moves
  into the centre grid column, so the side columns span from the page's top edge.
- **Remove `aspect-ratio: 9 / 16`** from the `<video>` (in `ClipPlayer`) and from the
  narrow-strip rule on the page. The loading placeholder and the Redgifs iframe keep a
  size, because they have no intrinsic one.
- **The lightbox**: a new `MediaLightbox.svelte`, a `wa-dialog` with light dismiss.
  - Each picture and clip in `MediaPanel` becomes a button ("Enlarge picture" or
    "Enlarge clip"). The column loses `aria-hidden` and `pointer-events: none`.
  - Hovering shows a large centred `expand` icon, under `(hover: hover)` only.
  - A picture shows full size. A clip plays in its own `ClipPlayer` on the clips channel,
    likely served from the HTTP cache.
- **Overload background**: a fixed, full-viewport layer behind the content. It plays a
  muted, looping-to-next `ClipPlayer` (new `cover` prop, `object-fit: cover`) from an
  offset no column uses, under a dimming overlay so the sheet stays legible. It sits below
  `FlashLayer`.

## 7. Media dock

`MediaTab.svelte`, `dock.ts`, `HypnoBrowser.svelte`, page:

- **The hypno icon** is a spiral. A new inline-SVG `SpiralIcon.svelte` (Font Awesome has no
  spiral), passed through a new `iconSnippet` prop on `MediaTab`.
- **The tab layouts**: replace the 1–5 `DockStage` with a `TabLayout` of
  `{ title, detail, slider, action: 'label' | 'icon' | null, more }`, computed per tab from
  its share of the dock.
  - The **action** is shuffle ("New porn") for porn and next-step ("Next hypno") for the
    hypno. It is labelled when there is room, an icon alone with less, and absent at the
    narrowest.
  - The porn tab sets `more: false` once the slider and the labelled shuffle both fit,
    since then everything its panel held is already in the tab.
  - Re-measure the thresholds in the browser, as was done for `STAGE_MIN_WIDTHS`, and
    update `dock.test.ts`.
- **Expanding**:
  - The tab's own contents become the panel's header: the full title (the hypno title one
    step larger), the detail, the volume slider and the action.
  - The collapse button moves to the panel's top-right corner. The bottom bar is gone.
  - **The animation**: a small attachment does a FLIP with the Web Animations API. It
    measures the box before and after the change, then animates `width` and `height`
    together with overflow clipped, and fades the swapped contents. This replaces the
    `flex-grow` transition, which caused the collapse jump. No library is needed:
    Svelte's transitions cover enter and exit only, Motion's layout animation is
    React-only, and WAAPI does this in about 30 lines.
- **The hypno panel**:
  - A pause/play button calls `toggleMuted('hypno')`. It shows pause while the hypno is
    audible and play while it is muted.
  - Next hypno, then **Select hypno**, which shows the `HypnoBrowser` in a scrollable
    section below and becomes "Hide hypnos".
  - Choosing a file no longer closes the panel: drop `onchosen`'s close.
  - In the results, the playing file shows a "Playing" badge or indicator instead of its
    Play button.
- **Clicking outside** an expanded panel collapses it, through a `pointerdown` listener on
  `document`, ignoring clicks inside the tab and inside an open `wa-dialog`.
- **Fullscreen**:
  - Shown only when `document.fullscreenEnabled` is true, which is false on iPhone Safari.
  - In `SetupDialog`, a switch bound to the live `fullscreenchange` state that calls
    `requestFullscreen` / `exitFullscreen` from the toggle gesture.
  - In the dock, an icon-only tab (`expand` / `compress`, `<wa-icon label>`). The dock
    shows when any of its tabs is present, and dock widths account for this tab.
  - Put the small shared state in `src/lib/playroom/iq-test/fullscreen.svelte.ts`.
- **`SetupDialog`**: remove the `hypno-note` paragraph and its icon, and update the
  doc's "The setup dialog says it will play".

## 8. Tests

The cheapest level that catches each one:

- **Node**:
  - `engine.test.ts`: every kind in the first 12; no kind twice in a row; over many seeds a
    sub sees more of their failed kinds and a dom more of their right ones, with no kind
    ever absent after round one; next-unanswered order after skips; `returnToSkipped`;
    regenerating a skipped memorise question gives a new deterministic item list; the same
    seed and responses give the same run.
  - `questions.test.ts`: stroop "says" choices carry swatches; the word-problem prompts.
  - Analysis: the skip line per role and presentation, and the classification.
  - `iq-test-share`: round trip; any changed byte and a wrong secret are rejected.
  - Route tests for the `[[id]]` load (UUID mine and not mine, a token, garbage → 404) and
    for the share endpoint.
- **Browser**:
  - `QuestionView`: return to skipped; dismiss leaves "Finish early"; no banner on the end
    page; Back enabled on question 1 calls `onexit`.
  - `QuestionCard`: swatches and the matrix size.
  - `BellCurve`: the marker's top equals the dot's centre.
  - `Results`: the classification and the skip line.
  - `MediaTab`: the layouts, no "more" when everything fits, collapse in the top right.
  - `HypnoBrowser`: the playing indicator, and that it stays open.
  - `MediaPanel`: the lightbox opens.
  - `SetupDialog`: gooner by default, no hypno note, fullscreen only when supported.
- **e2e** (`e2e/iq-test.spec.ts`):
  - Finishing changes the URL to `/playroom/iq-test/<id>`, and a reload shows the same
    score. A fresh context opens a signed-out share link. An edited token 404s.
  - Skip, then return, then answer, lands on the next unanswered question.
  - A click outside collapses the hypno panel.
  - Update the existing assertions on `hypno-note`, stages and route.

## 9. Docs and records

- `docs/playroom.md`: every section touched above, including dealing, navigation,
  vibes, Pictures, columns, lightbox, background, the dock, fullscreen, Results, sharing,
  and History.
- `src/lib/roadmap/roadmap.json`: update the `bimbo-iq-test` entry's summary if it no
  longer fits.
- Copy this plan to `docs/historical-plans/2026-10-11-iq-test-sharing-and-adaptive-dealing.md`.

## Verification

1. `npm run check`, `npm run lint`, `npm test` (vitest node and browser, then Playwright).
2. `npm run test:e2e:image`, because the route move and the new endpoint must work in the
   Node build.
3. Run the app (`npm run dev`) and check by hand: wide and phone widths, the column count
   on an ultra-wide window, the lightbox, the overload background, the dock's
   expand/collapse animation (no width jump), fullscreen in Chromium, a share link in a
   private window, and the matrix answers' size and centring.
4. `npm run db:generate` produces only the regenerated `0022`. Read its SQL.
