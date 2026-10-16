# Temporary code cleanup

This document tracks code that is intentionally temporary and is expected to
be removed once a specific dependency, platform constraint, or migration window
goes away.

Each section should name:

- what is temporary
- where it currently lives
- what removes the need for it
- what should stay after the cleanup

## Temporal polyfill

The task scheduling layer uses `@js-temporal/polyfill` today, not because the
app wants an abstraction over Temporal, but because the repo still needs a
portable implementation that works across the current browser and runtime set.

The goal is to keep **Temporal-based code** and remove only the **polyfill**
once the app can rely on native Temporal everywhere it cares about.

### Current temporary dependency

- package dependency: `@js-temporal/polyfill`
- current import site: `src/lib/task-schedule.ts`

If more files start importing the polyfill directly, add them to this list so
the eventual cleanup stays explicit.

### What to remove when native Temporal is enough

1. Remove `@js-temporal/polyfill` from `package.json`.
2. Update the lockfile by running the normal package-manager uninstall flow.
3. Replace imports shaped like:

   ```ts
   import { Temporal } from '@js-temporal/polyfill';
   ```

   with code that reads Temporal from the native global instead.

4. Remove any compatibility comments that exist only to explain the polyfill.
5. Re-run the full verification loop, including any browsers the project still
   supports in Playwright.

### What should stay

- The `Temporal`-based scheduling model itself.
- The owner-local wall-clock storage model.
- The task timezone ownership rules.
- Any tests that pin recurrence behavior, DST handling, or timezone-relative
  scheduling outcomes.

The cleanup is specifically **polyfill removal**, not a rewrite away from
Temporal.

## Legacy markdown rich text

Messages, task descriptions and reward descriptions became rich text (see
[docs/rich-text.md](rich-text.md)). Everything written before that is a **plain
string**: the composer was a `<wa-textarea>`, the renderer linkified it and kept
whitespace with `pre-wrap`, and no markdown was ever stored or interpreted.

The app reads both forms today. That is scaffolding, not the design. The
temporary half converts legacy content as it is encountered and — where it is
allowed to — writes the converted form back, so that one day there is nothing
left to read and all of this can be deleted in a single commit.

### Why the client does the converting

Because it is the only option that exists. Message bodies, and now task and
reward descriptions, are E2E encrypted, so the server cannot read them, cannot
convert them, and never will be able to. The only place one can be converted
is a browser holding the key.

Neither has a conversion path of its own any more. Message bodies are
converted as they move into the partnership vault (see
[Messages in the original scheme](#messages-in-the-original-scheme) below), and
descriptions as their task or reward is sealed (see
[Tasks and rewards in plaintext](#tasks-and-rewards-in-plaintext)); both
decrypt or read every one anyway.

### Current temporary code

Every touch point outside these files carries a `LEGACY-RICHTEXT` comment on
the line that goes, so this is the authoritative list:

```sh
grep -rn 'LEGACY-RICHTEXT' src
```

Whole files, deleted outright:

- `src/lib/richtext-legacy.ts` — plain text → document, including the
  linkifyjs call and the embed insertion

Edits inside files that stay:

- `parseStoredRichText` in `src/lib/richtext.ts` — its legacy branch
- `MESSAGE_BODY_FORMATS` / `isMessageBodyFormat` in `src/lib/messaging.ts`
- `messages.body_format` in the schema, and where `sealLegacyMessages` and the
  two send paths set it
- the `asDocument` conversions in `src/lib/messaging/vault-migration.ts` and
  `src/lib/content-sealing.ts`
- the `LEGACY-RICHTEXT`-marked `describe` blocks in `richtext.test.ts` and
  `RichText.svelte.test.ts`

### The `body_format` column, and why it exists

The server cannot read a body, so it cannot tell a legacy one from a converted
one. `messages.body_format` is a plaintext, closed two-value enum
(`'plain' | 'lexical'`) that lets it. Same shape and same reasoning as
`message_threads.icon` under AGENTS.md invariant 14: two fixed values leak
nothing about content, where a free-text column would be a covert channel.

Its remaining job is to make **"are we done?" a query rather than a guess**
(below). Moving a row into the vault converts its body and sets the column to
`'lexical'`, so it reaches zero exactly when the original scheme does.

### What removes the need for it

Both of these reaching zero **in production**, with enough margin that no
client is still holding an unsynced draft:

```sql
-- Messages still in the old form.
select count(*) from messages where body_format = 'plain';

```

Descriptions have no count of their own: a legacy one can only still exist in
a task or reward that has not been sealed yet, so the count under
[Tasks and rewards in plaintext](#tasks-and-rewards-in-plaintext) covers them.

**The caveat that will bite.** A message encrypted to keys neither partner
still has can never be migrated _by anyone_, because nobody can read it. Those rows
may sit at `'plain'` for ever. The real criterion is therefore "zero legacy
rows that anyone can still decrypt", and the final cleanup may have to accept a
residue that renders as unreadable either way — which is what it already does
today. Do not wait for a literal zero.

### What to remove when the counts reach zero

1. Delete the files above.
2. Remove every line found by the `grep`, and `parseStoredRichText` collapses to
   `parseRichTextDocument(stored) ?? emptyRichTextDocument()`.
3. Drop the `body_format` column with a generated migration — read the SQL,
   commit it, never `drizzle-kit push` (invariant 6).
4. Re-run the full verification loop, including `npm run test:e2e`.

### What should stay

- The document format, `RichText.svelte`, the editors, and the golden-file
  shape test in `richtext.test.ts`.
- **`linkifyjs` stays a dependency.** It leaves the read path, but the editor
  still uses it as the auto-link matcher — it is the one answer to "is this a
  URL", and removing it would change what counts as a link.
- The `richDescription` sanitising in `src/lib/sealed-kinds/tasks.ts`, which
  is not about legacy content at all.

## Messages in the original scheme

Before vaults, every message body, metadata sidecar and reaction was
age-encrypted to both partners' recipients. Each is now a sealed record in the
partnership vault, and rows written before that are moved in by a device in
the background ([docs/messaging.md](messaging.md#moving-into-the-vault)). The
original scheme is read until nothing is left in it.

### Current temporary code

- `migrate-on-load.ts` and `vault-migration.ts` in `src/lib/messaging/`, and the
  trigger for them in `EncryptionGate.svelte`
- `listLegacyMessages` and `sealLegacyMessages` in `src/lib/server/messaging.ts`,
  `sealedMigrationSchema` in `src/lib/schemas/messageForm.ts`, and the
  `sealed-migration` endpoint
- the `vaultId === null` branches of `openMessage`, `openMessageMetadata` and
  `openReaction` in `src/lib/messaging/client.ts`, and the early return for an
  unsealed row in `writeMessageMetadataEntry`
- `decryptMessageMetadata` in `src/lib/crypto/messages.ts`, and `decryptPayload`'s
  message uses (drafts still use it, so it stays)
- the migration step in `src/lib/messaging/restore.ts`
- `makeMessageLegacy` in `src/lib/testing/fixtures.ts`, the
  "moving messages into the vault" tests in `server/messaging.test.ts`, and the
  migration test in `e2e/vaults.spec.ts`

`ThreadView.svelte` and `ThreadSticker.svelte` open messages in their own
`$effect`s rather than through `sealedReader` (`src/lib/sealed-cache.svelte.ts`)
only because they still have to read both schemes. Moving them onto the reader
belongs to this cleanup.

### What removes the need for it

```sql
select
  (select count(*) from messages where vault_id is null) +
  (select count(*) from message_reactions where vault_id is null);
```

reaching zero in production, or the remainder being rows nobody can read — the
same residue the rich-text cleanup above describes, encrypted to keys both
partners lost. Those render as unreadable either way.

### What to remove

1. Everything in the list above.
2. Make `messages.vault_id`, `messages.payload_version`, `message_reactions.vault_id`
   and `message_reactions.payload_version` `NOT NULL` with a generated migration,
   after deleting the residue.
3. Re-run the full verification loop, including `npm run test:e2e`.

### What should stay

- The sealed kinds, the vault, and the restore that wraps it.
- `decryptPayload` and `encryptPayload`, which drafts use.

## Tasks and rewards in plaintext

Tasks, rewards, completions and claims are sealed in a vault
([docs/tasks.md](tasks.md#what-the-server-can-see)). Rows written before that
keep their text in plaintext columns until a device seals them: once vaults
are open, `content-sealing.ts` asks `/api/sealing/[scope]` for the scope's
unsealed rows, seals each into the scope's vault, and posts them back, and the
server empties the plaintext in the same write. Any member can seal a
partnership's rows; only the owner, their own. A completion or claim is sealed
to its own id, as the task or reward it recorded, with the one message it was
given at index 0.

### Current temporary code

- `src/lib/content-sealing.ts`, and the `sealOpenScopes()` call in
  `EncryptionGate.svelte`
- `src/lib/server/content-sealing.ts`, `src/lib/schemas/sealing.ts` and
  `src/routes/api/sealing/[scope]/+server.ts`, with their tests
- the plaintext branches of the openers in `src/lib/sealed-views.svelte.ts`
  (a view with `sealed: null`), and the plaintext fields on the task, reward,
  completion, claim and widget views in `src/lib/types.ts`
- the plaintext columns themselves: `title`, `description` and
  `completion_messages` on the task tables; `task_title`, `task_description`
  and `completion_message` on the completion tables; `title` and
  `description` on the reward tables; `reward_title` and `reward_description`
  on the claim tables. A sealed row keeps them empty (`''`, `'[]'` or NULL)
  rather than NULL throughout, because making a NOT NULL column nullable
  means rebuilding the table, and a rebuild cascade-deletes on D1 (see the
  trap in AGENTS.md).

A row whose old content does not fit the kind — a title over 80 characters,
say, from before a limit — is skipped rather than sealed, and stays in
plaintext.

### What removes the need for it

```sql
select
  (select count(*) from self_tasks where ciphertext is null) +
  (select count(*) from partnership_tasks where ciphertext is null) +
  (select count(*) from self_task_completions where snapshot_ciphertext is null) +
  (select count(*) from partnership_task_completions where snapshot_ciphertext is null) +
  (select count(*) from self_rewards where ciphertext is null) +
  (select count(*) from partnership_rewards where ciphertext is null) +
  (select count(*) from self_reward_claims where snapshot_ciphertext is null) +
  (select count(*) from partnership_reward_claims where snapshot_ciphertext is null);
```

reaching zero in production. Unlike messages, nothing here is unreadable to
everyone — it is plaintext — so a residue means accounts that have not
signed in since, or rows that did not fit. Decide what to do with those
before dropping the columns; dropping them deletes that text.

### What to remove

1. Everything in the list above.
2. Drop the plaintext columns with a generated migration. `DROP COLUMN` is
   an ALTER, not a rebuild, so it is safe; making `ciphertext` and the rest
   `NOT NULL` is a rebuild, so leave them nullable and let the code hold the
   line, unless the rebuild has been checked against D1 first.
3. Re-run the full verification loop, including `npm run test:e2e`.
