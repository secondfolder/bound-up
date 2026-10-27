# Debug mode

Debug mode shows extra options and information in the UI, to help work out
what is going wrong. It is for whoever is fixing a problem, not for everyday
use. An account is given access, and the person holding it switches it on
and off themselves, one device at a time.

## The rule

**Debug mode is on when the account holds the `debugMode` feature _and_ this
device has switched it on.**

- **Access** is the `debugMode` feature, granted from an account's admin
  page like any other (see [features-and-admin.md](features-and-admin.md)).
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
Daydreams prompt endpoint is one case; the suggest endpoint's failure detail
(below) is the other, and checks the feature with `userHasFeature` rather
than refusing, since the request itself is for everyone.

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
  account holding the feature, laid out as a settings row with the switch on
  the right. Turning it on adds a "Debug tools" row to the list above it,
  which pulses amber once so it is noticed; it does not pulse on a visit that
  opens with debug mode already on.

Both are plain `use:enhance` forms posting to `/settings?/debug`, with
`submitDebugToggle` (`src/lib/debug-toggle.ts`). It does not use enhance's
default `update()`: the nav's form posts from whatever page is open, and
`update()` would hand the action's result to that page's own forms. On
success it re-runs the loads, so `page.data.debug` follows. A failure goes to
the app-wide notice.

The bottom nav's five tabs are centred, at least 1em apart, in the middle
column of a three-column grid. The toggle has the right-hand column to itself,
so it never covers a tab on a narrow phone.

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

### A new daydream's summary markers

The summary a new daydream is shown as is written with its blanks marked as
`[[key|words]]` ([daydreams.md](daydreams.md#starting-one)). In debug mode
`DaydreamSetupForm` shows those markers rather than stripping them: each
blank from the written summary sits inside its marker, with the key as it was
written (`[[mara|`[your boss]`]]`), and still works; a marker that was read as
plain words — for nobody in the story, or a second for the same thing — is
shown in full. The second paragraph, which the form writes itself, has no
markers to show, so its blanks are plain. The page passes `data.debug` in.

### Why a Daydreams suggestion failed

"No ideas came back that time" and "No suggestions just now" say nothing
about why. `SuggestionProblem.svelte`, which shows every suggestion failure
on the new-daydream page and in the character and idea dialogs (the chips
included), adds a "What came back" disclosure in debug mode. What it shows
comes from one of two places:

- **An answer with nothing usable in it** is described in the browser by
  `describeUnusable` (`daydream/suggestions.ts`): no completion at all, a
  reply that was not JSON, or JSON with nothing asked for in it, followed by
  the reply as the model wrote it. A Responses answer (one that read a
  brief's links) with no reply is outlined instead of dumped: its `status`,
  `incomplete_details`, `error` and `usage`, each output item's type and
  size, and the last item whole. Dumped, the first fetched page filled the
  cut and hid the end, which is where the reason is; the pages themselves
  are under the links read. Nothing new crosses the network for this:
  the endpoint already passes the provider's answer back, put together from
  its stream, for the browser to check.
- **A provider failure** (an error status, no connection, or a stream that
  failed or broke off partway) is described by the suggest endpoint, as
  `detail` beside its `message` — in the 502, or in the stream's `failed`
  event once it has started: the status and the provider's error body, or
  why it could not be reached or finished. That is sent only
  to an account holding the `debugMode` feature, checked on the server for
  each failure; anyone else's 502 is the message alone, as before. Still
  never logged, since the body can quote the request back.

`debug` is handed down to the component as a prop, from `data.debug`,
rather than read from `page.data` inside it, so the dialogs' tests need no
`$app/state` mock.

### How a daydream draft or ideas were written

A draft written from a brief or a generated idea, and the generated ideas
themselves, show in debug mode a "Chat log" disclosure on the new-daydream
page (`ExchangeLog.svelte`): above the draft, under the ideas, or beside the
failure when nothing usable came back (`SuggestionProblem`). It is the whole
exchange, one closed disclosure per bubble: the system prompt, the message
the request sent (the brief, the side, the voice and the instructions), the
request's settings, then everything the model answered with — its
reasoning where the provider shows it, each page it fetched in full (its
URL, the engine's status, the site's HTTP status and the page's title in the
heading, or the engine's error), its reply as written — and how it ended
(`finish_reason` or `status`, and `usage`). Its heading names the model and
which of OpenRouter's APIs it went to, and what the request cost.

**Lengths and cost.** Every bubble's title says how long it is, in
characters and tokens (`entryCount`), so the part of a request that costs
the most can be found without opening each one. The tokens are exact for the
reasoning and the reply, which the answer's `usage` counts (the reply as the
output less the reasoning), and estimated at four characters a token for
everything else, marked "~": the usage counts the prompt only as a whole.
The settings and how it ended get no count, being this page's reading of
the exchange rather than text the model read or wrote. The cost is
OpenRouter's `usage.cost`, in US dollars, which it now returns on every
answer without being asked (`readUsage`); "How it ended" says it beside the
tokens in and out, how many of those were read from the cache, and how many
of the out were reasoning. The same goes for a daydream's raw log (below),
whose exchange line says the cost as well. A picture's cost is not shown.

The request is not in the provider's answer, so the page asks for it: with
debug mode on, `suggestDaydream` and `suggestIdeas` send `debugLog: true`,
and the suggest endpoint, for an account holding the feature, adds the
request body it sent — the very string, stringified once and used for both
— to the answer as `boundUpRequest` (`withRequest`). Added to the answer
rather than wrapped round it, so every other reader of it is unchanged. The
flag from an account without the feature is ignored, and only the `daydream`
and `ideas` tasks take it. It is the server's prompt and the user's own
brief going back to them, without the key, which is a header; nothing is
kept or logged. `suggestionLog` (`daydream/exchange-log.ts`) reads it into
bubbles, Chat Completions and Responses answers alike, showing an output
item of a shape it does not know whole. The same reader draws a daydream's
exchanges in its raw log (below).

The links a brief pointed at are read ([daydreams.md](daydreams.md#links-in-a-brief))
by OpenRouter's Responses API rather than Chat Completions because only its
answer lists each fetch, as an `openrouter:web_fetch` item, which is where
the log's fetched pages come from.

Nothing about a suggestion is stored while the daydream is being set up,
since there is no daydream yet to keep it in. When one is made from a draft
that has a log, the log goes with the create and is kept with it, to read
again from its raw log (below, "Setup exchanges").

Not a log for suggestions generally: chips, fills, castings and names do not
ask, so they show only what failed (above).

### The live chat

While a slow model call is out, everyone sees how it is going
([daydreams.md](daydreams.md#progress-while-it-writes)). With debug mode on,
`ModelProgress` also shows a "Live chat": the chat log above, filled in as it
happens — what was sent, then the reasoning, each link read and the answer,
a piece at a time, each bubble following its own end unless it has been
scrolled up to read. It is gone once the answer lands, which is what the
chat log (above) is for.

- **Suggestions.** With the device's switch on, the page passes `onLive`
  (`ModelWatch`, `daydream/model-watch.svelte.ts`), which sends `live:
  'full'`; the suggest endpoint, for an account holding the feature, then
  sends the request body first (`request`) and every piece as it reads it
  from the provider (`delta`). For anyone else the flag is ignored and only
  `progress` is sent, so the words do not reach a page that is not meant to
  show them. Any suggestion may ask; the new-daydream page and "Update the
  idea" do.
- **Passages** show the model's reasoning before the passage begins, as
  plain text in the arriving bubble under the progress line
  (`DaydreamArriving`) rather than as a live chat: it is the one thing worth
  reading while it waits, and the request is the raw log's to show. Nothing
  more is sent for it: a passage's stream has
  always reached the browser whole, reasoning included. The story keeps it
  only for an account holding the feature (`keepRawReplies`), and the thread
  shows it only with the switch on.

### Daydreams' raw log

This is a "Raw log" switch in a daydream's tool row, remembered on the device
in `localStorage`. While it is on, the branch being read is drawn as what
happened between the daydream and the model, not as the story.

#### One passage's raw log

In debug mode, each passage's menu also has "Raw log", which opens that
passage alone in a drawer (`DaydreamRawPassage`), drawn exactly as the
switch would draw it (`DaydreamRawNode`, which both use): its exchange —
what was sent, the reasoning, the reply as it arrived, its metadata — the
turn as stored, and any request after it that failed. It reads that
passage's exchange and the one before it, for the history comparison, and
nothing else, so a long story does not have to be loaded whole to look at
one reply. The switch does not have to be on, and is left as it was.

#### Exchanges

Every request a daydream makes to the model — an opening, a reply, a
rewrite, a check-in — is kept as an **exchange**, for an account granted
debug mode: the request body exactly as the server sent it, and the
response's server-sent events exactly as they arrived, every byte, comments
and all (`daydream-exchange`, `daydream/exchange.ts`). Nothing is parsed out
of either when it is kept. What the log shows is read from them when it is
drawn (`exchange-log.ts`), so a better reader shows more of every exchange
already kept, and anything the reader does not recognise is shown whole
rather than dropped.

The log draws each passage's exchange above it (`DaydreamRawExchange`):

- what the request added to the one before, open — the passage as it was
  sent back, the user's words, a button's note, the buttons on screen — and
  the history before it closed, as one bubble;
- whether the history was the request before plus its reply, compared
  message by message. Every request is meant to be (docs/daydreams.md,
  "Cost"); one that was not says so (`data-not-appended`);
- the request's settings (model, token limit, temperature, provider);
- the model's reasoning, where the provider streamed it (a note for pieces
  it encrypted), its reply, any tool calls, and any event not read here,
  whole;
- an error the stream ended on, and "How it ended": why it stopped, which
  model and provider answered (a fallback can differ from the model asked
  for), what it cost and the tokens in and out (above, "Lengths and cost"),
  OpenRouter's generation id, the usage, how many events and keep-alive
  comments came, and whether it said it was done;
- under it all, **the request and the response exactly as they went**.

A request that wrote no passage — it failed, came back empty, or was
stopped before anything arrived — is kept too, under the turn it answered,
so it can be looked at after a reload. Its exchange is all there is of it.

How one is kept:

- The reply request asks to `record`. The reply endpoint, for an account
  holding the feature (`userHasFeature`, so the server holds it to the
  grant), sends one event of its own ahead of the model's stream,
  `{"boundUpRequest": "…"}`: the request body it sent, as the string it
  sent. The usage is in the stream only because a recording request asks
  for it (`usage: { include: true }`).
- `writeReply` `tee()`s the response before anything reads it. One branch
  is the page's; the other goes to an `ExchangeRecorder`
  (`exchange-recorder.ts`), which copies it untouched and cuts off the
  endpoint's own event at its exact end (`stripOwnEvent`: the event is one
  line, since the body it carries has every newline escaped). A Stop or a
  dropped connection keeps what had arrived.
- After the passage is saved — or on its own, for a request that wrote none
  — the story seals the exchange and posts it to
  `POST /api/daydreams/[id]/exchanges` (`saveExchange`), in the background:
  the passage is saved whether or not it is. One that will not save is still
  shown this visit, saying it was not kept.
- The raw log reads them a few turns at a time
  (`POST /api/daydreams/[id]/exchanges/read`, `MAX_READ_EXCHANGE_TURNS`,
  `RawExchanges`), only while it is open: an exchange can be most of a
  megabyte, so the story itself never loads one.

How they are stored:

- In a table of their own, `daydream_exchanges`, keyed by the passage it
  wrote (`turn_id`, null for one that wrote none) and the turn it answered
  (`parent_turn_id`), both cascading, as does the daydream. Kept apart from
  the turn so the turn is the story alone, and the 96 KB a turn may be is
  not shared with debug data.
- Sealed and **compressed** (`compressed` on `defineSealedKind`, prefix
  `sz1.`): the request repeats the story's history and the response is
  hundreds of near-identical events, so it deflates many times over — a
  long story's request and a reasoning reply's stream, about 800 KB, seal to
  about 60 KB. Compressing before encrypting lets the ciphertext's length
  say something about the content, which is safe here only because the
  server handled every byte of it in plaintext on its way to and from the
  model. Only this kind and setup exchanges, for the same reason, opt in
  ([encryption.md](encryption.md)).
- Capped at 1 MiB sealed (`MAX_EXCHANGE_CIPHERTEXT`), and at
  `EXCHANGE_LIMITS` before it is compressed. One past it keeps the request
  whole and as much of the start of the response as fits, cutting it in
  half until it does, and says so (`truncated`).
- Only for an account granted debug mode, whether or not it is switched on,
  so a passage written while it was off can still be inspected once it is
  on. The exchanges endpoints check the feature, and the reply endpoint only
  sends the request to an account holding it.

#### Setup exchanges

A daydream made from a draft the model wrote keeps the suggestion requests
that wrote it, as **setup exchanges**, for an account granted debug mode:
the draft's own, and, when the draft was written from a generated idea, the
round of ideas that offered that idea. That round is where a brief's links
were read, so it is often where a thin draft came from. They head the raw
log as "How this daydream was set up" (`DaydreamRawSetup`), ideas round
first, each drawn by the same reader as the new-daydream page's chat log
(`setupExchangeLog`, which hands the kept answer to `suggestionLog`), with
the request and answer as they were kept under it. A daydream with none —
ready-made, built by hand, made without debug mode, or from before they
were kept — shows nothing there.

How one is kept:

- `suggestDaydream` and `suggestIdeas` answer, beside the `log`, an
  `exchange` (`SetupExchange`, `daydream/setup-exchange.ts`): which task it
  was, the `boundUpRequest` string exactly as the server sent it, the
  answer without it, and when it was asked and answered. The answer is
  JSON the page has already parsed, so it is stringified again: the same
  answer, not its bytes. "Try another" replaces the draft's; the ideas
  round stays. The new-daydream page remembers which round offered each
  idea by title, since "More ideas" adds rounds and the log shown is only
  the latest.
- The page hands them to `DaydreamSetupForm` (`setupExchanges`), only in
  debug mode. For a new daydream its submit seals each
  (`sealSetupExchanges`, halving an answer that will not fit its cap as an
  exchange's response is, and saying so) under a record id kept across
  attempts, and puts them in the post as `setupExchanges`. One that will not
  seal is left out.
- The create action keeps them after it has made the daydream, only for an
  account holding the feature (`userHasFeature`), and ignores them for any
  other. They are debug data, so nothing about them can stop the daydream
  being made: the schema drops a malformed list (`.catch`), one in the
  wrong vault or envelope is skipped (`saveSetupExchanges`), and a failure
  to store them is logged — the error alone — and the user is sent on.
- The raw log reads them once, the first time it opens
  (`GET /api/daydreams/[id]/setup-exchanges`, behind the feature,
  `RawSetupExchanges`).

How they are stored: in `daydream_setup_exchanges`, keyed by the daydream
and cascading with it, sealed as `daydream-setup-exchange`, compressed,
with the same caps as an exchange. A table of their own rather than rows in
`daydream_exchanges` with no turn, which there means a failed opening; a
kind of its own rather than a version of `daydream-exchange`, whose every
reader takes its response to be a stream of server-sent events. Kept a
millisecond apart, so they read back in the order they were sent.

#### Older passages

A passage written before exchanges were kept falls back to what it carried
itself, which the log still reads:

- **What its request sent** (`sent`, `daydream-turn` v5,
  `daydream/sent-record.ts`): the system prompt once, at the top
  (`DaydreamRawSystem`), and before the passage a bubble with what the
  request added (`DaydreamRawSent`). The history was recorded only as a
  hash chain, which the log checks against the previous passage's record
  (`appendedToPrevious`).
- **Its reply as the model wrote it** (`raw`, `daydream-turn` v4), tags,
  `<meta>` block and all, capped at `DAYDREAM_LIMITS.rawReply`.
- **One with neither** is rebuilt like Show prompt (below), one passage at a
  time (`RawConversation`), and says it was; its reply says "Raw reply not
  recorded".

New passages write neither `raw` nor `sent`: the exchange has both, whole.

#### Beside each turn

- **A passage's picture with what made it** ([daydreams.md](daydreams.md#pictures)):
  the picture, the story model's description, and exactly what the image
  model was asked — its model, prompt and negative prompt — which the
  picture endpoint says in a header (`PictureRequest`) and the picture's
  mark keeps (`sent`, `daydream-mark` v3), for an account granted debug
  mode only. Outside the raw log too, with debug mode on, tapping a picture
  opens the same in a dialog (`DaydreamPicturePrompt.svelte`): one field,
  toggled between the image model's prompt, shown first, and the story
  model's description, closed by a tap outside it. In the image model's
  prompt, whatever is not in the description — the server's words round it,
  and anything reworded on the way, such as "girl" to "woman" — is muted
  (`addedRuns` in `src/lib/word-diff.ts`), and so is the negative prompt,
  all of it the server's.
- **What is stored**, as JSON, under a disclosure (`DaydreamRawTurn`).
- **Show prompt**: the system prompt and messages that would write this
  passage, from `POST /api/daydreams/[id]/prompt`. That endpoint takes what
  `/reply` takes and answers with `buildMessages`, and never reaches the
  model. It is a **rebuild from the story as it stands now**, today's setup
  included, which is what an older passage's bubbles are checked against
  when no record was kept.
- **A failed reply** as it arrived, under the error.

#### Export

Beside the switch, **Export** saves the whole daydream to the device as JSON
(`DaydreamStory.exportHistory`, format version 3): the setup, every turn on
every branch in the order written, with what is stored for each (`raw` and
`sent` included where an older passage kept them), the marks, every
exchange, request and response verbatim, the setup exchanges, the branch
being read and the direction buttons on offer. It is for handing a misbehaving story to
someone debugging it. Each record is opened afresh, not read from the
page's cache, which only holds turns something has rendered. The file is
the story in the clear, so it is behind debug mode and goes nowhere but the
download.

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

## Debug tools

Settings, in debug mode, links to `/debug`: whole pages of tooling rather
than an aid on a page that already exists. There is one so far, the
[prompt review](prompt-review.md#the-debug-page) at `/debug/prompts`. Every
load and endpoint behind them calls `requireFeature(…, 'debugMode')`. The link
is display-only, like everything else here: an account without the feature
gets a 403 however it arrives. A new tool goes in `/debug`'s list.

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
  - `sealed-kinds/daydreams.test.ts`: a worst-case turn fits its cap, and a
    long story's exchange, compressed, fits well inside its own;
  - `daydream/exchange-log.test.ts`: reading a request, a stream and a whole
    answer, and comparing a request's history with the one before;
  - `daydream/exchange-recorder.test.ts`: every byte kept, through a drop,
    the endpoint's own event cut off exactly;
  - `daydream/setup-exchange.test.ts`: a suggestion's answer kept and read
    back as the page read it, cut short past its cap;
  - `crypto/sealed.test.ts`: the compressed envelope;
  - the v4 turn, v1 exchange and v1 setup exchange sealed fixtures;
  - the migration in `server/db/migrations.test.ts`.
- **Server:**
  - `settings/page.server.test.ts`: the action, which refuses without the
    feature, and sets and clears the cookie;
  - `(app)/layout.server.test.ts`: `debug`;
  - the IQ test's load;
  - `api/daydreams/[id]/prompt/server.test.ts`: both features, ownership, no
    model call, no console;
  - `api/daydreams/[id]/exchanges/server.test.ts`: the feature, ownership,
    the turns, the envelope, the cascade;
  - `daydreams/new/page.server.test.ts`: setup exchanges kept with the
    create, in order, only for the feature, a bad one skipped and a
    malformed list never stopping the daydream;
  - `api/daydreams/[id]/setup-exchanges/server.test.ts`: the feature,
    ownership, the envelope, the cascade;
  - `api/daydreams/[id]/reply/server.test.ts` and
    `api/daydreams/suggest/server.test.ts`: the exact request body, only when
    asked and only for the feature, never the key.
- **Component:**
  - `AppNav.svelte.test.ts`: centred tabs, the toggle hidden while off and
    shown while on;
  - `DebugInfo.svelte.test.ts`;
  - `ExchangeLog.svelte.test.ts`;
  - the settings page;
  - `DaydreamThread.svelte.test.ts`, "in debug mode": an exchange kept with
    the grant and not without, through a Stop and for a failure; a passage's
    exchange drawn in the log; an older passage's `sent` and rebuilt prompt;
    a failed reply; the setup exchanges heading the log, and nothing for a
    daydream without them or while the log is off.
- **End to end:**
  - `e2e/debug-mode.spec.ts`: the toggle, the panel, the switch, a revoke;
  - the debug tests in `e2e/daydreams.spec.ts`, which read a kept exchange
    after a reload, its reasoning and usage from the model stub, and a
    daydream made from a generated idea's draft, its ideas round and draft
    in its raw log;
  - the testing-aid tests in `e2e/iq-test.spec.ts`.
