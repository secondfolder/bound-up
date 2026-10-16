# Daydreams: roleplay with a generated character

## Context

The roadmap has a placeholder, `generated-roleplay` ("Roleplay scenarios
written for you, from your preferences"). This plan turns it into a feature
called **Daydreams**. A user sets up a character and a scenario. The app
generates an opening scene, and the user then chats with the character turn by
turn.

The name was chosen to avoid "bot" and "AI", and to avoid any suggestion that
the character replaces a partner. It describes something more than solo play
but less than a two-person scene.

Decisions already made with the user:

- **Privacy:** our server forwards the conversation to the model provider and
  never stores or logs it. This is the first routine exception to "the server
  reads content nowhere", so the user is told this before first use and must
  accept. Saved history is still sealed in the user's self vault.
- **Shape:** a generated opening scenario that becomes a live chat.
- **Scope of v1:** standalone. Using the kink list, setting tasks or awarding
  points, and partner involvement go on the roadmap as twigs.
- **Provider:** OpenRouter, with models whose terms allow adult content. Anthropic,
  OpenAI and Workers AI do not allow this kind of content.

## Shape of the feature

1. **Setup** (`/daydreams/new`). The user fills in:
   - the character's name and persona;
   - the dynamic (who leads; free text plus quick picks);
   - the scenario premise and tone;
   - hard limits, as free text.

   The form is sealed as a `daydream-setup` record in the self vault and posted
   as a superform action. The setup can be edited later.
2. **Opening.** On first open, the browser asks the server to generate the
   opening scene from the setup. The reply streams in, and the browser seals it
   as the first `character` turn.
3. **Chat** (`/daydreams/[id]`). On each turn:
   - The browser seals and saves the user's turn.
   - It posts the setup plus a trimmed recent history, in plaintext, to the
     reply endpoint, which streams the character's reply back.
   - When the reply finishes, the browser seals it and saves it.
   - **Retry last reply** regenerates the newest character turn and replaces
     it, using a compare-and-swap on `revision`.
4. **List and delete** (`/daydreams`, plus a `DaydreamsWidget` on `/home`).
   Deleting a daydream is deliberate and asks for confirmation.

### Generation endpoint

`src/routes/api/daydreams/[id]/reply/+server.ts`, a POST that takes
`{ mode: 'opening' | 'reply', setup, turns }`. In order, it:

1. Checks `locals.user`, then `requireFeature(db, userId, 'daydreams')`, then
   that the daydream belongs to the user (404 otherwise), then that the
   disclosure has been accepted (409 otherwise), then the per-user rate limit.
2. Validates the body with Zod, applying caps on field lengths, turn count and
   total characters.
3. Builds the messages in `src/lib/server/daydream/prompt.ts`. That file holds
   a **server-owned system prompt**, which the client cannot change. It wraps
   the user's setup and hard-codes the safety rules:
   - every character is an adult;
   - no minors;
   - no real, identifiable people;
   - the user's stated limits are respected;
   - a safeword in the user's turn stops the scene.
4. Calls `${OPENROUTER_BASE_URL}/chat/completions` with `stream: true` and
   `provider: { data_collection: 'deny' }`.
5. Passes the upstream SSE body through as
   `new Response(upstream.body, { headers: SSE_HEADERS })`.
   - `SSE_HEADERS` is reused from `src/lib/server/realtime/index.ts`.
   - No Durable Object is involved.
6. Never logs the request or response bodies. Errors are logged by status code
   only, with a comment at the site saying why.

The browser reads the stream with `tryFetch` plus `response.body.getReader()`.
It can't use `EventSource`, which only sends GET. The parser is in
`src/lib/daydream/stream.ts`, a pure module with tests. If generation fails, the
user's text stays in the composer and the draft.

### Data model (`schema/app.ts`, then `drizzle-kit generate --name add_daydreams`)

- **`daydreams`**
  - `id` (a UUID chosen by the browser, because it is part of the AAD)
  - `userId` → user, cascade
  - `...sealedContent()`: the setup
  - `lastTurnAt`, `timestamps`
  - index on `(userId, lastTurnAt)`
- **`daydream_turns`**
  - `id`, `daydreamId` → daydreams, cascade
  - `role`: `'user' | 'character'`, the only plaintext role marker
  - `position`: an integer; turns order by `position`, then `id`
  - `...sealedContent()`: the turn text
  - unique on `(daydreamId, position)`
- **`daydream_preferences`**
  - `userId` as primary key
  - `disclosureAcceptedAt`
  - This replaces the old `*_ack_at` pattern on `user_keys`. Its own table
    keeps `schema/auth.ts` untouched.

Only additive migrations, which `migrations.test.ts` checks for. Queries name
their columns explicitly.

### Sealed kinds (`src/lib/sealed-kinds/daydreams.ts`)

- `daydreamSetupKind` and `daydreamTurnKind` are defined with
  `defineSealedKind` and registered in `ALL_SEALED_KINDS`.
- Each gets a frozen fixture in `src/lib/sealed-fixtures/fixtures.json`.
- Turn text is plain text, not Lexical. Model output isn't rich text, and plain
  text keeps the prompt path simple.
- Content caps live in the Zod schemas.
- Screens open records through new `openedDaydreamSetup` and `openedTurn`
  helpers in `sealed-views.svelte.ts`. They show the placeholder until the
  keyring is unlocked.

### Server endpoints and actions

All are under `(auth-required)/(app)/daydreams/` and `src/routes/api/daydreams/`.
Each one calls `requireFeature` itself.

| What | Where |
| --- | --- |
| List | `daydreams/+page.server.ts` |
| Create or edit setup | `daydreams/new`, `daydreams/[id]/edit`; superforms + `sealForSubmit` / `replaceWithSealed` |
| Accept disclosure | form action on `daydreams/+page.server.ts` (`?/acceptDisclosure`) |
| Save turn / replace last turn | `api/daydreams/[id]/turns/+server.ts`: POST appends at `position = max + 1`; PUT replaces the newest character turn (CAS on revision). The server checks the envelope only, with `sealedIsAcceptable` and the self vault id from `selfVaultIdFor` |
| Generate | `api/daydreams/[id]/reply/+server.ts` (above) |
| Delete | form action `?/delete` on `daydreams/[id]` |

### Disclosure (consent)

- `DaydreamDisclosure.svelte` is shown in place of the list until it is
  accepted.
- It says in plain words that while using Daydreams, what you write and the
  character setup are sent through Bound Up to OpenRouter and a model provider
  to write the replies. It says neither of them is asked to keep the text, and
  that saved history is private to you as usual.
- It doesn't talk about encryption or "unlocking"; that rule is in
  `encryption-invisible-to-users`.
- Acceptance is stored on the server, and the reply endpoint enforces it.
- There's also a brief reminder line under the composer.

### UI

- Reuse `MessageComposer.svelte`. Add a prop to turn attachments off, and send
  `documentToPlainText` of the composed document.
- Drafts: add `{ kind: 'daydream'; daydreamId }` to `DraftScope` in
  `src/lib/messaging/drafts.ts`, as the never-lose-typed-text rule requires.
- `DaydreamThread.svelte` shows the turns:
  - user turns on one side, character turns on the other;
  - a streaming bubble while a reply arrives;
  - **Retry** on the newest character reply;
  - a **Stop** button that aborts the fetch.
- The chat lives in the app shell, so `<main>` scrolls. Scroll to the newest
  turn the same way `EdgeTask.svelte` finds its scroll ancestor.
- `DaydreamsWidget.svelte` follows `GuidesWidget.svelte`. On `/home` it loads
  only when `hasFeature(features, 'daydreams')`.
- Web Awesome components throughout, following the save-button rules (outlined
  until there's something valid to save). The feature gets no nav tab, the
  same as the Playroom.

### Config, gating, cost

- **Feature flag:** `daydreams` in `FEATURES` (`src/lib/features.ts`), granted
  by an admin.
- **Env:** `OPENROUTER_API_KEY` (optional), `DAYDREAM_MODEL` (with a default),
  and `OPENROUTER_BASE_URL` (defaults to `https://openrouter.ai/api/v1`; the
  e2e stub overrides it).
  - These are read in `src/lib/server/daydream/config.ts` as
    `platform?.env?.X ?? privateEnv.X`, following `mail/config.ts`.
  - Without a key the feature is off, the same way VAPID works:
    `readDaydreamConfig` returns `null`. The pages then say Daydreams isn't
    set up on this server.
  - Add the variables to `app.d.ts`, `.env.example`, `.dev.vars.example`,
    `docker-compose.yml`, `scripts/secrets.mjs` and the env table in
    `docs/self-hosting.md`.
- **Rate limit:** a `locals.daydreamRateLimit(userId)` in `hooks.server.ts`,
  built on `consumeRateLimit` with scope `daydream|user|<id>`: e.g. 20 per
  minute and 300 per day.
  - Follow the existing dev and `AUTH_RATE_LIMIT=off` behaviour.
  - Update `docs/rate-limiting.md`, which currently says nothing else is
    limited.
- **Context trimming:** done on the client in `src/lib/daydream/context.ts`
  (pure, tested). It always keeps the setup plus the newest turns under a
  character budget. The server caps enforce the same limit.

### Roadmap (`src/lib/roadmap/roadmap.json`)

- Rename `generated-roleplay` to the title "Daydreams" (the id stays), set it
  to `in-progress`, and update the summary.
- Add twigs:
  - "Uses your kink list": `dependsOn: ["kink-list"]`.
  - "Characters set tasks and award points": depends on
    `self-partner-rewards`.
  - "Partner can see or shape your daydreams".
- When it ships, set `shipped` and `shippedOn`.

### Docs

- **New `docs/daydreams.md`**, plus a row in the AGENTS.md feature table. It
  covers:
  - the flow and the data model;
  - the plaintext boundary, stated as exactly as `docs/encryption.md` states
    its own;
  - why the system prompt is owned by the server;
  - the safety rules;
  - the config and the limits;
  - the known gap: with no partner there is no escrow, so lost access means a
    lost self vault and its history.
- **`docs/user-commitments-and-product-goals.md`:** add Daydreams as a named
  exception under Privacy, next to the embed-metadata one.
- **`docs/encryption.md`:** add the new sealed kinds.
- **`docs/features-and-admin.md`:** list the new feature.
- **`docs/self-hosting.md` and `docs/rate-limiting.md`:** as above.
- **Historical plan:** copy this plan to
  `docs/historical-plans/<impl-date>-daydreams.md`.

## Tests

- **Pure** (node project):
  - the prompt builder: safety rules always present; the user's setup can't
    replace the system prompt;
  - the SSE stream parser;
  - context trimming;
  - the config parser;
  - the Zod caps;
  - the sealed kinds, which `sealed-fixtures.test.ts` checks against the frozen
    fixtures.
- **Server**, with `createTestDb`, `fakeEvent` and `runAction`:
  - 403 without the feature;
  - 404 for another user's daydream;
  - 409 before the disclosure is accepted;
  - the rate limit refuses;
  - a turn is appended at the next position;
  - the CAS replace of the last turn conflicts on a stale revision;
  - delete cascades;
  - the reply endpoint forwards to a stubbed `fetch` with the server system
    prompt and `data_collection: 'deny'`, and never calls `console.*` with
    content (spy on it);
  - the home load skips the query without the feature.
- **Component** (browser project):
  - `DaydreamThread` renders a streamed reply incrementally, and Stop aborts;
  - a failed generation keeps the composer text;
  - the placeholder shows while the keyring isn't unlocked.
- **E2E**: a small OpenRouter stub server started by `e2e/server.mjs`, with
  `OPENROUTER_BASE_URL` pointing at it. The spec, `e2e/daydreams.spec.ts`:
  1. Grant the feature with `sql()`, accept the disclosure.
  2. Create a setup and see the opening stream in.
  3. Send a turn and get a reply.
  4. Reload and see the history decrypted.
  5. Retry, then delete.
  6. Confirm a draft survives a reload.

## Verification

- `npm run check`, `npm run lint`, `npm test` and `npm run test:e2e` all pass.
- `npm run test:e2e:image` passes, because the stub and env have to work in
  the Docker build.
- `npm run preview` with a real `OPENROUTER_API_KEY` in `.dev.vars`: confirm
  streaming passes through workerd with no buffering, and that Workers logs
  show no content.
- A manual check against real OpenRouter in dev with a permissive model, to
  tune the default `DAYDREAM_MODEL` and the system prompt.
