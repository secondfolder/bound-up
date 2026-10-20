# Daydream exchanges: keep each model request and response verbatim

## Context

Debug mode's raw log is meant to show exactly what happened between a daydream
and the model. Today it reconstructs that from pieces sealed into each passage's
turn record, and every piece is a digest rather than a copy:

- `raw` (turn v4) is the reply's text deltas concatenated; the SSE events,
  and every other field on them, are gone.
- `sent` (turn v5, `daydream/sent-record.ts`) is the system prompt, the
  messages added since the last passage, and the earlier history only as a
  SHA-256 chain, which the log then has to verify (`appendedToPrevious`). The
  request's own parameters (model, `max_tokens`, `temperature`, `provider`,
  `usage`) are not kept at all.
- `received` (turn v7, committed in `2efc1b3` but **never deployed**) is a
  hand-picked subset of the stream: reasoning, model,
  provider, id, finish reason, usage. Encrypted reasoning details, per-event
  structure and any field OpenRouter adds later are lost, and each new field
  means another turn version.

All of it also competes with the story for the turn's 96 KB ciphertext cap,
and is loaded with every turn whether or not the log is open.

The goal is the most complete, unmodified record possible: **the exact request
body the server sent OpenRouter, and the exact response it got back**, stored
once per request in a record of its own, with everything the log shows derived
from it when read. The suggestions' chat log (`daydream/suggest-chat-log.ts`)
moves onto the same parser, so there is one format and one viewer.

## Design

### What is recorded

One **exchange** per request to `/api/daydreams/[id]/reply` (opening, reply,
rewrite, check-in), for an account granted debug mode:

```ts
// The payload of `daydream-exchange` v1
{
  endpoint: 'chat/completions',
  request: string,      // the request body exactly as the server sent it (JSON text; no key — that is a header)
  response: {
    status: number,
    body: string,       // the SSE stream exactly as it arrived, every event and comment, UTF-8 decoded
    truncated?: true    // only if it outran the cap (see below)
  },
  ended: 'done' | 'error' | 'stopped' | 'dropped',
  startedAt: number, endedAt: number
}
```

- **Request:** the reply endpoint's first event changes from the digest
  (`{"boundUpSent": recordSent(messages)}`) to the body it actually sent,
  `{"boundUpRequest": "<the JSON string passed to fetch>"}`. Same rule as now:
  only when `record` is asked for, and now also only when the account holds
  `debugMode` (checked with `userHasFeature`, as the suggest endpoint does),
  so the server enforces who gets one rather than trusting the flag.
- **Response:** `writeReply` (`daydream/client.ts`) `tee()`s `response.body`.
  One branch feeds `readReplyStream` as today; the other is decoded to text
  untouched, with the endpoint's own first event cut off at its exact byte
  boundary. Nothing is parsed out of it at write time.
- **Failed and stopped replies are kept too.** A stopped reply keeps what had
  arrived (as `raw` does now). A failed reply — mid-stream error, dropped
  connection, empty reply — is saved as an exchange with no turn, under the
  turn it answered, so it can be inspected after a reload. Today it is lost
  on navigation.

### Where it is stored

- **New sealed kind `daydream-exchange`** (`src/lib/sealed-kinds/daydreams.ts`),
  self vault, `maxCiphertextLength` 1 MiB.
- **Compression at the envelope, opt-in per kind.** `defineSealedKind` takes
  `compressed: true`; `sealRecord` deflates the JSON bytes
  (`CompressionStream('deflate-raw')`, as `kink-list/share-link.ts` already
  does) before encrypting, and writes prefix `sz1.` instead of `sb1.`;
  `openRecord` inflates after decrypting. AAD is unchanged. The zod schema
  still validates the real payload, and fixtures still state it plainly.
  Putting base64 inside the JSON instead would cost ~1.78× and hide the
  payload from its own schema.
  - SSE and chat JSON are highly repetitive: a typical exchange (≈100 KB
    request with a long history, 200–500 KB of SSE) should seal to tens of KB.
    Measured in a test against a realistic fixture before the cap is fixed.
  - Compressing before encrypting leaks the compressed size to the server,
    which already handled every byte of this exchange in plaintext, so it
    learns nothing new. Said at the site, and only this kind opts in.
- **Over the cap:** the response body is cut (keeping its start) and
  `truncated` set, then it is sealed again. The request is never cut: it is
  bounded by the reply request's own schema.
- **New table `daydream_exchanges`** (`schema/app.ts`, migration by
  `drizzle-kit generate --name add_daydream_exchanges`; a new table, so no
  rebuild):
  `id`, `daydream_id` → `daydreams` cascade, `turn_id` → `daydream_turns`
  cascade (nullable: a failed reply's), `parent_turn_id` (what it answered,
  for placing a failed one), `ciphertext`, `vault_id` → `vaults` cascade,
  `payload_version`, timestamps. Index on (`daydream_id`, `turn_id`).
  Deleting a daydream takes its exchanges by cascade; nothing else changes in
  `deleteDaydream`.

### Endpoints

- `POST /api/daydreams/[id]/exchanges` — save one. `requireFeature` for both
  `daydreams` and `debugMode`, ownership, the turn and parent belong to the
  daydream, envelope checks via `sealedIsAcceptable` with the new kind's cap
  and the `sz1.` pattern. Called after the passage's turn is saved (or with
  no turn, for a failure). A failure here is reported in the raw log ("This
  exchange was not saved"), not the app-wide notice: it is debug data, and
  the passage itself saved.
- `POST /api/daydreams/[id]/exchanges/read` — sealed rows for up to N turn
  ids, plus failed exchanges under them. Called only when the raw log is on,
  for the turns it is drawing. Columns selected explicitly.
- Self-hosted: a 1 MiB post is under the Dockerfile's `BODY_SIZE_LIMIT`;
  `docs/self-hosting.md` already warns about adapter-node's 512 KB default.

### Reading it: one parser, one viewer

- **`src/lib/daydream/exchange-log.ts`** (pure, alias-free) replaces
  `suggest-chat-log.ts`: `exchangeLog({ request, response })` → the chat-log
  entries, from the request (system prompt, every message, the parameters)
  and the response (SSE replayed through the existing `stream.ts` line
  parser, or a JSON Chat Completions / Responses body for a suggestion):
  reasoning (text, summaries, and a note for encrypted details), fetched
  pages, the reply, finish reason, model, provider, generation id, usage, any
  error. An event it does not recognise is shown whole, never dropped.
  Because this runs at read time, improving it improves every log already
  saved.
- **Suggestions** use it too: the suggest endpoint's `boundUpSent` becomes
  the exact request body string, and `SuggestChatLog.svelte` renders
  `exchangeLog`'s entries. Suggestions are still not stored.
- **`ExchangeLog.svelte`** (generalising `SuggestChatLog.svelte`): the
  bubbles, with the messages the previous exchange did not send open and the
  rest closed, worked out by comparing the two message arrays exactly. A
  request that was not the previous one with more on the end says so, from
  the data rather than a hash. Under it, **Request** and **Response**
  disclosures with the exact text. The raw log's per-turn view
  (`DaydreamRawTurn.svelte`) renders this for a turn with an exchange, and
  failed exchanges appear under their parent.
- **Older turns** keep today's rendering: `raw`, `sent`, the chain check
  (`appendedToPrevious`, `DaydreamRawSent.svelte`), the rebuilt prompt
  (`RawConversation`, "Show prompt"). Those paths stay for records already
  stored, and are documented as legacy.

### What goes away

- **Turn v7 and `received` are withdrawn**, not frozen: never deployed, so
  the fixtures README allows it. Delete `received-record.ts` (+ test),
  `DaydreamRawEnding.svelte`, the `onEvent` hook in `stream.ts`, the
  `usage: { include: true }` change stays (it is part of the request now
  recorded), the v7 fixture, and the doc text added for it. Turn v6 is
  latest again.
- **New turns stop writing `raw` and `sent`.** Both stay readable in their
  frozen versions; `keepRawReplies` becomes "record exchanges".
  `rawReply`, `capSent` and `recordSent` remain only for reading old turns
  (or are deleted where nothing reads them).
- `suggest-chat-log.ts` folds into `exchange-log.ts`.

### Export

`exportHistory` adds `exchanges` (opened and inflated, request and response
as stored) beside `turns`; the export's `version` goes to 2.

### Out of scope

The picture request (mark v3 `sent`, Runware) keeps its own record. It could
become an exchange of its own later with no change to this design.

## Steps

1. Envelope: `compressed` on `defineSealedKind`; `sz1.` in `sealRecord` /
   `openRecord` (`src/lib/crypto/sealed.ts`, `src/lib/sealed.ts`), the
   server's acceptance check (`src/lib/server/sealed-content.ts`), and the
   independent sealer in `src/lib/sealed-fixtures/README.md`.
2. Withdraw turn v7 (`received`), as above.
3. `daydream-exchange` kind + v1 fixture (sealed independently, with
   `node:zlib` deflate-raw); table + migration; save and read endpoints in
   `src/lib/server/daydreams.ts` and `src/routes/api/daydreams/[id]/exchanges/`.
4. Reply endpoint sends `boundUpRequest` (exact body), gated on the feature;
   `writeReply` tees and captures the response; the story saves the exchange
   after the turn, or on its own for a failure; stops writing `raw`/`sent`.
5. `exchange-log.ts` + `ExchangeLog.svelte`; the raw log and the suggestions'
   chat log both use them; suggest endpoint sends the exact body.
6. Export v2.
7. Docs: rewrite "Daydreams' raw log" and "How a daydream draft or ideas were
   written" in `docs/debug-mode.md`; the stored list in `docs/daydreams.md`
   ("What the server sees"); the compressed envelope in
   `docs/encryption.md` ("Sealed records"). Copy this plan into
   `docs/historical-plans/` with the implementation date.

## Verification

- **Pure:** `exchange-log.test.ts` (an SSE capture with reasoning, reasoning
  details incl. encrypted, a mid-stream error, a usage event, keep-alive
  comments, an unknown event; a Responses JSON with fetches; a Chat
  Completions JSON); the compressed envelope round-trips and refuses a
  tampered `sz1.`; the sealed-fixtures test opens the new fixture; a realistic
  worst case fits the cap; message diffing against the previous exchange.
- **Server:** the exchanges endpoints (feature, ownership, turn in another
  daydream, cap, cascade on daydream delete); the reply endpoint sends the
  exact body only with `record` and the feature, never the key; the
  migration test passes (no `DROP TABLE`).
- **Component:** `DaydreamThread.svelte.test.ts` — an exchange saved after a
  passage, after a Stop, and for a failure; none without the grant; the raw
  log draws an exchange, and falls back to `raw`/`sent` for an older turn.
- **End to end:** extend `e2e/model-stub.mjs` to stream reasoning and a usage
  event; in `e2e/daydreams.spec.ts`'s debug test, open the raw log after a
  reload and see the reasoning, the usage and the exact request.
- The loop: `npm run check`, `npm run lint`, `npm test`,
  `npm run test:e2e:image`; `npm run preview` once, since the reply path and
  D1 are touched.
