# Live progress for slow daydream model calls

## Context

"Write my daydream", "Thinking up daydreams…", "More ideas" and "Update the idea"
all go through `POST /api/daydreams/suggest`. That endpoint waits for the
whole answer before it replies. With link reading on, the wait can be tens of
seconds, and the page shows nothing but a button label in that time. Story
passages already stream their text, but they show only a spinner until the
first word arrives.

Goal: every slow call says what it is doing as it happens.

- **Everyone** sees high-level progress:
  - the stage: waiting for the model, thinking, reading a link, writing;
  - characters received so far.
- **Accounts with debug mode on** see the whole chat live:
  - the request that was sent;
  - reasoning and answer text as they stream;
  - each link fetch.

Agreed scope:
- **Progress UI** goes only on the long suggestion buttons. The quick ones
  (chips, fill, casting, name, surprise) keep their current label. They still
  go through the new streamed path, so there is one code path.
- **Passages** get a status line only before their first text. Once text
  arrives, nothing changes.

## Design

### 1. The suggest endpoint streams its own SSE (`src/routes/api/daydreams/suggest/+server.ts`)

**Upstream request.** Send `stream: true` to the model provider, on both
`chat/completions` and `responses`.

**What the server does with the stream.** It parses the upstream stream
itself, with a new pure module `src/lib/server/daydream/suggest-stream.ts`.
It does not pass the stream through unread.

**What it sends to the browser.** Its own SSE events, reusing `SSE_HEADERS` /
`encodeSseEvent` / `SSE_KEEPALIVE` from `src/lib/server/realtime/index.ts`.
The closest existing template is the `ReadableStream` in
`api/daydreams/[id]/reply/+server.ts:133-152`.

| Event | Who gets it | Data |
| --- | --- | --- |
| `progress` | everyone | `{ stage: 'waiting' \| 'thinking' \| 'reading' \| 'writing', chars, reasoningChars, pagesRead }`. Throttled to at most ~4/s, and always sent when the stage changes |
| `delta` | debug only | `{ kind: 'text' \| 'reasoning', text }`, plus `{ kind: 'fetch', url, status }` for each fetch the Responses API reports |
| `request` | debug only, sent first | the request body string (what `withRequest` adds today) |
| `done` | everyone | the answer, rebuilt in the **same non-streamed shape the browser reads today** |
| `failed` | everyone | `{ message, detail? }`, as `unavailable()` builds it. `detail` only for the debug feature. Covers a mid-stream error, or a stream that ends without finishing |

**The rebuilt answer.** For Chat Completions, `done` carries
`{ choices: [{ message: { content, reasoning }, finish_reason }], usage, model }`.
For the Responses API, it carries the `response` object from
`response.completed`. In debug it also carries `boundUpRequest`.

Because the answer keeps its old shape, `completionJson`, `describeUnusable`,
`suggestionLog` and `setupExchangeFrom` (sealed setup exchanges) do not
change. Old stored exchanges stay readable.

**Debug gating.** A new request flag `live: 'full'` replaces and generalises
`debugLog`. `debugLog` stays accepted for the two tasks that use it today.
The server sends `delta` and `request` only when
`userHasFeature(…, 'debugMode')`. The feature decides, as `unavailable()`
already does; the browser's switch only decides what is shown.

**Unchanged.**
- Failures before streaming starts (rate limit, 4xx, provider non-2xx,
  unreachable) keep their JSON responses and statuses.
- Nothing is logged but status codes.
- `request.signal` still aborts the upstream call.

**Doc comment.** Update the endpoint's comment: "Not streamed" is no longer
true. Say why the server parses the stream: to keep the answer's shape, and
so that only a debug account receives content before the answer is whole.

**Responses API stream events need checking against the real API.**
- `response.output_text.delta` is text.
- `response.reasoning*.delta` is reasoning.
- `response.output_item.added` / `.done` with a non-`message` type (the
  web_fetch call) sets the stage to `reading`, takes the URL if it is present,
  and adds to `pagesRead`.
- `response.completed` is the final body.

The parser treats any item type it does not recognise as `reading`, so a
renamed event degrades gracefully. During implementation, run one real
`ideas` request with a link under debug and confirm the event names.

### 2. Browser client (`src/lib/daydream/client.ts`, `suggest.ts`, new `src/lib/daydream/progress.ts`)

**`progress.ts`.** A pure `SuggestProgress` type, plus `stageLabel(progress)`:
- "Waiting for the model…"
- "Thinking…"
- "Reading a link (2 so far)…"
- "Writing… 1,240 characters"

It is pure, so it is unit-testable in the node project.

**`requestSuggestion(body, { onProgress?, onLive? })`.**
- Still uses `tryFetch` for the response.
- A non-2xx JSON response keeps the current `readFailure` path.
- Otherwise it reads the SSE body with a small reader that shares line
  parsing with `readReplyStream` in `stream.ts`. Factor out
  `readSseEvents(body, onEvent)`; it understands the `event:` field.
- It resolves with the `done` data, or with the `failed` data as an error.
- An abort still rethrows.

**`ask()` in `suggest.ts`** takes and forwards an optional
`{ onProgress, live }`.

**Exported calls.** `suggestDaydream`, `suggestIdeas` and `suggestCatchUp`
accept these and pass them through. The other suggest functions accept them
but no caller passes them.

**`LiveChat` state.** `src/lib/daydream/live-chat.svelte.ts` is a `$state`
class that collects `request` / `delta` events into `LogEntry[]`, the shape
`ExchangeLog.svelte` already renders. Reuse `parseRequest` / `sentEntry` from
`exchange-log.ts` for the request half.

### 3. UI

**New component `src/lib/components/ModelProgress.svelte`.**
- Props: `progress`, `live?: LiveChat`.
- It renders the stage line: a spinner plus the `stageLabel` text in an
  `aria-live="polite"` region. Updates are throttled, so screen readers are
  not flooded.
- When `live` is given, it adds an open `wa-details` "Live chat" holding
  `ExchangeLog` entries, auto-scrolled as text arrives.
- Styled with `--wa-*` tokens only.

**Where it is used:**
- **`daydreams/new/+page.svelte` / `DaydreamStarter.svelte`.** `writeDraft`,
  `generateIdeas` and `moreIdeas` hold a `progress` state and, when
  `data.debug`, a `LiveChat`. Show `ModelProgress` under the busy button. The
  existing post-hoc "Chat log" stays, since it is the saved exchange.
- **"Update the idea".** The component that calls `suggestCatchUp`
  (`DaydreamDriftNote.svelte`; confirm when implementing) gets the same,
  replacing its "Looking at the story…" text.

**Passages.**
- `readReplyStream` (`stream.ts`) gets an optional `onActivity` that reports
  reasoning characters and whether any content has arrived. The reply
  endpoint already passes reasoning through, so no server change is needed.
- `story.svelte.ts` `#generate()` keeps a `streaming.progress`.
- `DaydreamArriving.svelte` shows the `ModelProgress` stage line beside its
  spinner until the first text arrives. When `debug` is on, it also shows the
  reasoning text live in a quiet block, which the raw log already allows. The
  reply endpoint already sends reasoning to everyone, so this only changes
  what is shown, not what is sent.

### 4. Test stub (`e2e/model-stub.mjs`)

- A streamed `chat/completions` for suggestions. Today it answers anything
  without `stream` as a suggestion; with `stream: true` and a suggest-shaped
  request, it emits reasoning, then content in a few chunks, then usage, then
  `[DONE]`.
- A streamed `POST /v1/responses`, with a fetch item, text deltas and
  `response.completed`.
- Add short delays between chunks so a test can see progress.

## Tests

**Node (pure).** New `suggest-stream.test.ts`:
- Chat Completions chunks rebuild into the same body a non-streamed answer
  has. Compare against the fixture the stub used before.
- Responses events give the `completed` body, and the fetch items give
  `reading` and `pagesRead`.
- The stage moves from waiting to thinking to writing.
- Throttling.
- An upstream `error` chunk, or a missing `[DONE]`, gives `failed`.

`progress.test.ts` covers the labels.

**Server.** Extend the suggest endpoint test, or add `server.test.ts` beside
it, with `fakeEvent` and a stubbed `fetch`:
- A non-debug account gets no `delta` / `request` events, even with
  `live: 'full'`.
- A debug account gets them.
- `done` parses exactly as before for every task.
- Non-2xx and rate-limit responses are unchanged.

**Browser component.**
- `ModelProgress.svelte.test.ts`: label rendering and the live log.
- `DaydreamArriving`: a status line before text, gone after.
- `client.ts`: the SSE reader handles a split chunk boundary.

**e2e.**
- Extend the new-daydream spec. While "Write my daydream" runs, the progress
  line shows "Writing… N characters" before the draft appears.
- With debug on, the live chat shows the stub's reasoning text.
- A non-debug account never sees it.

## Docs

- `docs/daydreams.md`: the suggest endpoint now streams. Add the progress
  stages, and update "What the server sees" if the wording says "passed
  through unread".
- `docs/debug-mode.md`: the live chat for suggestions, and reasoning on
  passages.
- `docs/request-failures.md`, if it says anything about suggestions being
  awaited.
- Copy this plan to
  `docs/historical-plans/2026-10-21-daydream-model-progress.md`.
- `prompts:export` is not needed. The prompts do not change, only the
  transport flag, and `stream` is not in the catalogue. Confirm the catalogue
  test still passes.
- Roadmap: check `src/lib/roadmap/roadmap.json` for a matching entry.

## Verification

1. `npm run check`, `npm run lint`, `npm test`, `npm run test:e2e`.
2. `npm run dev` with a real OpenRouter key:
   - As a non-debug account, "Write my daydream" with a reddit link: stages
     go waiting → reading (n) → writing with a rising count, and no content
     is shown.
   - With debug on, the live chat streams the request, reasoning, fetches and
     text.
   - Stop and abort mid-stream.
3. `npm run preview` once, to confirm the streamed response works on the
   Workers runtime.
4. `npm run test:e2e:image`, for the Node build.
