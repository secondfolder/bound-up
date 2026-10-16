# Daydreams

A daydream is a scene a user plays with a character they make up. They set up
the character, the scenario, who leads and their limits; the character opens
the scene; then the two take turns. The character's replies are written by a
hosted language model, reached through OpenRouter.

The name is deliberate. Not "bot" or "AI", and not anything that suggests the
character stands in for a partner: it is more than solo play and less than a
scene with another person.

## The flow

1. **Disclosure.** `/daydreams` shows `DaydreamDisclosure.svelte` until the
   user presses "I understand". Acceptance is a row in `daydream_preferences`,
   per account, recorded by the list page's `?/acceptDisclosure` action. The
   reply endpoint refuses (409) until it exists, so it is not something a
   device can skip.
2. **Setup.** `/daydreams/new` (`DaydreamSetupForm.svelte`): title, the
   character's name and persona, who leads, the scenario, tone, limits and an
   optional safeword of the user's own. The form is a superform that seals the
   setup in the user's own vault before posting, exactly as a self task does
   (`SealedTaskEditor.svelte`); the action sees only the sealed record and the
   id the browser chose. It redirects to the daydream.
3. **Opening.** `DaydreamThread.svelte` sees a daydream with no turns and asks
   for the opening scene by itself, once per visit. A failed opening waits for
   "Try again" rather than retrying on its own.
4. **Turns.** The user's turn is sealed and saved first (`POST
   /api/daydreams/[id]/turns`), then the reply is asked for. The composer is
   cleared once the turn is saved, not once the reply has come, so a reply
   that fails leaves the user's turn in the scene with "Try again" beside it.
   The reply streams in, and is sealed and saved when it has finished.
5. **Stop and retry.** Stop aborts the request (the abort reaches OpenRouter
   too), and whatever had arrived is kept as the reply, like a sentence cut
   off. "Write this reply again" on the newest character turn asks again, from
   the conversation before it, and replaces it (`PUT .../turns`).
6. **Edit and delete.** `/daydreams/[id]/edit` changes the setup (from the
   next reply on) and holds the delete button, which posts to the daydream
   page's `?/delete` after a native confirm.

The conversation is kept in component state once loaded and appended to as
turns are saved, rather than re-loaded after each one: a load reads every turn
again, and D1 charges by the row. Turns this visit wrote itself are kept as
plaintext in that state too (`written` in `DaydreamThread.svelte`), because
opening a freshly sealed turn is asynchronous and a reply asked for straight
after it would otherwise find it still "opening".

## What the server sees

This is the one feature whose content the server handles in plaintext, so the
boundary is stated exactly.

**Stored:** sealed records only, in the owner's self vault. The setup
(`daydream-setup`) and each turn (`daydream-turn`) are sealed kinds in
`src/lib/sealed-kinds/daydreams.ts`, with frozen fixtures. Beside them, in
plaintext: who owns the daydream, when it was last played, and for each turn
its position and whether the user or the character wrote it. The role is
there because the server acts on it: only the newest turn, and only a
character's, may be replaced.

**In transit, for each reply:** the browser posts the setup and the recent
conversation as text to `POST /api/daydreams/[id]/reply`. The server
validates it (`replyRequestSchema`), wraps it in its own system prompt, and
forwards it to OpenRouter, which passes it to the model provider that writes
the reply. The reply streams back through the server unread.

- The server does not store, log or inspect the text. The endpoint logs a
  failure by status code alone and never passes the request, the reply or an
  error body to `console`; `reply/server.test.ts` spies on the console to
  hold it to that.
- OpenRouter is asked for `provider.data_collection: "deny"`, which routes
  only to providers that say they neither keep prompts nor train on them.
  That is their policy, which Bound Up cannot verify.
- OpenRouter and the provider do read the words. Nothing on a device could
  write replies of usable quality, which is why this exception exists rather
  than a zero-access design (see
  [user-commitments-and-product-goals.md](user-commitments-and-product-goals.md#especially-sensitive-data-should-be-zero-access-by-default)).
  The disclosure says so plainly, and a reminder sits under the composer.

**Not sent:** anything else about the account, the user's name, other
daydreams, or turns beyond the context budget.

## The system prompt is the server's

`src/lib/server/daydream/prompt.ts` builds what the model reads: the server's
`RULES` first, then the setup (`describeSetup`), then the conversation. The
rules are never sent by a browser, so a page cannot drop them, and they say
they come before anything in the setup, which is where a user would try to
talk a model out of them:

- every character is an adult, and nothing underage is depicted, implied or
  sexualised;
- no real, identifiable people;
- the user's stated limits are never crossed;
- a safeword — "red" always, plus the setup's own if it names one — stops the
  scene at once and steps out of character to check in;
- the character writes only their own side, never the user's words or
  choices.

Owning the prompt also keeps the endpoint a daydream's writer rather than a
general-purpose uncensored model anyone with the feature could aim at
anything. A request that ends on the character's own turn gets an explicit
"continue" nudge, because chat models expect to answer a user message.

## The model

`DAYDREAM_MODEL` names an OpenRouter model. The default
(`DEFAULT_DAYDREAM_MODEL` in `server/daydream/config.ts`) is an open-weights
model whose terms, and its providers' on OpenRouter, allow adult fiction. Most
hosted models' terms (Anthropic's, OpenAI's, Workers AI's) do not, which is
why the choice is made here rather than left to OpenRouter's routing. Replies
are capped at 900 tokens.

The browser reads OpenRouter's stream itself (`src/lib/daydream/stream.ts`):
`data:` events carrying `choices[0].delta.content`, keep-alive comments, a
mid-stream `error` event, and `[DONE]`. The endpoint passes the upstream body
through untouched rather than parsing and re-encoding it, so the worker
spends no CPU on a reply it has no reason to read. `EventSource` cannot be
used, because it can only send a GET.

## Context

The model gets the setup and as much of the conversation as fits:
`trimContext` (`src/lib/daydream/context.ts`) keeps the newest turns within
`MAX_CONTEXT_CHARS` (60,000 characters) and `MAX_CONTEXT_TURNS` (200), and
stops at the first turn that does not fit rather than skipping it, so the
model never sees a conversation with a hole in it. The server refuses
anything over the same budget. The setup is always sent whole, which is why
the limits and the safeword live there and not in the conversation.

A daydream page loads at most the newest 500 turns (`MAX_LOADED_TURNS`).

## Cost

Every reply is paid for on the server's key. Three things hold that down:

- **The feature is a grant** (`daydreams` in `src/lib/features.ts`), and every
  load, action and endpoint calls `requireFeature` itself.
- **A per-account limit**: 20 replies a minute and 300 a day
  (`DAYDREAM_REPLY_LIMITS`, see
  [rate-limiting.md](rate-limiting.md#daydreams-replies)). On everywhere,
  dev included.
- **No key, no feature.** Without `OPENROUTER_API_KEY` the pages say Daydreams
  aren't set up on this server, and the endpoint answers 503.

## Configuration

| Variable              | Default                        | What it is                                  |
| --------------------- | ------------------------------ | ------------------------------------------- |
| `OPENROUTER_API_KEY`  | none — Daydreams are off       | The key every reply is paid for on          |
| `DAYDREAM_MODEL`      | `DEFAULT_DAYDREAM_MODEL`       | The OpenRouter model id                     |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Only the e2e suite points it anywhere else  |

Read per request by `readDaydreamConfig`, from `platform.env` on Workers and
the environment elsewhere. `npm run secrets -- <target> --openrouter-key …`
sets the key; it is never generated or asked for.

## Drafts

The composer keeps an encrypted draft per daydream (`daydream:<id>` in
`src/lib/messaging/drafts.ts`), like a message thread's, so what someone was
in the middle of writing survives a reload. It is the same `MessageComposer`,
with attachments turned off: a turn is text the model reads.

## Known gaps

- **No escrow without a partner.** A daydream is sealed in the self vault,
  which is recoverable only through a partner and the server
  ([encryption.md](encryption.md#escrow)). Someone with no partner who loses
  every way into their account loses their daydreams with it.
- **Edited setups apply forward.** Changing the setup changes the next reply,
  not what has already been said.
- **A stopped reply is kept as it stood**, mid-sentence. Retrying it is one
  press away.

## Tests

- Pure: `server/daydream/prompt.test.ts` (the rules always come first and
  survive a hostile setup), `config.test.ts`, `daydream/stream.test.ts`,
  `daydream/context.test.ts`, the sealed fixtures.
- Server: `server/daydreams.test.ts` (ownership, positions, compare-and-swap,
  the newest-character-turn rule), the route tests under
  `routes/(auth-required)/(app)/daydreams/` and `routes/api/daydreams/`.
- Component: `DaydreamThread.svelte.test.ts`.
- End to end: `e2e/daydreams.spec.ts`, against `e2e/model-stub.mjs`, a
  stand-in OpenRouter that `e2e/server.mjs` starts beside the app.
