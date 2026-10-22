# Notebook: Journal and Notes (live, encrypted, versioned)

## Context

The roadmap has a planned **Notebook** branch (`src/lib/roadmap/roadmap.json`,
`journal-notes`: "Somewhere to write things down, as often as you like").
This change builds its first part: **Journal** (dated entries) and **Notes**
(free pages). Both exist in the solo view (`/home`) and in each partner view
(`/partner/[id]`). Entries are rich text and support Google Docs–style
**real-time co-editing**, with **live presence and cursors** and **automatic
version history**.

Decisions already made with the user:
- **Notebook entries are stored encrypted, end to end:** content, edits,
  versions and cursors alike. See "Encryption at rest".
- Edits travel over the realtime stream as **sealed ciphertext**.
  `RealtimeRoom` is generalised into the app's single realtime room, with
  topics. The "metadata only" rule stays, but now as a rule of messaging's
  frames rather than of the room.
- **Presence and remote cursors ship in v1.**
- **Partner entries:** both partners can edit by default. A member who holds
  `control` can set an entry to **read-only** or **hidden** for the other
  partner.
- **Not feature-gated.** It is on for everyone.

The constraints come from AGENTS.md:
- Content is end-to-end sealed in vaults, and the server never reads it.
- Updates are SSE plus POST, not WebSocket, because `vite dev` cannot upgrade.
- A Durable Object (DO) is billed per open stream.
- Use `db.batch()`, never transactions.
- The DO files are alias-free.
- Never lose typed text.

## Encryption at rest

**Every byte of entry content is end-to-end encrypted before it leaves the
browser, and stays encrypted wherever it is stored.** Encryption uses the
existing vaults, and the server never sees a key or plaintext.
- **Self entries** are sealed to the user's **self vault**.
- **Partner entries** are sealed to the **partnership vault**. Writes need a
  `WriteGrant` from `writeGrantFor` (the trust and safety-number check).
- Records are sealed with AES-256-GCM through `sealRecord`
  (`src/lib/crypto/sealed.ts`). The AAD binds kind, record id, vault and
  version, so a record cannot be swapped between entries, scopes or kinds.
- **No compression** (`sz1.`) is used for any notebook kind. The rule allows it
  only for content the server has already seen.

| Where it is stored | What | How it is encrypted |
| --- | --- | --- |
| D1 `notebook_entries.ciphertext` | Title and list excerpt (the header) | `notebook-entry` sealed record |
| D1 `notebook_updates.ciphertext` | Every edit (Yjs update), including the title | `notebook-update` sealed record |
| R2, or the local media directory | Version snapshots (the full document at a point in time) | `notebook-snapshot` sealed record. The blob is the ciphertext string. |
| Never stored; relayed by the room | Cursors and presence | `notebook-awareness` sealed record |
| The device (localStorage) | The outbox of edits not sent yet | Age-encrypted to the user's own recipient, as message drafts are. Cleared once sent. |
| The Durable Object or local room | Nothing persisted | It only fans out ciphertext frames it cannot open |

**The server checks only the envelope.** `sealedIsAcceptable` checks the
`sb1.` prefix, the size cap, a known version and the right vault for the
entry's scope. It never parses content. Every plaintext column that holds
content is absent by design: there is no `title` or `body` column at all, so
no legacy "plaintext until sealed" path exists for notebooks.

**What stays plaintext**, all of it metadata the server needs to route,
authorise and order. It is listed in `docs/notebook.md`'s "What the server
still knows":
- The entry id and its scope (owner or partnership).
- `kind` (journal or note) and the journal `entry_date`.
- Who created the entry, and the access setting.
- Edit timestamps and who posted each update. The contributor ids on a version
  derive from that.
- Ciphertext sizes and the update `seq`.

Titles, excerpts, body text, formatting, links and embeds are never among
them.

**Tests that hold this:**
- A server test asserts that a row written through the create and update
  actions contains no plaintext from the test payload, and that a non-`sb1.`
  or wrong-vault ciphertext is refused.
- The e2e spec greps the D1 rows (via `sql()`) and the stored snapshot blob for
  a sentinel phrase typed into the editor, and expects no match.
- Sealed fixtures freeze each kind's format.

## Architecture

**The CRDT is Yjs, through `@lexical/yjs`.** Add `yjs` (13.6.x),
`@lexical/yjs@0.51.0` (pinned to Lexical's version) and `y-protocols` (for
awareness). `@lexical/yjs` exports `createBinding`, `syncLexicalUpdateToYjs`,
`syncYjsChangesToLexical`, `syncCursorPositions`, `createUndoManager` and
`initLocalState`. That is everything `CollaborationPlugin` uses, without React,
so we wire it by hand the Svelte way (see the memory "Svelte idioms over
ported APIs"). Only browser code imports yjs: it must not reach the worker
bundle. Add it to `optimizeDeps.include` if it is dynamically imported.

**Data flow for one entry:**
1. **Open.** The page fetches the latest sealed snapshot plus every sealed
   update after it. It opens them with the scope's vault and applies them to a
   `Y.Doc`. The editor is then bound to that doc.
2. **Local edit.** Yjs emits an update. The client coalesces updates for about
   400 ms (`Y.mergeUpdates`), seals them as a `notebook-update` record (its id
   is a client UUID) and POSTs it. The server checks the envelope and access,
   inserts a row (which assigns a monotonically increasing `seq`), and
   publishes `{ type: 'update', seq, id, vaultId, payloadVersion, ciphertext }`
   to the entry's room.
3. **Remote edit.** The room fans the update out over SSE. The receiver opens
   it and runs `Y.applyUpdate`. Yjs updates are idempotent and commutative, so
   duplicates and reordering are harmless. The client subscribes **before**
   fetching on open (and on every reconnect or becoming visible), so nothing
   falls into the gap.
4. **Awareness (presence and cursors).** A `y-protocols` `Awareness` update is
   sealed as `notebook-awareness`. It rides in the same POST as a pending
   update, or goes alone, throttled to about 1/s. The room relays it and never
   stores it. Cursor labels are **not** taken from the awareness payload (the
   name invariant 12 protects).
   - The payload carries only a stable per-device client id plus the user id.
   - The viewer labels each cursor locally: "You (other device)" for their own
     user id, otherwise `partnerName()` from `partner-names.svelte.ts`.
   - Colours are theme tokens.
5. **Undo.** Yjs's `createUndoManager`, so undo only reverts your own edits.
   `createRichTextEditor` (`src/lib/richtext-editor.ts`) gets a
   `history: false` option that skips `registerHistory` for the collaborative
   editor.

**Bootstrapping.** A Yjs editor whose doc is empty must create its root
paragraph exactly once. Creating an entry posts its **first update** (the empty
root paragraph and the empty title) together with the entry row. Clients
therefore never bootstrap an existing entry, and two clients cannot race to do
it.

**The title lives in the Y.Doc** as a `Y.Text`, so it merges live too. It is
edited in an `InputField` bound by a small diff helper. Lists need it without
loading the doc, so a sealed **header** record (`notebook-entry`:
`{ title, excerpt }`) is a derived cache. It is rewritten by whichever client
is editing, debounced to about 5 s. Its revision compare-and-swap loser simply
drops its write (another client already wrote something at least as fresh).

**Versions (automatic, like Google Docs).**
- **What a version is:** a sealed `notebook-snapshot` holding
  `Y.encodeStateAsUpdate(doc)` up to a `seq`.
- **When one is cut:** by the last editing client when the entry has been idle
  for 2 minutes after an edit, or after 30 minutes of continuous editing since
  the last version, and on `pagehide` when there are edits not yet in a
  version (best effort).
- **Duplicates:** a version must have `upToSeq` above the latest one, and the
  server refuses duplicates with 409.
- **Where it is stored:** the snapshot body goes in `MediaStore` (R2, or the
  local directory), because it can exceed D1's comfortable row size. Keys are
  `notebook/self/<userId>/<entryId>/<versionId>` and
  `notebook/partnership/<pid>/<entryId>/<versionId>`. The D1 row holds its
  metadata: time, `upToSeq`, and the contributor user ids, which the server
  already knows because it saw who posted.
- **Compaction:** after a new version, the server deletes the updates with
  `seq ≤` the **previous** version's `upToSeq`. Keeping one version's margin
  protects against a bad snapshot. The client only offers a snapshot covering
  the contiguous seqs it has actually applied.
- **History UI:** a drawer lists versions grouped by day, with who edited each.
  Previewing a version loads the snapshot into a throwaway Y.Doc and a headless
  Lexical editor, exports it with `exportEditorDocument` and `toStoredDocument`,
  and renders it with `RichText.svelte`.
- **Restore:** one tagged `setEditorState` into the live editor, which
  propagates as an ordinary edit (so partners see it live, and it is itself
  undoable), followed by a version labelled as a restore.

**Never lose typed text.** Unsent updates sit in a per-entry outbox,
encrypted on the device:
- It reuses the `openDraft` pattern in `src/lib/messaging/drafts.ts`, which
  age-encrypts to your own recipient.
- An update leaves the outbox only once its POST succeeds.
- On load, pending outbox updates are applied and resent; Yjs dedupes them.
- A save-state indicator shows "Saved", "Saving…" or "Offline — kept on this
  device". POSTs go through `tryFetch`.

**Size.**
- An update ciphertext is capped at 256 KB. A larger paste is split into
  several updates (Yjs updates can be split by applying the update to a
  scratch doc and diffing state vectors). If the split is not clean, the paste
  is refused with an inline message.
- Entry visible text is capped at 100k characters, checked client-side with
  `documentToPlainText`.
- A snapshot is capped at 4 MB.

## Access

All access is computed in a pure, alias-free `src/lib/notebook.ts` and tested
there.
- **Self entries:** owner only.
- **Partnership entries:** `partner_access` is `'edit' | 'read' | 'hidden'`,
  plus `access_set_by_user_id`.
  - The restriction applies to the member who is **not**
    `access_set_by_user_id`.
  - Only a member who currently holds `control` can change it (reuse the
    partnership control helpers).
  - Like reward authorship, the setter is preserved when control flips. The new
    controller can still change it.
- **Hidden** is withheld by the **server** (lists, every endpoint and room
  subscription return 404), not by cryptography. The other partner holds the
  partnership vault key. `docs/notebook.md` says so plainly; partners are
  trusted.
- When access changes, the room is told to **evict** that user's streams and
  publishes an `access` frame, so an open page drops to read-only or leaves.
- **Read-only:** update and awareness POSTs from that user are refused with 403
  on the server (invariant 14). The editor is also made non-editable, but only
  as display.
- **Who can delete an entry:** the owner, or for a partnership entry, either
  member with edit access. It is confirmed with a dialog.

## Data model (`src/lib/server/db/schema/app.ts`, `drizzle-kit generate --name add_notebook`)

**`notebook_entries`**
- `id`, plus scope: `owner_id` or `partnership_id`, with a CHECK that exactly
  one is set.
- `kind` (`'journal' | 'note'`), and `entry_date` (`YYYY-MM-DD`, journal only,
  defaulting to today in the account timezone).
- `created_by_user_id`, `partner_access` (default `'edit'`),
  `access_set_by_user_id`.
- `last_edited_at` and `last_edited_by_user_id`. These are only written when
  more than 60 s old (a conditional UPDATE), to spare D1 writes.
- `...sealedContent()` for the header, plus `timestamps`.
- Indexes: `(owner_id, kind, entry_date)`, `(partnership_id, kind, entry_date)`
  and `(…, last_edited_at)`.

**`notebook_updates`**
- `seq` (integer primary key, autoincrement), `id` (client UUID, unique),
  `entry_id` (cascade), `author_user_id`, `vault_id`, `payload_version`,
  `ciphertext`, `created_at`.
- Index `(entry_id, seq)`.

**`notebook_versions`**
- `id`, `entry_id` (cascade), `up_to_seq`, `media_key`, `vault_id`,
  `payload_version`, `contributor_user_ids` (json), `restored_from_version_id`,
  `created_by_user_id`, `created_at`.
- Index `(entry_id, created_at)`, plus unique `(entry_id, up_to_seq)`.

Queries select columns explicitly. The migration only adds tables (no rebuild,
so there is no D1 cascade trap). Snapshot blobs are purged in three places:
- Entry delete: `deletePrefix(entry)`.
- Partnership disconnect: next to the existing `deletePrefix` in
  `src/lib/server/messaging.ts:2167`.
- Account deletion: check where account deletion purges media, and add the
  self prefix there.

## Sealed kinds (`src/lib/sealed-kinds/notebook.ts`, registered in `index.ts`)

| Kind | v1 schema |
| --- | --- |
| `notebook-entry` | `{ title: string ≤200, excerpt: string ≤300 }` |
| `notebook-update` | `{ update: base64 }` |
| `notebook-awareness` | `{ state: base64 }` |
| `notebook-snapshot` | `{ state: base64 }` |

Each kind gets a frozen fixture in `src/lib/sealed-fixtures/fixtures.json`,
produced by the `node:crypto` recipe in that directory's README. Sealing goes
through `sealRecord` with a `WriteGrant` (`writeGrantFor` for partnership
scope). The server uses `sealedIsAcceptable` (`src/lib/server/sealed-content.ts`).

## Realtime: generalise `RealtimeRoom` into the app's one realtime room

`RealtimeRoom` becomes the room for **every** realtime feature: messaging and
the notebook now, anything later. It is **not** split. Reasons:
- **Same cost.** A DO is billed per open stream and request, not per class or
  instance, so one class costs no more than two.
- **Less to wire.** One class, binding, `exports` entry, previews entry and
  local backend, where two would each be duplicated.
- **One lease implementation.** The lease and presence machinery is the subtle
  part (see "A stream is a lease" in `docs/messaging.md`), and there is
  then exactly one copy of it.
- **One stream per page.** A partner page that wants both message and
  notebook-list freshness holds a single stream, not two.

The **class name stays `RealtimeRoom`**: it is now accurate. That avoids a DO
rename, which would need a tombstone `"state": "renamed"` entry in `exports`.

**Shape**
- **Room key is a scope**, not a partnership id:
  - `partnership:<id>` covers partner messaging, the partner notebook list and
    partner entries.
  - `user:<id>` covers the solo notebook. Solo entries co-edit across your own
    devices.
  - The key goes through `idFromName`. Changing the name scheme only changes
    which DO instance a room lands on. Rooms hold no storage, so a deploy just
    reconnects the open streams, which already refetch.
- **Each stream subscribes to topics:**
  - `messages`
  - `notebook`, the list
  - `notebook-entry:<entryId>`
  - The events endpoint authorises each topic before opening the stream:
    membership, plus entry access for an entry topic, so a hidden entry's
    topic is refused (404).
- **`publish(room, topic, frame)` delivers only to streams subscribed to that
  topic.** It returns the watchers of that topic only, so push suppression
  keeps meaning "this device has the **message** board open", not "has any
  page of this partnership open".
- **The room treats a frame as an opaque string.**
- **Metadata-only becomes the messaging publisher's rule.** The comment in
  `realtime/index.ts`, its type (`MessagingEvent`, renamed from
  `RealtimeEvent`) and `docs/messaging.md` say: messaging frames are metadata
  only, enforced by the messaging publish helper's type. Other topics may
  carry sealed ciphertext, never plaintext.
- **New `evict(room, { userId, topic })`** closes that user's streams on a
  topic. It is used when an entry becomes hidden or read-only, followed by an
  `access` frame.
- **Per-stream queue limit**, now counted in bytes as well as frames
  (`SSE_QUEUE_LIMIT` stays the frame count, plus a byte cap of about 1 MB).
  Notebook updates are bursty and larger than messaging's ten-byte events.
  Dropping a slow client is still safe, because reconnecting refetches the
  missed updates by `seq`.

**Files changed (all alias-free, invariant 15):**
- `src/lib/server/realtime/{index,durable-object,local,remote,backend}.ts`:
  room keys, topics, publish by topic, evict, the byte cap.
- The messaging callers (`src/lib/server/messaging.ts`,
  `src/routes/api/partnerships/[id]/events/…`): move to
  `partnership:<id>` + topic `messages`. Messaging behaviour is otherwise
  unchanged, and the existing realtime and messaging tests must still pass
  untouched apart from the renames.
- Notebook endpoints: `src/routes/api/notebook/events/+server.ts`, which takes
  the scope and topics and authorises each one, plus `…/events/presence`. They
  share the lease handling with the messaging endpoint through a small helper
  rather than copying it.
- No new binding, `exports` entry or plugin list entry. `wrangler.jsonc` is
  unchanged.

**Client.** Generalise `src/lib/messaging/live.ts` into
`src/lib/realtime/live.ts` (`watchRoom({ scope, topics, onFrame,
onReconnect })`), which `watchPartnership` then wraps. It keeps:
- The hide-on-hidden and refetch-on-visible pair.
- Backoff with jitter, stream ids and presence beacons.

The notebook session's `onReconnect` fetches `updates?after=<highest seq>`.
Its polling fallback polls that endpoint instead of `invalidate()`. While live
editing is paused, a status says so, and the outbox keeps the edits.

**List freshness.** A metadata-only frame on topic `notebook` is published on
create, delete and access change, so an open list `invalidate()`s.

The cost goes in `docs/notebook.md`:
- Each POST is about one Worker request plus one DO request.
- At about 2.5/s while typing, an hour of typing is about 9k requests.
- Awareness is piggybacked and throttled.
- Streams close when the page is hidden, as for messaging.

## Routes and UI

**Solo**
- `src/routes/(auth-required)/(app)/home/notebook/+page{.server.ts,.svelte}`:
  - A `wa-tab-group` with Journal and Notes.
  - Journal lists entries grouped by month, newest date first.
  - Notes lists entries by last edited.
  - Each has a "New entry" / "New note" action.
- `home/notebook/[entryId]/+page{.server.ts,.svelte}` is the editor page.

**Partner**
- `partner/[id]/notebook/…` mirrors the solo routes, with membership checked
  via `getPartnershipForUser` (404).
- An access control (Edit / Read only / Hidden for the other partner) shows on
  the entry page only for a member holding control. It is a form action that
  re-checks control against the database.

**Creating an entry**
- A client superform built from `defaults()` (`$lib/superform`), in the shape
  of `RewardForm`.
- It seals the header and the first update, posts both, and redirects (303) to
  the entry.
- For journal entries, the date is an `InputField type="date"`, defaulting to
  today.

**API**, under `src/routes/api/notebook/entries/[entryId]/`, each handler doing
its own auth, membership and access checks, outside the route groups:
- `updates/+server.ts`: GET `?after=seq` and POST (update and/or awareness).
- The stream is the shared `api/notebook/events` endpoint (see Realtime), not a
  per-entry one.
- `header/+server.ts`: POST, with compare-and-swap.
- `versions/+server.ts`: GET list, POST create (multipart: metadata + sealed
  blob).
- `versions/[versionId]/+server.ts`: GET blob.

**Components** (`src/lib/components/notebook/`)
- `CollaborativeEditor.svelte` builds the editor from
  `createRichTextEditor({ features: DOCUMENT_FEATURES, history: false })` and
  binds it with `createBinding`.
  - Extract embed decorator mounting from `RichTextEditor.svelte` into a shared
    helper rather than copying it.
  - It keeps `FloatingFormatToolbar`.
  - It has a cursors overlay container for `syncCursorPositions`.
- `NotebookList.svelte`, `EntryHeader.svelte` (title + date + save state +
  presence avatars), `VersionHistory.svelte` (a `wa-drawer`) and
  `AccessControl.svelte`.
- Placeholder rules: render "…" until the keyring is `unlocked` and records
  open.
- Pages are client-side only (`ssr` stays on for the shell). The doc mounts
  after the vault opens.
- Page width tokens apply, and the scroll container is `<main>` (an app-shell
  trap).

**Section widgets.** Add `NotebookWidget.svelte` on `/home` and
`/partner/[id]`, following `docs/section-widgets.md`:
- A cheap reader returning the 3 most recently edited entries
  (`getHomeNotebookWidget`, `getPartnershipNotebookWidget`), with sealed
  titles.
- Hidden entries are excluded on the server.
- No empty state: the body is omitted when there are none.

**Embeds and links.** Keep the existing `EmbedNode` and link replacements. The
editor shape (a block at root) is what lives in Yjs, and `toStoredDocument` is
applied when exporting for previews and excerpts. Verify that
`CollabDecoratorNode` syncs `EmbedNode` and that the link replacement classes
round-trip (component test below).

## Pure modules (alias-free, node-tested)

- `src/lib/notebook.ts`:
  - The access rules: `canRead`, `canEdit`, `canSetAccess`.
  - Version scheduling: `shouldCutVersion(lastEditAt, lastVersionAt, now)`.
  - The compaction bound.
  - Journal grouping.
- `src/lib/notebook/outbox.ts` (browser), `src/lib/notebook/session.svelte.ts`
  (Y.Doc + transport + awareness lifecycle) and `src/lib/notebook/headless.ts`
  (snapshot → stored document).

## Tests

- **Pure:** the access matrix (control inviter, invitee and both, after a
  control flip), version scheduling, split and merge of updates, compaction
  bound, journal grouping.
- **Server** (`createTestDb`, `fakeEvent`, `runAction`):
  - Create (self and partnership).
  - Update POST: seq assignment, envelope refusal, 403 for read-only, 404 for
    hidden and for a non-member.
  - GET `after`.
  - Header compare-and-swap conflict.
  - Version create, its duplicate 409, compaction deleting only under the
    previous bound, and blob purge on delete.
  - The access action re-checking control.
  - Widget readers excluding hidden entries.
- **DO and local room** (extend `realtime/durable-object.test.ts`,
  `local.test.ts` and `remote.test.ts`):
  - Topic filtering: a `messages` stream never receives notebook frames, and
    the reverse.
  - `publish` returns only that topic's watchers.
  - Evict by user and topic.
  - The byte-capped queue.
  - Lease expiry is unchanged.
  - Push suppression ignores a device that only has a notebook page open.
- **Events endpoint:** refuses an entry topic that is hidden from the user, and
  one for an entry in another scope.
- **Sealed fixtures:** the 4 new kinds (`sealed-fixtures.test.ts` enforces
  them).
- **Component** (`*.svelte.test.ts`):
  - Two `CollaborativeEditor`s wired through a fake in-memory transport
    converge on concurrent typing.
  - Formatting, lists, links and an embed round-trip.
  - Undo only reverts local edits.
  - The read-only state.
  - The outbox replays after a simulated failure.
- **E2E** (`e2e/notebook.spec.ts`, two contexts):
  - A partner sees the other's typing live, and both type at once and converge.
  - A remote cursor label shows the partner's name.
  - The solo journal: create on a date, reload, content persists.
  - Version history: let it go idle (shorten the timings through a test hook
    or the page's debug override), preview, restore.
  - Controller sets read-only, so the other cannot type; sets hidden, so the
    entry vanishes from the other's list and its URL 404s.
  - Offline: block the POST route, type, reload, text is still there and syncs
    once unblocked.
  - Every spec imports `test` from `./fixtures`.

## Docs and housekeeping

- **New `docs/notebook.md`**, added to the AGENTS.md feature-doc table. It
  covers the data model, access (hidden is server-withheld), the Yjs flow,
  bootstrapping, versions and compaction, the outbox, the room and its cost,
  and why content travels on this stream.
- **`docs/messaging.md` "Realtime":** the room is now app-wide, with scopes
  and topics. Metadata-only is the messaging topic's rule. Push suppression
  counts only `messages` watchers.
- **New `docs/realtime.md`**, added to the feature-doc table, if the shared
  room's explanation (scopes, topics, the lease, the cost) outgrows a section.
  Otherwise it moves out of `messaging.md` into one place both features link
  to.
- **`docs/notifications.md`:** watchers are now per topic.
- **AGENTS.md:**
  - The repo-map row for `src/lib/notebook/` and `src/lib/realtime/`.
  - The `RealtimeRoom` wording in invariant 15 stays (same file, same class).
- **`docs/rich-text.md`:** the collaborative editor and `history: false`.
- **`docs/encryption.md`:** the new sealed kinds.
- **`docs/partners.md`:** a "What control gates" row for notebook access.
- **Roadmap:** `journal-notes` → `in-progress`, with shipped twigs for
  "Journal" and "Free text notes" (with `shippedOn`). Fantasies and bucket list
  stay planned.
- **Plan record:** copy this plan to
  `docs/historical-plans/2026-10-22-notebook-journal-notes.md`.

## Verification

1. `npm run db:generate` (as `drizzle-kit generate --name add_notebook`), read
   the SQL, then `npm run db:migrate:dev`.
2. `npm run check`, `npm run lint` and `npm test` (vitest node + browser, then
   Playwright).
3. `npm run test:e2e:image`, because the Node build has its own realtime and
   media backends.
4. `npm run preview` with two browsers on one partner entry. This exercises
   the real `RealtimeRoom` DO with topics, check that messaging live updates and
   push suppression still behave, the R2 snapshots and the worker bundle (confirm
   yjs is absent from the server bundle).
5. Manually check in the dev app with two accounts:
   - Live typing, cursors and presence.
   - Hidden and read-only.
   - Version restore.
   - Airplane-mode typing survives a reload.
