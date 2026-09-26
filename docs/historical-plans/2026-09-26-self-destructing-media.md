# Self-destructing message media

## Context

Every image/video sent in partner messages lives forever today. Media should
self-destruct: the sender picks a lifetime per message (default **2 weeks**,
range **1 hour – 30 days**, presets), the countdown starts **at send**, and on
expiry only the media goes — the text stays, and each attachment is replaced by
a cute bomb icon with "This media has self-destructed".

Self-destructing media is for **everyone**. Sending media that **never**
self-destructs becomes a feature (`permanentMedia`, see
`docs/features-and-admin.md`) that an admin grants per account. Without it,
the composer has no "Never" option, and the server refuses one with a 403.

Where the bytes actually are: attachment ciphertext is in **R2**
(`bound-up-media`, `src/lib/server/media/r2.ts`), not D1. D1 only holds a tiny
`message_attachments` row (id, message id, byte size, storage key). R2 is what
we pay storage for, so expiry deletes the R2 object; the D1 row is kept (a few
bytes) and marked purged so the UI can tell "self-destructed" from "missing".

Nothing in the repo expires or sweeps anything yet — no cron, no `scheduled`
handler, no DO alarms.

## Design

### Data model — `src/lib/server/db/schema/app.ts` (`messageAttachments`)
- `expiresAt` — `integer('expires_at', { mode: 'timestamp_ms' })`, **nullable**:
  `null` means permanent (sent with the `permanentMedia` feature). It is
  computed **server-side** as `now + duration` (never trust the client clock).
  Because it is nullable, the migration needs no default. Existing rows stay
  permanent, which is fine since there are no real users yet.
- `purgedAt` — nullable `timestamp_ms`; set when the R2 object is deleted.
- Index `message_attachments_expiry_idx (purged_at, expires_at)` — the sweep's
  query path.
- `npx drizzle-kit generate --name add_media_expiry`, read the SQL, commit.

### Feature — `src/lib/features.ts`
- Add `permanentMedia: { name: 'Permanent media', description: 'Send photos
  and videos in messages that never self-destruct.' }`. The admin page lists
  it automatically.
- The decision is made **at send time**. Revoking the feature later does not
  make media already sent permanently start expiring. Granting it does not
  rescue media that is already counting down. The feature doc says so.

### Durations — `src/lib/messaging.ts` (alias-free constants)
- `MEDIA_TTL_MIN_MS = 1h`, `MEDIA_TTL_MAX_MS = 30d`, `MEDIA_TTL_DEFAULT_MS = 14d`.
- `MEDIA_TTL_PRESETS`: 1 hour, 6 hours, 1 day, 3 days, 1 week, 2 weeks, 30 days
  (label + ms). Server accepts **any** integer in range, so presets can change
  without a server change.

### Sending
- `src/lib/messaging/client.ts` (multipart builder, ~L105-143): add a
  `mediaTtlMs` field when there are files.
- `src/routes/api/partnerships/[id]/send.ts` `parseSend`: read `mediaTtlMs`.
  It may be absent (→ default), an integer in range, or the literal `never`.
  A non-integer or out-of-range value → 400 with an actionable message.
  Return `mediaTtl: number | 'never'` in `ParsedSend`.
- In both send routes (`threads/+server.ts`, `threads/[threadId]/messages/+server.ts`),
  when `mediaTtl === 'never'` and there are files, call
  `requireFeature(locals.db, user.id, 'permanentMedia')` from
  `src/lib/server/features.ts` **before** anything is written to R2. It throws
  a 403 naming the feature. `never` with no files is ignored.
- `src/lib/server/messaging.ts` `writeAttachments` / `startThread` /
  `sendMessage`: compute `expiresAt` once per send (`null` for `never`,
  otherwise `new Date(Date.now() + ttl)`) and write it on every attachment
  row in the existing `db.batch()`.
- The TTL is plaintext metadata (the server must know it to delete). Add it to
  "What the server still knows" in `docs/messaging.md`.

### Serving & reading
- `getAttachmentForDownload` (`server/messaging.ts` ~L437): select
  `expiresAt`/`purgedAt`; if `purgedAt` set **or** `expiresAt <= now`, return
  an `expired` result → the GET route
  (`src/routes/api/partnerships/[id]/attachments/[attachmentId]/+server.ts`)
  answers **410 Gone**. Checked at read, so expiry is exact even though the
  sweep runs periodically (same "read at use" pattern as
  `account_recovery_requests.expires_at`).
- The `cache-control: … immutable, max-age=31536000` on that route becomes
  `private, max-age=<seconds until expiresAt>` (no `immutable`), so a browser
  cache can't outlive the media.
- For permanent media, the route keeps today's `immutable` caching.
- `AttachmentView` (`src/lib/types.ts:230`) gains `expiresAt: number | null` and
  `expired: boolean` (server-computed at load). Populate in `getThread` and
  wherever the board's first-message preview attachments are loaded
  (`listBoard`).

### UI
- **Composer** (`src/lib/components/MessageComposer.svelte`, next to the attach
  control ~L71/172): a `wa-dropdown` trigger with a stopwatch `wa-icon` + the
  current choice ("2 weeks"), shown only while files are attached; items are
  the presets. Default 2 weeks, resets to default after a successful send.
  A final **"Never"** item appears only when
  `hasFeature(page.data.features, 'permanentMedia')`. That check only decides
  what is shown; the server enforces it.
  Add any newly used `wa-*` element to `src/lib/webawesome.ts`.
- **Bubble** (`MessageBubble.svelte` ~L72) / `AttachmentPreview.svelte`: pass
  the matching `AttachmentView` (by id) alongside the decrypted
  `MessageAttachmentInfo`.
  - Not expired: render as today, plus a small quiet caption "Self-destructs in
    3 days" (relative, from `expiresAt`). Permanent media (`expiresAt: null`)
    has no caption.
  - Expired (flag from load, **or** a 410 from `fetchAttachment`, **or** the
    countdown reaching zero while the page is open): don't fetch; render a new
    `SelfDestructedMedia.svelte` — a bomb `wa-icon` (Font Awesome `bomb`, with
    a little wiggle/spark CSS animation respecting `prefers-reduced-motion`)
    and "This media has self-destructed 💥"-style copy in theme tokens.
  - `fetchAttachment` (`client.ts` ~L357) throws a typed `MediaExpiredError`
    on 410 so the preview can distinguish it from "Could not open this file."
- **Board tiles**: expired thumbnails in the fanned stack show the same bomb
  placeholder (small variant).

### Deleting from R2 — the sweep
- New alias-free module `src/lib/server/media/expiry.ts`:
  `sweepExpiredMedia(db, store, now, { batchSize = 500 })` — selects
  `id, storageKey` where `purgedAt IS NULL AND expiresAt <= now` (limit),
  `store.delete(keys)`, then marks those rows `purgedAt = now` via
  `db.batch()`/one `UPDATE … WHERE id IN (…)`. Loops until empty or a time
  budget. R2 delete first, then mark: a crash re-deletes (idempotent) rather
  than leaving an unmarked orphan. Returns a count for logging.
- New alias-free entry `src/lib/server/scheduled.ts` exporting
  `scheduled(controller, env, ctx)`: builds the D1 Drizzle client with the
  existing alias-free factory in `src/lib/server/db/`, builds the store with
  `createR2Store(env.MEDIA)`, calls `ctx.waitUntil(sweepExpiredMedia(...))`.
  Relative imports only (wrangler's esbuild bundles it, like
  `durable-object.ts`) — this becomes the **third alias-free zone**.
- **Hooking it into the generated worker**: a small local Vite plugin in
  `vite.config.ts` (`apply: 'build'`, `closeBundle`, after the adapter and the
  DO exporter), idempotent via a marker comment like the DO plugin, that
  appends to `.svelte-kit/cloudflare/_worker.js`:
  ```js
  // SCHEDULED_EXPORT - do not remove
  import { scheduled as __scheduled } from '../../src/lib/server/scheduled.ts';
  worker_default.scheduled = __scheduled;
  ```
  It **throws with an actionable message** if `worker_default` is not found
  (adapter output shape changed), rather than silently shipping no sweep.
  Comment at the site explains why (adapter owns `main`, same reason as the
  DO exporter).
- `wrangler.jsonc`: `"triggers": { "crons": ["*/15 * * * *"] }` with a comment
  (≤15 min storage lag; exactness comes from the read-time check; Free plan
  allows cron triggers).
- **Dev**: no cron under `vite dev`. Read-time checks make behaviour correct;
  for actual deletion locally add `npm run media:sweep` only if cheap —
  otherwise note that `npm run preview` + `curl "http://localhost:8787/cdn-cgi/handler/scheduled"`
  (wrangler's `--test-scheduled`) exercises the real path.

### Related fix (same storage-cost goal)
`purgePartnershipMedia` (`server/messaging.ts` ~L1524) exists but is never
called: disconnecting a partnership leaves all its R2 objects forever. Call it
from `deletePartnership` / the disconnect action
(`settings/partners/[id]/+page.server.ts` ~L128) before the row delete.

## Tests
- **Pure** (`src/lib/messaging.test.ts`): presets all within range; default is
  14d.
- **Server** (in-memory DB + `src/lib/testing/media.ts` fake store):
  - `parseSend`: missing → default; 59 min / 31 days / non-integer → 400;
    `never` accepted.
  - send routes: `never` without `permanentMedia` → 403 and nothing written to
    the store or D1; `never` with the feature → row with `expiresAt = null`;
    `never` with no files and no feature → accepted.
  - sweep never touches `expiresAt IS NULL` rows.
  - send writes `expiresAt = now + ttl` on every attachment of the send.
  - download route: live → 200 with bounded max-age; past `expiresAt` → 410;
    purged → 410; non-member still 403/404 as before.
  - `sweepExpiredMedia`: deletes only expired unpurged objects from the store,
    marks them purged, leaves unexpired ones, idempotent on re-run, honours
    batch size across multiple loops.
  - `getThread`/`listBoard` expose `expired` correctly.
  - disconnect purges the partnership's media prefix.
- **Component** (`*.svelte.test.ts`): `AttachmentPreview` renders the bomb
  placeholder for an expired view without calling fetch; renders it on a 410;
  shows the countdown caption otherwise. Composer: picker hidden with no
  files, defaults to "2 weeks", selected value posted, "Never" shown only
  with the `permanentMedia` feature in page data.
- **E2E** (`e2e/messaging*.spec.ts`): send an image choosing "1 hour"; partner
  sees it with "Self-destructs in 1 hour"; then expire it by sweeping via a
  test-only fast path — set the row's `expires_at` into the past directly in
  the e2e SQLite file (the spec already knows the per-checkout DB path from
  `e2e/run-paths.ts`) and reload → bomb placeholder, no console errors.
- Build-level: a unit test for the append plugin's transform (idempotent,
  throws when `worker_default` is missing).

## Docs
- `docs/features-and-admin.md`: add a "Permanent media" subsection next to
  Guides (where it is enforced, and that the decision is made at send time).
  Update "Guides are the first, and so far only, feature."
- `docs/messaging.md`: new "Self-destructing media" section (TTL rules, read
  check vs sweep, 410, purged rows kept, cron, plaintext TTL in "what the
  server knows"); update the Attachments section and the disconnect cleanup.
- `AGENTS.md`: invariant 15 area — add `src/lib/server/scheduled.ts` +
  `media/expiry.ts` as alias-free, and the scheduled-export plugin next to the
  DO exporter explanation; repo map row if warranted.
- `README.md`: mention the cron trigger / how to test it with `preview`.
- Copy this plan to `docs/historical-plans/2026-09-26-self-destructing-media.md`.

## Verification
1. `npm run db:generate` (named) → read SQL → `npm run db:migrate:dev`.
2. `npm run check`, `npm run lint`, `npm test` (vitest + playwright) all clean.
3. `npm run build` → inspect `.svelte-kit/cloudflare/_worker.js` tail for both
   markers; rebuild to confirm idempotence.
4. `npm run preview` (workerd + real R2 binding locally): send media with
   1 hour, set its `expires_at` into the past in the local D1, hit
   `/cdn-cgi/handler/scheduled`, confirm the object is gone from local R2, the
   row has `purged_at`, and the thread shows the bomb.
