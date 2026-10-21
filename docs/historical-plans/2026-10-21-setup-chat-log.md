# Keep a new daydream's setup chat log with it

## Context

In debug mode the new-daydream page shows a "Chat log" (`ExchangeLog.svelte`)
for a draft written from a brief, and for the round of generated ideas. That
log is thrown away when the user presses "Start daydreaming"
(docs/debug-mode.md: "Nothing about a suggestion is stored"). So when a
daydream turns out oddly, there is no way to go back and see what the model
was asked and answered when it was set up — only the story's own exchanges
are kept.

Goal: when an account with debug mode creates a daydream from a draft that
has a chat log, send that exchange (and, for a generated idea, the ideas
round that offered it) with the create request, store it sealed like
`daydream_exchanges`, and show it at the top of the daydream's raw log.

## Where

Implement in a separate git worktree (`EnterWorktree`, new branch off
`main`), not in the main checkout, which has uncommitted daydream work in
progress. Run the verification loop there too (the e2e suite's port and DB
are derived per checkout, so it will not collide).

## Design

### What is kept (raw, not the parsed view)

Same principle as `daydream-exchange`: keep the exchange verbatim and read it
when drawn, so a better `exchange-log.ts` reader improves old ones too.

- New pure type in `src/lib/daydream/exchange.ts` (or a sibling
  `setup-exchange.ts`): `SetupExchange = { task: 'daydream' | 'ideas';
  request: string; response: { body: string; truncated?: true }; startedAt;
  endedAt }`. `request` is the `boundUpRequest` string exactly as the server
  sent it; `response.body` is the answer JSON (minus `boundUpRequest`)
  re-stringified — the suggest endpoint's answer is parsed JSON by the time
  `requestSuggestion` hands it back, so it is the answer, not its bytes; say
  so in the comment. Caps reuse `EXCHANGE_LIMITS` / `MAX_EXCHANGE_CIPHERTEXT`.
- `src/lib/daydream/exchange-log.ts`: add `setupExchangeLog(exchange)` that
  rebuilds the `{ boundUpRequest, ...body }` shape and calls the existing
  `suggestionLog`, so one reader draws both.

### Client: carrying it from the suggestion to the submit

- `src/lib/daydream/suggest.ts`: `withLog` also returns `exchange:
  SetupExchange` (built from `answer.body`, with `startedAt`/`endedAt`
  timed around `requestSuggestion` in `ask`) whenever `log` is present.
  `WithLog<T>` gains `exchange?`.
- `src/routes/(auth-required)/(app)/daydreams/new/+page.svelte`:
  - `Stage.setup` gains `exchanges: SetupExchange[]` beside `log`.
  - `generated` keeps each round's exchange, and each `GeneratedIdea` shown
    is mapped to the round that offered it (a `Map<title, SetupExchange>`
    alongside `ideas`, since "More ideas" replaces `generated.log` with the
    latest round). `writeIdea` passes the chosen idea's round through
    `Described` (new optional `ideasExchange`), and `writeDraft` puts
    `[ideasExchange?, draftExchange]` on the stage. "Try another" replaces
    the draft's exchange, keeps the ideas round.
  - Passes `setupExchanges={stage.exchanges}` to `DaydreamSetupForm` only
    when `data.debug`.
- `src/lib/components/DaydreamSetupForm.svelte`: new optional prop
  `setupExchanges`. In `onSubmit`, for a new daydream only, seal each with
  the new kind (`sealForSubmit`, `scope: { kind: 'self' }`, a fresh
  `crypto.randomUUID()` per exchange kept across retries like `newId`, using
  the halve-the-response loop `saveExchange` in `daydream/client.ts` uses —
  factor that loop out and reuse it rather than copy it). A seal that fails
  is dropped, never blocks the create. Add the sealed list to `jsonData` as
  `setupExchanges`.

### Sealed kind

`src/lib/sealed-kinds/daydreams.ts`: new kind `daydream-setup-exchange`,
v1, `compressed: true`, `maxCiphertextLength: MAX_EXCHANGE_CIPHERTEXT`,
schema mirroring `SetupExchange`. Register in `ALL_SEALED_KINDS`
(`sealed-kinds/index.ts`), add a frozen fixture to
`src/lib/sealed-fixtures/fixtures.json` sealed by the independent node
implementation per its README.

A separate kind (not daydream-exchange v2) because its response is a JSON
answer, not an SSE stream, and every existing reader of `daydream-exchange`
assumes a stream.

### Storage

New table in `src/lib/server/db/schema/app.ts`, `daydreamSetupExchanges`
(`daydream_setup_exchanges`): `id`, `daydreamId` → `daydreams.id` cascade,
`ciphertext`, `vaultId` → `vaults.id` cascade, `payloadVersion`,
`timestamps`; index on `daydreamId`. A table of its own rather than rows in
`daydream_exchanges` with null turn ids, which `readExchanges` already
reads as failed openings. New table, so no rebuild; generate with
`npx drizzle-kit generate --name add_daydream_setup_exchanges` and read the
SQL.

### Server

- `src/lib/schemas/daydreamForm.ts`: `setupExchangeSchema` (id, vaultId,
  ciphertext with `sealedPatternFor(daydreamSetupExchangeKind)` and the cap,
  payloadVersion), and `daydreamSealedSubmitSchema` gains
  `setupExchanges: z.array(setupExchangeSchema).max(2).optional()`.
- `src/lib/server/daydreams.ts`: `saveSetupExchanges(db, userId,
  daydreamId, exchanges)` — `contentProblem` on each envelope, insert with
  `onConflictDoNothing`; and `readSetupExchanges(db, userId, daydreamId)`
  (ownership check, explicit columns, ordered `createdAt`, `id`).
- `daydreams/new/+page.server.ts` action: after `createDaydream` succeeds,
  if `setupExchanges` is non-empty and `userHasFeature(db, user.id,
  'debugMode')`, save them inside `try` — a failure is logged (no content)
  and the redirect still happens: the daydream matters, the debug data does
  not. Ignored silently for an account without the feature.
- New `GET src/routes/api/daydreams/[id]/setup-exchanges/+server.ts`:
  `daydreamGuard` + `requireFeature(…, 'debugMode')`, returns the sealed
  views (new `DaydreamSetupExchangeView` in `src/lib/types.ts`).

### Showing it

- `src/lib/daydream/client.ts`: `readSetupExchanges(daydreamId)` via `send`.
- `src/lib/components/DaydreamThread.svelte`: while `rawLog` is on, load them
  once (a small `$state` loader, or a method on `RawExchanges`) and render a
  new `DaydreamRawSetup.svelte` at the top of the `<ol class="turns">`,
  before the failed openings: a "How this daydream was set up" item with one
  `ExchangeLog` per exchange ("Ideas round" / "Draft"), drawn from
  `setupExchangeLog`. A record that will not open says so, as
  `DaydreamRawExchange` does; nothing renders while the keyring is not
  unlocked (already gated above).
- `story.exportHistory`: include the opened setup exchanges as
  `setupExchanges` and bump the export `version` to 3.

## Tests

- Pure: `exchange-log.test.ts` — `setupExchangeLog` reads both a Chat
  Completions and a Responses answer; `suggestions`/`suggest` test that
  `withLog` returns `exchange` only with a log.
- Sealed: fixture for v1 (`sealed-fixtures.test.ts` picks it up);
  `sealed-kinds/daydreams.test.ts` caps.
- Server: `daydreams/new/page.server.test.ts` — create with exchanges keeps
  them for a debug-mode account, ignores them without the feature, a
  malformed/foreign-vault one does not stop the create; new
  `api/daydreams/[id]/setup-exchanges/server.test.ts` — feature gate,
  ownership 404, returns the rows. `migrations.test.ts` stays green.
- Component: `DaydreamSetupForm` (through its existing test wrapper) posts
  `setupExchanges` sealed only when given; the raw-log setup section renders.
- E2E (`e2e/daydreams*.spec.ts`, whatever covers the brief flow with a
  stubbed model): debug account writes a draft from a brief, starts it,
  turns the raw log on, sees "How this daydream was set up" with the
  brief in it.

## Docs

- `docs/debug-mode.md`: rewrite "Nothing about a suggestion is stored" in
  "How a daydream draft or ideas were written"; add a "Setup exchanges"
  subsection under "Daydreams' raw log" (what is kept, when, the table, the
  kind, why a separate kind/table); update the export version note and Tests.
- `docs/daydreams.md` where it lists daydream tables, and
  `docs/encryption.md` if it lists compressed kinds ("Only this kind opts
  in" in debug-mode.md becomes two kinds).
- Copy this plan to `docs/historical-plans/2026-10-21-setup-chat-log.md`.

## Verification

`npm run check`, `npm run lint`, `npm test`, `npm run test:e2e`; then by
hand under `npm run dev` with debug mode on: write a draft from a brief
(and once from a generated idea), start it, switch on Raw log, confirm both
logs show and match what the new-daydream page showed; confirm an account
without debug mode creates normally and nothing is stored.
