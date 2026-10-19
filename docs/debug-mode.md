# Debug mode

Debug mode shows extra options and information in the UI, to help work out
what is going wrong. It is for whoever is fixing a problem, not for everyday
use. An account is given access, and the person holding it switches it on
and off themselves, one device at a time.

## The rule

**Debug mode is on when the account holds the `debugMode` feature _and_ this
device has switched it on.**

- **Access** is the `debugMode` feature, granted from `/admin` like any other
  (see [features-and-admin.md](features-and-admin.md)).
- **On or off** is a cookie, `debug=1`, set and cleared only by the `debug`
  action on `/settings` (`src/routes/(auth-required)/(app)/settings/+page.server.ts`).
  The action checks the feature before it sets anything.
- **Both are checked on every request.** A cookie left behind after a revoke
  does nothing, because the feature is read from the database each time.

The pure half is `src/lib/debug.ts` (`DEBUG_COOKIE`, `debugModeOn`), which is
alias-free. The server half is `src/lib/server/debug.ts`: `readDebugMode` for
a page with no feature list to hand, and `setDebugCookie`.

### Why per device

The problem being debugged is usually on one device: the phone that will not
show notifications, or the browser whose layout breaks. Switching it on there
leaves every other device as it was. A cookie rather than `localStorage`
means the server knows the answer when it renders. A debug-only control is
in the first HTML, not flashed in after hydration.

### Display only

`debug` decides what is **shown**, never what is **allowed**, like the
`features` list it is computed from. Anything debug mode reveals that the
server has to serve checks `requireFeature(…, 'debugMode')` itself. The
Daydreams prompt endpoint is the one case so far.

## Switching it

- **The bottom nav's corner.** `AppNav.svelte` has a bug-icon toggle in the
  right-hand column of its grid, for an account holding the feature.
  - While off, it is invisible until hovered or focused, so it is not clutter
    for someone who holds the feature and is not debugging.
  - While on, it is always visible, in the brand colour. That is the reminder
    that debug mode is on.
  - It is a native `<button aria-pressed>`, because `wa-button` forwards no
    ARIA state.
- **Settings.** `/settings` has a "Debug mode on this device" switch for an
  account holding the feature.

Both are plain `use:enhance` forms posting to `/settings?/debug`, with
`submitDebugToggle` (`src/lib/debug-toggle.ts`). It does not use enhance's
default `update()`: the nav's form posts from whatever page is open, and
`update()` would hand the action's result to that page's own forms. On
success it re-runs the loads, so `page.data.debug` follows. A failure goes to
the app-wide notice.

The bottom nav's tabs are centred, at least 1em apart, in the middle column of
a three-column grid. The toggle has the right-hand column to itself, so it
never covers a tab however many partners there are.

## Where it reaches the page

- **The app shell.** `(app)/+layout.server.ts` returns `debug` beside
  `features`. Every signed-in screen reads `page.data.debug`.
- **The standalone IQ test** has no shell. Its load calls `readDebugMode`
  itself and returns `debug`.

## What it shows

### The info panel

`DebugInfo.svelte`, on `/settings` while debug mode is on, lists:

- the version, user id and features held;
- the account's timezone, against the device's;
- the keyring's status;
- push support, and this browser's push device id;
- whether a service worker controls the page;
- the display mode (Home Screen app or browser), and the viewport size;
- the user agent.

"Copy" puts the list on the clipboard as plain text, for a bug report.
Nothing on it is secret: no key, no credential, nothing sealed.

### The IQ test's testing aids

These are "Correct answer", "Incorrect answer", "Skip question" and "Clear
timer" (see [playroom.md](playroom.md#testing-aid)). They were a feature of
their own, `iqTestAnswerButton`, until debug mode existed. Migration
`0035_fold_iq_answer_button_into_debug_mode` turned every grant of it into a
`debugMode` grant.

### Daydreams' raw log

This is a "Raw log" switch in a daydream's tool row, remembered on the device
in `localStorage`. While it is on, each turn on the branch being read is drawn
by `DaydreamRawTurn.svelte`, not as the story:

- **A passage's reply exactly as the model wrote it**: tags, `<meta>` block,
  code fences and all (`raw`, `daydream-turn` v4).
- **What is stored**, as JSON, under a disclosure.
- **Show prompt**: the system prompt and messages that would write this
  passage, from `POST /api/daydreams/[id]/prompt`. That endpoint takes what
  `/reply` takes and answers with `buildMessages`, and never reaches the model.
  It is a **rebuild from the story as it stands now**, today's setup
  included, not a record of what was sent: nothing records that.
- **A failed reply** as it arrived, under the error. It is never saved, since
  a failed reply is not a turn.

Beside the switch, **Export** saves the whole daydream to the device as JSON
(`DaydreamStory.exportHistory`): the setup, every turn on every branch in the
order written, with what is stored for each (`raw` included where it was
kept), the marks, the branch being read and the direction buttons on offer.
It is for handing a misbehaving story to someone debugging it. Each record is
opened afresh, not read from the page's cache, which only holds turns
something has rendered. The file is the story in the clear, so it is behind
debug mode and goes nowhere but the download.

**Raw replies are kept only for an account granted debug mode**, whether or
not it is switched on, so a passage written while it was off can still be
inspected once it is on.

- `DaydreamStory` takes `keepRawReplies`, which the page sets from the
  feature. The browser seals the turn, so the server cannot see `raw` and
  cannot enforce this: the flag is the whole of the rule.
- A turn written without the grant, or before v4, says "Raw reply not
  recorded".
- `raw` is capped at `DAYDREAM_LIMITS.rawReply` (16,000 characters). A
  longer reply keeps its start, with `rawTruncated`. Replies are asked for at
  1200 tokens, so this is a ceiling for a runaway reply, not one a normal one
  approaches.
- `raw` repeats the passage and any written-out turn. Storing the parsed
  fields as references into it was considered and rejected: the parsed fields
  are authoritative and frozen per version, while the raw text is only ever
  displayed. For v4, the turn kind's ciphertext cap went from 48 KB to 96 KB,
  which is the most the daydream endpoints take.
- v4's reader and writer shipped together, as v3's did. A turn is read only by
  its owner, so the only reader that can meet one early is the owner's own
  tab still open on the previous build.

### Why a kink list won't open

On the screen a signed-in kink list shows when this device cannot open it
(`UnreadableList.svelte`), "Why it won't open" gives the reason
`openRecordDiagnosed` worked out: the wrong format, a failed decryption, bad
JSON, an unknown version, or a schema that refused it, with where it did: the
path, Zod's issue code, what the schema expected, and the type of what it
found. Never a value, since those are the sealed content;
the same goes to the console whether debug mode is on or not. See
[kink-list.md](kink-list.md#saving).

### The kink list's level of detail

An "Only this level" switch under the level of detail slider shows only the
kinks at exactly that level, for checking how the catalogue's kinks are
spread across levels. Never saved. See
[kink-list.md](kink-list.md#the-level-of-detail).

## Adding a debug aid

- **Read `page.data.debug`** in the app shell, or `readDebugMode` on a page
  outside it. Never the cookie directly.
- **Keep it display-only.** If the aid needs the server to serve something it
  would not otherwise, that route checks `requireFeature(…, 'debugMode')`.
- **No secrets.** Debug mode is for showing state, never keys or anything
  sealed.
- **Not a feature of its own.** A troubleshooting control goes behind debug
  mode, not behind a new grant.
- Document it in this file.

## Tests

- **Pure:**
  - `src/lib/debug.test.ts`: the rule;
  - `sealed-kinds/daydreams.test.ts`: a worst-case v4 turn fits its cap;
  - the v4 sealed fixture;
  - the migration in `server/db/migrations.test.ts`.
- **Server:**
  - `settings/page.server.test.ts`: the action, which refuses without the
    feature, and sets and clears the cookie;
  - `(app)/layout.server.test.ts`: `debug`;
  - the IQ test's load;
  - `api/daydreams/[id]/prompt/server.test.ts`: both features, ownership, no
    model call, no console.
- **Component:**
  - `AppNav.svelte.test.ts`: centred tabs, the toggle hidden while off and
    shown while on;
  - `DebugInfo.svelte.test.ts`;
  - the settings page;
  - `DaydreamThread.svelte.test.ts`, "in debug mode": raw kept with the grant
    and not without, kept through a Stop, cut when long; the log; the prompt;
    a failed reply.
- **End to end:**
  - `e2e/debug-mode.spec.ts`: the toggle, the panel, the switch, a revoke;
  - the debug test in `e2e/daydreams.spec.ts`;
  - the testing-aid tests in `e2e/iq-test.spec.ts`.
