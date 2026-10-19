# Debug mode

## Context

There is no general way to show troubleshooting UI. The only testing aid is the
IQ test's "Correct answer", "Incorrect answer", "Skip question" and "Clear
timer" buttons. They sit behind a feature of their own, `iqTestAnswerButton`,
and an account that holds it sees them all the time.

The change adds **debug mode**:

- An account gets access through a feature, `debugMode`, granted from `/admin`.
- The account holder switches it on or off themselves, **per device**.

While it is on:

- the bottom nav's corner toggle is visible;
- `/settings` shows a debug info panel;
- the IQ test shows its testing aids;
- Daydreams can switch to a raw chat log.

`iqTestAnswerButton` is folded into `debugMode`, and existing grants are
migrated.

Decisions taken with the user:

- **Per device:** a cookie, so SSR knows the answer and other devices are
  unaffected.
- **Two ways to switch it:**
  - a switch on `/settings`;
  - a hidden corner button in the bottom nav, invisible until hovered while
    off and always visible while on. That visible button is the "it's on"
    badge, so there is no separate strip.
- **The bottom nav's buttons are centred**, with at least a 1em gap.
- **A debug info panel on `/settings`.**
- **Daydreams raw chat log:**
  - Each passage seals its full raw model reply, verbatim, beside what is
    stored now, but only for accounts granted `debugMode`.
  - The request side (system prompt and messages) is rebuilt on demand.

## Rule

`debug = holds debugMode AND cookie debug=1`. The server always computes it, so
a cookie left behind after a revoke does nothing. It decides only what is
shown. The one server endpoint it serves, the rebuilt prompt, checks the
feature itself.

## Changes

### 1. Feature, cookie and plumbing

- In `src/lib/features.ts`, replace the `iqTestAnswerButton` entry with
  `debugMode`. Name: "Debug mode". Description: switch on troubleshooting
  options and info on any of the account's devices.
- Add a custom migration with
  `npx drizzle-kit generate --custom --name fold_iq_answer_button_into_debug_mode`.
  The pattern follows `drizzle/0034_backfill_daydream_turn_tree.sql`:
  ```sql
  UPDATE OR IGNORE `user_features` SET `feature` = 'debugMode' WHERE `feature` = 'iqTestAnswerButton';
  --> statement-breakpoint
  DELETE FROM `user_features` WHERE `feature` = 'iqTestAnswerButton';
  ```
- `src/lib/debug.ts` (alias-free) holds `DEBUG_COOKIE = 'debug'` and
  `debugModeOn(features, cookie)`.
- `src/lib/server/debug.ts` holds:
  - `readDebugMode(db, userId, cookies)`, which uses `userHasFeature`;
  - `setDebugCookie(cookies, on)`: `path: '/'`, `httpOnly`, `sameSite: 'lax'`,
    one-year `maxAge`; turning it off deletes the cookie.
- **`(app)/+layout.server.ts`** returns
  `debug: debugModeOn(features, cookies.get(DEBUG_COOKIE))`. It reuses the
  `features` it already lists. The early return sets `debug: false`.
- **The IQ page load** (`(standalone)/playroom/iq-test/[[id]]/+page.server.ts`)
  replaces `userHasFeature(…, 'iqTestAnswerButton')` with `readDebugMode`,
  returning `debug`.
  - The page passes `answerButton={data.debug}`.
  - `QuestionView.svelte` keeps its prop name; only the doc comment changes.
  - Update the `timersCleared` comment in `playroom/iq-test/device.ts`.

### 2. Switching it on and off

- Add a `debug` action on `(app)/settings/+page.server.ts`.
  - It calls `requireFeature(…, 'debugMode')`, reads `on`, and calls
    `setDebugCookie`.
  - It is a plain `use:enhance` form, like logout beside it, with a comment
    giving the reason: one boolean, nothing to validate. On a failure it calls
    `reportRequestFailure`.
  - `update()` invalidates, so `page.data.debug` follows.
- On `/settings`, add a "Debug mode" row with a `wa-switch`.
  - It is shown only with `hasFeature(page.data.features, 'debugMode')`.
  - Changing the switch submits the form.
  - The switch is already registered in `src/lib/webawesome.ts`.
- `src/lib/components/AppNav.svelte` changes:
  - **Centring.** The nav becomes a grid, `1fr auto 1fr`. The links go in a
    centred middle group with `gap: 1em`, and each link is `flex: 0 0 auto`
    with a `max-width` so long partner names still ellipsise. The right-hand
    column holds the debug toggle, so it can never overlap the links however
    many partners there are.
  - **The corner toggle.** New props `debugAvailable` and `debugOn`, passed
    from the `(app)` layout.
    - With access, render a small form posting `on={!debugOn}` to
      `/settings?/debug`, aligned to the bottom-right corner.
    - The button is a native `<button aria-pressed>`, with a comment saying it
      is a toggle, because `wa-button` forwards no ARIA state. It has a
      bug `wa-icon` labelled "Debug mode".
    - While off: `opacity: 0`, and `opacity: 1` on `:hover` and
      `:focus-visible`, so a keyboard user can still find it.
    - While on: always visible, in the brand colour.
    - Without access it is not rendered at all.
  - Update the `AppNav.svelte.test.ts` mocks and props.

### 3. Debug info panel: `src/lib/components/DebugInfo.svelte`

It appears on `/settings` when `page.data.debug`.

What it lists:

- Version
- User id
- Account timezone, against the device timezone
- Features held
- Keyring status (`currentKeyring().status`)
- `pushSupport()`, and `storedPushDeviceId()`
- Whether a service worker controls the page
- Display mode: standalone or browser
- Visual viewport size
- User agent

How it works:

- Browser values fill in after mount.
- A "Copy" button copies every line as plain text.
- It shows no keys and nothing sealed.

### 4. Daydreams raw chat log

**Storage: `daydream-turn` v4** in `src/lib/sealed-kinds/daydreams.ts`.

- A text turn gains an optional `raw: string`: the model's reply exactly as
  it streamed in, verbatim, with nothing referenced or compacted.
  - It is capped at `DAYDREAM_LIMITS.rawReply` (about 24,000 characters,
    which is above passage + expansion + meta at their own caps).
  - A longer reply is stored cut, with `rawTruncated: true`, so the view can
    say so.
- The v3 → v4 upcast is the identity.
- Add a frozen v4 fixture in `src/lib/sealed-fixtures/` per its README.
- Raise `maxCiphertextLength` from 48 KB to fit the worst case:
  8000 (text) + 8000 (expansion) + 24,000 (raw) + meta, encrypted and
  base64-encoded. That comes to about 64 KB, so set it to 96 KB. Check this
  against how the limit is enforced and how body sizes are capped on the turn
  endpoint, and raise any request cap that would now refuse a large turn.
  - The change is safe for existing records. It only lets bigger new records
    in.

**Only for accounts granted `debugMode`.**

- The browser seals the turn, so the server cannot see `raw` and cannot
  enforce this.
- So `DaydreamStory` takes a `keepRawReplies` flag. The page sets it from
  `hasFeature(page.data.features, 'debugMode')`: the feature is granted,
  whether or not debug mode is switched on on this device.
- Without the grant, `raw` is never written. That is the guarantee: turns of
  accounts without the grant stay exactly as they are now.
- The daydreams `+page.server.ts` for `[id]` needs `features` in its data. It
  comes from the `(app)` layout already, through `page.data`.

**Capture** (`src/lib/daydream/client.ts` and `story.svelte.ts`).

- `writeReply` exposes the raw text accumulated so far: `raw` on
  `ReplyOutcome`, including failures, and on the abort path through the
  callback.
- When `keepRawReplies`, `#start` adds `raw` (and `rawTruncated`) to the
  content it saves, Stop included. In that case it is the partial raw text
  that had arrived.
- Turns written without the grant, or before this change, show "Raw reply not
  recorded".
- A failed reply's raw text (which is never saved) is kept in memory on the
  story's `problem` state, for the raw view.

**The rebuilt prompt: `POST /api/daydreams/[id]/prompt`.**

- It takes the same body as `/reply` (`replyRequestSchema`) and returns
  `buildMessages(…)` as JSON, without calling the model.
- It calls `requireFeature` for both `daydreams` and `debugMode`, plus the
  ownership check `/reply` uses.
- It logs nothing, under the same console-spy test as the other endpoints.
- `client.ts` gains `readPrompt()`. `DaydreamStory` gains `promptFor(turnId)`,
  which builds the context as `#start` does (`#contextUpTo`) for the branch up
  to that turn.

**The UI, behind `page.data.debug`.**

- On `/daydreams/[id]`, a "Raw log" `wa-switch` in the page's header area.
  Its state is remembered per device in `localStorage` (wrapped in try/catch),
  as a per-viewer convenience.
- While it is on, `DaydreamThread.svelte` draws each turn raw:
  - each user turn as the words it is sent to the model as (`toContextTurn`);
  - each story turn as its `raw` in a monospace `<pre>`, with the parsed view
    one click away;
  - a "Show prompt" disclosure on each story turn, which fetches the rebuilt
    messages for the context it answered, shown role by role.
- A new `DaydreamRawTurn.svelte` keeps `DaydreamThread` readable.

## Docs

- Add `docs/debug-mode.md`. It covers:
  - the rule;
  - why the switch is per device;
  - the settings switch and the nav corner toggle;
  - the info panel;
  - the IQ aids;
  - the Daydreams raw log;
  - **how to add a debug aid**: read `page.data.debug`, or `readDebugMode` on a
    standalone page. It is display-only.
- `AGENTS.md`:
  - add the doc to the feature-docs table;
  - add a convention line: troubleshooting UI goes behind debug mode, not a
    feature of its own.
- `docs/features-and-admin.md`: replace the IQ section with "Debug mode", and
  fix "There are four so far".
- `docs/playroom.md` "Testing aid": the aids show in debug mode.
- `docs/daydreams.md`:
  - "What the server sees": for accounts with the grant, the raw reply is
    sealed in the browser like the rest. The prompt endpoint returns what the
    server already builds.
  - Add a "Raw log" section.
  - Mention turn v4.
- Copy this plan to `docs/historical-plans/2026-10-19-debug-mode.md`.

## Tests

- **Pure:**
  - `debug.test.ts`: every combination of feature and cookie.
  - `story` tests (or wherever `#start` is covered): `raw` is saved verbatim
    with `keepRawReplies`, and absent without it. A Stop saves the partial
    raw text; an over-long reply is cut, with `rawTruncated`.
  - A sealed-size test: a worst-case v4 turn fits `maxCiphertextLength`.
  - The v4 sealed fixture, through the existing fixtures test.
- **Server:**
  - The settings `debug` action: 403 without the feature, sets the cookie,
    deletes it on off.
  - The `(app)` layout's `debug`.
  - The IQ `page.server.test.ts`, rewritten to expect `debug`.
  - In the admin test fixture, the key becomes `debugMode`.
  - The prompt endpoint:
    - 403 without either feature;
    - another account's daydream refused;
    - returns `buildMessages`;
    - never calls `fetch`, never logs.
- **Component:**
  - `AppNav`:
    - no toggle without access;
    - `aria-pressed` follows the state;
    - links centred, with the gap.
  - `DebugInfo`: renders its lines, and Copy writes them.
  - The settings page: the switch shows only with the feature.
  - `DaydreamRawTurn`: the raw text, the truncated note, and "not recorded"
    for an old turn.
- **E2E:**
  - `e2e/iq-test.spec.ts`: a grant alone shows no aids; switching it on through
    the nav toggle shows them.
  - A new `e2e/debug-mode.spec.ts`:
    1. Grant, then sign in. The toggle is invisible until hovered.
    2. Click it. The toggle stays visible and the settings panel shows.
    3. Turn it off from `/settings`.
    4. Revoke the feature with the cookie still set; nothing shows.
  - `e2e/daydreams` spec, using whatever stub model the existing Daydream e2e
    uses:
    - With debug on, the raw log shows the stub's exact reply, including
      `<meta>`, and "Show prompt" lists a system message.
    - Without the grant, the saved turn has no `raw`. Check that by opening
      it in the page, since the server cannot read it.

## Verification

`npm run check`, `npm run lint`, `npm test` (vitest + Playwright), then:

- `npm run db:migrate:dev`, and confirm the old grants are renamed in
  `local.db`.
- Click through manually:
  1. Grant debug mode from `/admin`.
  2. Hover the nav corner and toggle it on.
  3. Check the panel on `/settings`.
  4. Check the IQ test's aids.
  5. Write a Daydream passage and check its raw log and its prompt.
  6. Toggle it off from the corner.
