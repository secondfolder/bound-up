# Messaging

Two linked partners can send each other private messages. The server stores a
copy of everything so that signing in on a new device restores the history, but
it stores only ciphertext: each message is a sealed record in the partnership's
vault (see [Sealed in the partnership vault](#sealed-in-the-partnership-vault)).

The keys are [docs/encryption.md](encryption.md). The link between two accounts
is [docs/partners.md](partners.md). The body format is
[docs/rich-text.md](rich-text.md). This document is the messaging data model
and its rules.

## The shape of it

Deliberately not a chat log. The unit is a **thread**: a small, self-contained
exchange, a few replies at most, and next time you start a new one. The couple
has another channel for ordinary conversation; this is for the other thing.

A partner's messaging page is therefore a board of little stickers, one per
thread, rather than a scrolling transcript.

What the board shows depends on whether the recipient has ever opened that
thread. A never-opened unread thread shows as a sealed envelope to the
recipient only. Every other tile shows a small preview of the thread's first
message, decrypted in the browser after unlock, with the latest send date under
it and, for read threads whose latest message was first read on a later day, an
additional `opened …` line. When the first message already has cached embed
metadata, the board prefers that richer preview card instead of waiting for a
fresh embed lookup. A first message with text, or with more than one
attachment, is otherwise shown as a small fanned stack: the text sits in its
own bubble and up to the first few attachments sit behind it as thumbnails. The
fan uses the whole preview width, sits on a transparent preview background, and
spreads further apart on hover. An attachment-only first message with just one
attachment shows that thumbnail on its own, uncanted and cropped to fill the
whole preview area, instead of a generic "photo attached" label. While the
browser is still working out whether this device can open the history, the
board and thread render immediately with placeholder previews instead of a
full-page loading wall.

## Sealed in the partnership vault

A message body, its metadata sidecar and a reaction are each a **sealed record**
in the partnership's vault — three kinds, `message`, `message-metadata` and
`message-reaction`, declared in `src/lib/sealed-kinds/messages.ts`. The vault,
the record format and the version rules are [docs/encryption.md](encryption.md#vaults);
what is particular to messages:

- **Ids come from the browser.** A body is sealed to its message id, so the
  sending browser chooses it (`messageId` in the send), the same way it already
  chose attachment ids. A sidecar is sealed to its message's id. A reaction
  gets a fresh id on every write, which the row takes on too.
- **Every write needs the trust check's permission** — a send, a reaction and a
  cached embed alike. Reactions and embed metadata used not to ask.
- **The server checks that a body is sealed to this partnership's vault** and
  that its version is one it knows (`checkSealedMessage` in
  `server/messaging.ts`). A body sealed to any other vault is one neither
  partner could open.

### Moving into the vault

Messages sent before vaults were age-encrypted to both partners' recipients,
and some partnerships still hold rows like that: `vault_id` is NULL on them.
The server cannot re-encrypt anything, so moving them is done by a device:

- Once its vaults are open, the app shell starts `migrateOpenPartnerships`
  (`messaging/migrate-on-load.ts`), once per partnership per page load, for
  every partnership this device may write into.
- That pages through `GET .../sealed-migration` — rows still in the original
  scheme, messages and reactions on separate cursors — opens each with the
  user's identity, seals it into the vault, and posts the copies back
  (`messaging/vault-migration.ts`).
- **Either partner can move any row**, since every one is encrypted to both. A
  row this device cannot open — encrypted to a key it no longer has — is
  skipped and left for the other partner's device.
- **The server writes each row at most once** (`sealLegacyMessages`): only
  where `vault_id IS NULL`, only inside this partnership, only into this
  partnership's vault. Two devices migrating at once cannot overwrite each
  other, and the endpoint cannot be used to edit a message.
- **A body written before rich text is converted as it is sealed**, so
  nothing in a vault is plain text. That replaced the earlier, separate
  conversion of a sender's own legacy bodies.

Until a row has moved it still reads the original way: every reader picks the
scheme from the row (`openMessage` in `messaging/client.ts`). A sidecar is only
ever sealed beside a sealed body; an embed looked up for a row still in the
original scheme is shown, and stored when the row moves. How to tell when the
original scheme can be deleted is in [docs/temporary-code.md](temporary-code.md).

## Tables

| Table                      | What it holds                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `message_threads`          | One exchange. Its sticker `icon`, plus two denormalised columns.                                |
| `messages`                 | One message. The sealed body, the vault and versions, an optional sealed metadata sidecar.      |
| `message_attachments`      | An encrypted file in the object store. Size, key, and when it self-destructs.                   |
| `message_reactions`        | One tapback per user per message. Encrypted.                                                    |
| `message_tags`             | A reusable name and color scoped to one partnership.                                            |
| `message_thread_tags`      | The many-to-many assignment between threads and tags.                                           |
| `thread_reads`             | Per-user read state for one thread.                                                             |
| `history_restore_requests` | A partner asked, as part of a partner-assisted sign-in, to share the partnership vault again.  |

Every foreign key cascades. Deleting a partnership takes its threads, messages,
attachments rows, reactions and read state with it — but **not** the objects in
the media store, which nothing cascades into. The disconnect action purges them
itself; see "Attachments and media" below.

### Three decisions worth the argument

**`icon` is plaintext, from a closed list of sixteen.** This is now mostly a
legacy implementation detail: the current UI no longer lets a sender choose one,
and older threads' stored icons are ignored unless the recipient has never
opened that thread, in which case the board shows the generic sealed envelope.
The column still exists because the board has to show _something_ before a key
is unlocked and because removing it would need a migration rather than a UI
change.

The closed list is the load-bearing part. A free-text plaintext column reachable
from the network would be a covert channel for arbitrary prose, so `isThreadIcon`
is checked in `server/messaging.ts` as well as in the endpoint's Zod schema —
AGENTS.md invariant 14.

**Tag names are sealed; their colours are not.** A tag is reusable metadata for
finding and filtering threads, scoped by `partnership_id` — the same name in two
partnerships is two independent tags. Its name is a sealed record (kind `tag`,
`src/lib/sealed-kinds/tags.ts`) in the partnership vault, sealed to the tag's
id, which the browser therefore chooses. The colour stays plaintext: one of a
few swatches, or a hex value, says nothing about anyone. Renaming or
recolouring a tag updates every thread that uses it, and the join table keeps
assignment separate from the definition so future tag filtering can query
threads without changing message rows.

Names are 1–80 characters and **unique within their partnership**, which the
server enforces without reading them through a **blind index**: `name_index` is
an HMAC of the normalised name (`normaliseTagName` — Unicode NFC and trimmed,
case kept, as when names were compared in the clear) under a key derived from
the vault for that purpose alone (`blindIndex` in `crypto/vault.ts`). A unique
index on `(partnership_id, name_index)` refuses a second tag of the same name
and the server learns only that two names are equal. Sorting by name happens in
the browser (`TagPicker.svelte`), the only place a name can be read. Renames are
last-write-wins, unlike task edits: a tag is a label, and the loser can simply
rename again.

Tags made before sealing keep their name in plaintext until a member's device
seals them in the background, with the tasks and rewards
([docs/temporary-code.md](temporary-code.md#tasks-and-rewards-in-plaintext)).
One whose name is already taken by a sealed tag is left as it is rather than
failing the rest.

**Reactions are encrypted.** The deliberate contrast with the icon, and what
makes both calls defensible: a reaction only ever renders inside a thread that
is already unlocked, so encrypting it costs nothing at all.

**Ciphertext columns are base64 `text`, not `blob`.** SvelteKit serialises load
data with devalue, which cannot carry a `Uint8Array`, so a blob column would
need base64 at the boundary regardless; and `text` round-trips identically
through libsql (dev and tests) and D1 (production), which a blob does not. The
33% overhead applies only to message bodies and their metadata sidecars —
attachments are raw bytes in the object store, where it would have mattered.
D1's per-value ceiling is 2,000,000 bytes and `MAX_CIPHERTEXT_BYTES` caps a
body at 64 KB.

**Message-derived metadata is encrypted beside the body, not stored in the clear.**
The `messages` row now has an optional `metadata_ciphertext` sidecar that holds
derived data such as cached embed previews. It is separate so the app can add
or backfill previews without rewriting the author-written body, and it is
encrypted because a cached title or thumbnail URL is still content derived from
plaintext the server must not keep in the clear.

## "Unread", defined once

For viewer `V` and thread `T`, with `R` = `V`'s `thread_reads` row if any:

```
unread(T, V)  ⟺  T.last_message_sender_id <> V
              AND (R is NULL OR T.last_message_at > R.last_read_message_at)
```

Two denormalised columns on the thread plus a left join. `messages` is never
read to draw a board, which is what keeps it one row per thread rather than one
per message — D1 bills on rows read.

The comparison is `>` and not `>=`, so a thread whose read mark equals its
newest message counts as read. Otherwise reopening a thread you had just read
would flicker it back to unread.

**The sender test is only sound because posting writes the sender's read row in
the same `db.batch()` as the message.** That is enforced in `sendMessage`, not
by the composer being unreachable from anywhere else, and it has its own test.

The same predicate appears twice — as SQL in `listBoard`/`listUnreadCounts`, and
as `isUnreadFor` in `src/lib/messaging.ts` for anything that needs it in
JavaScript. They have to agree, or `/home` and the board would disagree about
what is waiting for you.

## Read receipts

Inside a thread, the partner's avatar sits small under the newest of the
viewer's messages that the partner has seen. Like a messenger's seen-avatar, it
moves down the thread as they read, and there is only ever one.

"Seen" is the unread rule run from the other side, and uses the same column:

```
seen(M, by P)  ⟺  M.created_at <= P's thread_reads.last_read_message_at
```

so a message is seen exactly when it stopped being unread for the partner, and
the two can never disagree. No new table, no migration, and no per-message read
rows: `getThread` reads one extra row, the partner's `thread_reads`, picked as
"the read row that is not the viewer's" — sound because only the partnership's
two members can open the thread. `seenMessageId` in `src/lib/messaging.ts`
picks the message.

**Only ever under the viewer's own message.** The receipt goes under the newest
message the partner has read, and if that one is the partner's own there is
none: they have replied since, which says more than an avatar would. A thread
the partner has never opened has none either.

**What it says is "opened the thread since this arrived"**, not "looked at this
bubble". Opening a thread marks it read up to its newest message, the same as
it does for unread, so a long thread scrolled no further than its top still
counts as seen. That is the same promise the board's unread state makes.

**So nothing may run the thread page's load except opening the thread.**
`app.html` preloads every link's data on hover, which for a sticker meant a
pointer passing over it, or a finger scrolling past it, read the thread and
showed the partner a receipt. A sticker's link turns data preloading off
(`data-sveltekit-preload-data="off"`), and an e2e test hovers one to hold that.
A new link straight to a thread page needs the same.

**It moves live.** When opening a thread moves someone's read mark,
`markThreadOpened` says so, and the thread page's load publishes a `read`
event. The other member's thread page reloads on it, as it does for any event
about the thread it shows, and the board ignores it, since it shows no
receipts. A thread page left open on a thread marks each reply read as it
arrives, because the reply's `message` event reloads the page and the reload
is an open — so the sender watches the avatar move onto their reply.

**Only a read mark that moved publishes**, and that is load-bearing rather
than a saving. A thread page reloads on `read`, and reloading is opening: if
every open published, two people with the same thread open would answer each
other's reloads for ever. `markThreadOpened` writes only when the mark moves
forward (`setWhere`) and reports whether a row came back, with a server test
on both halves.

There is no setting to turn receipts off. The server has always known when each
side read each thread (see [What the server still knows](#what-the-server-still-knows));
this shows it to the partner, who is the one person it is about.

## Board order

Unread first, newest at the top. Then a divider. Then the read ones, by the day
and time that the thread's **current latest message** was first read.

One SQL statement for both halves: `desc(unread)`, then a `CASE` picking
`last_message_at` for the unread half and `last_fully_read_at` for the read
half, then `id` purely as a tiebreak for two rows inside the same millisecond.
The application code uses the same idea as `lastFullyReadAt`.

`lastFullyReadAt` does **not** mean "the last time the page was opened". It
advances only when an unread latest message becomes read. Reopening a thread
with no new messages therefore leaves the board alone, while replying in it
advances your own read position because sending the latest message is also
reading it.

**In `listBoard`, the `thread_reads` user predicate belongs in the join's `ON`,
not the `WHERE`.** In the `WHERE` it silently turns the left join into an inner
one, and every thread the viewer has never opened disappears from their own
board — which is exactly the threads the feature exists to surface. There is a
test for it.

## Board tiles

Threads now sit in a plain grid rather than a jittered sticker layout. The
preview and timestamp lines want stable alignment more than they want novelty,
so the board no longer offsets or tilts each tile.

The board and the thread are centred columns of `--page-width`, with the page
gutter (`--page-gutter`) as their inset, like every other page. Full width,
the two sides of a conversation ended up a whole desktop apart. The thread's
composer band still spans the pane: it is painted with a border image's
outset rather than a background, which as ink overflow never scrolls sideways.
The board's "Write something" button floats with a shadow and no band behind
it, and shows a pen: the paper plane is the composer's own Send.

A sticker the live feed has just brought in, or a notification's tap points
at, gets a ring that fades over four seconds and, motion allowed, two halo
pulses as it arrives. An unread sticker's dot, and the dot beside "N unread
threads" on the partner's page, pop in as they appear.

## The thread, in time

Times are grouped the way a messenger groups them (`src/lib/message-timeline.ts`).
Consecutive messages from one side within five minutes are a **run**, drawn
close together, and only the last of a run shows its time. A new calendar day,
in the viewer's own time zone, gets a label above its first message: "Today",
"Yesterday", the weekday for the rest of the past week, then a date. A run
never crosses midnight.

A grouped-away time is hidden from sight, not from a screen reader, which reads
messages one at a time and has no run to take it from. The day label sits
inside its message's `<li>`, so the list still has one item per message, which
is what the e2e suite counts.

**Motion marks what just happened, and none of it runs as a thread loads.**
Everything here is behind `prefers-reduced-motion: no-preference`:

- A message that arrives while the thread is open grows in from its own side,
  from the composer's corner for one sent here and from the left for the
  partner's. "Arrived" means not among the messages the thread opened with.
- A tapback pops in. Not while the thread's reactions are first being
  decrypted, so opening a thread does not pop every one of them.
- The reaction row fans out of the smiley, one emoji a beat after the last.
- The read receipt slides into place as it moves down the thread.
- The new-message dialog grows out of the button that opened it. Web Awesome's
  own show animation never runs for a dialog rendered already open, and a CSS
  animation on `::part(dialog)` would also replace its hide animation, so this
  one is a Web Animation on the panel.

The reaction control is a small smiley with a 44px hit area from a
pseudo-element, so it is easy to tap without pushing the time beside it.

## Attachments and media

Each file is encrypted under **its own ephemeral age identity**, and that
identity travels inside the encrypted message body — rather than the file being
encrypted under the vault directly.

That indirection is what lets a body move, between schemes or into a new
vault, without the file moving with it: re-sealing a body is a few kilobytes,
and never touches the megabytes in the object store.

`message_attachments` deliberately holds **no filename and no mime type**. Both
live inside the encrypted body, so the server learns only that a file exists and
how many bytes it is.

**Objects are written before the database rows.** A crash between the two leaves
an orphaned encrypted blob — unreadable, and sweepable by prefix — rather than a
row pointing at an object that does not exist, which would be a permanently
broken message in someone's history.

Keys are `<lifetime>/<partnershipId>/<messageId>/<attachmentId>`, where the
lifetime is `expiring` or `permanent` (`MEDIA_LIFETIMES` in
`src/lib/server/media/index.ts`). Disconnecting deletes a partnership's media
one prefix per lifetime, without enumerating rows. The key is still stored on
the row, so the layout can change without a migration.

**The lifetime prefix exists for the bucket's lifecycle rule**, which deletes
anything under `expiring/` older than 31 days (set up in the deploy steps of
[development.md](development.md); it cannot be declared in `wrangler.jsonc`). No self-destructing file
lives past 30 days, so anything the rule catches is either expired or an
**orphan**: an object from a send that died after writing its files but before
its rows. No row points at an orphan, so the sweep can never find it. That is
what the rule is for, and it also backs up the sweep: if the cron job breaks,
nothing under `expiring/` is stored for more than 31 days anyway. A lifecycle
rule can only match a prefix, which is why permanent media lives under a
different one.

An orphan is never visible to anyone. With no row, the download endpoint 404s.
Its key existed only inside a message body that was never stored, so it is
unreadable even to the server. It only costs storage, and the sender's retry
uploads fresh copies under new ids.

**Disconnecting purges the partnership's media.** The `disconnect` action in
`settings/partners/[id]` calls `purgePartnershipMedia` after the partnership row
is deleted: the delete is what proves membership, and the purge works by prefix,
so it does not need the rows. A failed purge is logged, not thrown, because
leaving a partnership must never wait on storage (docs/partners.md).

### Transcoding

Media is compressed **in the sender's browser, before it is encrypted**. The
server only ever sees ciphertext, so there is nowhere else this could happen.
It exists to save R2 storage and bandwidth, and the recipient's wait: a file
downloads in full before it shows, because age ciphertext is not seekable. It
also makes photos from any camera viewable in any browser. The tiers and the
pure rules are in `src/lib/media-quality.ts`. The encoders are in
`src/lib/media/`, which is browser-only in the same way `src/lib/crypto/` is.

| Tier     | Photo                              | Video                                                    |
| -------- | ---------------------------------- | -------------------------------------------------------- |
| Low      | AVIF, long edge ≤ 1600 px, q 50    | short edge ≤ 720 px; VP9 0.8 Mbps or H.264 1.2 Mbps      |
| High     | AVIF, long edge ≤ 3200 px, q 70    | short edge ≤ 1080 px; VP9 2.5 Mbps or H.264 4 Mbps       |
| Original | the file as picked, byte for byte  | the file as picked, byte for byte                        |

- **The composer.** Each picked file is a row: a bin to remove it, a
  thumbnail, its own self-destruct menu, and the quality button. The quality
  button says **SD**, **HD** or **Original** (the Low, High and Original tiers
  above) and a click cycles to the next. It is shown only to an account with
  `highQualityMedia`, where a new file starts on **HD**. Everyone else's files
  are always SD, with no button. A file that will go with sensitive metadata
  gets a warning after the button (see "Compressing strips metadata" below).
- **Compressing starts when a file is picked, not when Send is pressed.**
  `PendingAttachment` (`src/lib/messaging/pending-attachment.svelte.ts`) starts
  the job the moment the file is added and shows its progress over the
  thumbnail, so by the time the sender has written their message the file is
  usually ready. It keeps a job per quality, so cycling back to a tier that has
  finished is instant. It abandons an unfinished job the sender has cycled
  away from, or removed the file during, because an encode nobody will send
  only drains a phone's battery. Send waits for anything still going, and says
  "Compressing 1 file… (40%)" while it does.
- **One file at a time.** `transcodeFile` runs jobs through a single queue in
  the order they were picked, because a phone decoding two 4K videos at once
  runs out of memory. An abandoned job leaves the queue without holding up the
  next.
- **Photos → AVIF**, in a Web Worker (`image.worker.ts`) so the encode doesn't
  freeze the composer. The browser decodes the photo itself, with the EXIF
  orientation applied, and `createImageBitmap` does the resizing. The wasm
  build of libavif (`@jsquash/avif`) does the encoding, single-threaded,
  because the threaded build needs COOP/COEP headers this app does not send.
- **Video → VP9 + Opus in WebM**, through WebCodecs by way of mediabunny
  (`video.ts`). VP9 is roughly a third smaller than H.264 for the same picture
  and plays in every current browser, Safari included from iOS 17.4. A sender
  whose browser cannot encode VP9 gets **H.264 + AAC (or Opus) in MP4**
  instead. AV1 is not used, because Safari only decodes it on recent hardware.
  The stored `mimeType` carries the codecs (`video/webm; codecs="vp09…,opus"`),
  so a reader can ask its own browser whether it will play before downloading.
- **Native decode only.** A file the sender's browser cannot decode, such as a
  HEIC outside Safari, is sent as picked. So is a video with no available
  encoder, or one whose sound the conversion would have had to drop.
  `transcodeFile` never fails a send because it could not compress a file.
  The size checks that follow decide whether that file can go.
- **Left alone at every tier:** GIFs, since decoding keeps only the first frame
  and so loses the animation, and SVGs. A re-encode that came out no smaller
  than an original the web already displays is also discarded, and the
  original is sent instead — unless the original carries location or other
  sensitive metadata (below), when the larger re-encode goes, since someone who
  left a file on SD expects none of that to go with it. A HEIC stays converted
  even when the AVIF is larger, because converting it was about being
  viewable, not about size.
- **Compressing strips metadata; a file sent as picked keeps it, and says
  what.** Re-encoding carries no EXIF over, GPS included, and video tags are
  dropped on purpose. A file that goes as picked keeps all of it: Original, but
  also a GIF or a photo this browser could not decode, at any quality. For
  those, the composer shows a warning icon after the quality button with what
  the file would give away, specifically: "Shares where it was taken, the
  device (Apple iPhone 15 Pro) and the date (1 Sept 2026)". It shows nothing
  for a file whose metadata gives nothing away, so the warning is not noise.
  - The metadata is read once, when the file is picked
    (`src/lib/media/metadata.ts`): photos with exifr (EXIF, GPS and IPTC from
    JPEG, HEIC, AVIF, PNG and TIFF), videos with mediabunny's container tags.
    What counts and how it is worded is pure, in `src/lib/media-metadata.ts`.
  - Location is GPS or an IPTC place name in a photo. In a video it is Apple's
    `com.apple.quicktime.location.ISO6709`, the `©xyz` box most Android phones
    write, 3GPP's `loci`, or any tag naming a location or GPS. Then the device's
    make and model, when it was taken, and an owner or author name.
  - A file whose metadata cannot be read is treated as having none. That is
    the one gap: a format neither reader understands goes without a warning.
- **Sizes are checked on what will be sent.** The composer measures each file
  once its final form is known: at once for one that goes as picked, and when
  compressing finishes for the rest. So a 40 MB clip is not refused on its way
  to becoming 6 MB, and a clip that is still too big after compressing is
  refused as soon as that is known. `sendMessage` checks the finished files
  again (`checkComposed`).
- **The byte budget is the server's half.** The server cannot see quality, so
  it enforces bytes. `resolveMedia` holds an account without
  `highQualityMedia` to `MAX_LOW_QUALITY_TOTAL_BYTES` (10 MB) per message and
  refuses more as `needs-high-quality-media`, a 413. Holders keep the full
  25 MB. The same `listUserFeatures` read serves this and the `never` check, so
  a send with media costs one feature query and a text-only send costs none.
  Low's bitrates are sized so about a minute of video fits under 10 MB, which
  `media-quality.test.ts` asserts.
- **Nothing reaches the Worker.** Both encoders are imported with
  `await import()` behind a `browser` check in `PendingAttachment`, which is
  dead code in the server build. So neither the ~3.5 MB wasm nor mediabunny
  counts against the Workers bundle limit, and a page that never sends media
  never fetches them. The Worker's own work per send is unchanged: count
  bytes, write blobs.
- **A browser that cannot show the result says so.** `AttachmentPreview` asks
  `canDisplayAvif()` / `canPlayVideo()` (`src/lib/media/support.ts`) before
  downloading. If the answer is no, it shows "This photo can't be shown in this
  browser. Updating your browser should fix it." instead of fetching something
  it would only draw as a broken box. The element's own `error` event triggers
  the same warning for anything the type could not predict, such as a HEIC
  sent as picked. Board tiles show a plain placeholder instead.

### Self-destructing media

Every attachment self-destructs. The sender picks how long it lives **for each
file**: every attachment row in the composer has its own self-destruct menu
(a bomb and "2 weeks"), so one message can hold a photo that lasts an hour
beside one that lasts a month. It offers presets from **1 hour** to
**30 days**, and a newly picked file starts on **2 weeks** (or **Never** for an
account with `permanentMedia`), so a short choice made for one file never
sticks to the next. The countdown starts
**when the message is sent**, not when it is first opened, so how long a file is
stored is known the moment it arrives. When it runs out, only the media goes. The
message text stays, and each file becomes a bomb that says "Kaboom! This media
has self-destructed." (`SelfDestructedMedia.svelte`).

The constants and the parser are in `src/lib/messaging.ts`: `MEDIA_TTL_MIN_MS`,
`MEDIA_TTL_MAX_MS`, `MEDIA_TTL_DEFAULT_MS`, `MEDIA_TTL_PRESETS` and
`parseMediaTtl`.

- **The server works out the expiry.** The client posts one lifetime per file,
  `mediaTtlMs`, in the same order as the files and their `fileIds`; posting
  none at all means two weeks for every file, and any other count is a 400.
  The server accepts any whole number of milliseconds in range, not only the
  presets, so the presets can change without a server change. It stamps
  `expires_at = send time + lifetime` on each attachment, and files it under
  `expiring/` or `permanent/` accordingly. No expiry is computed from the
  client's clock.
- **Never-expiring media is a feature.** Posting `never` requires the
  `permanentMedia` feature (docs/features-and-admin.md). The composer shows a
  "Never" item only to accounts that hold it. `resolveMedia` in
  `server/messaging.ts` is what enforces it, **before any object is written**,
  and it refuses the whole send as `needs-permanent-media`, a 403, if any one
  file asks for it. Permanent
  media has `expires_at = null`. A send with no files ignores the lifetime
  entirely: a stale `never` is not a reason to refuse text.
- **Expiry is checked on every read.** `isAttachmentExpired` compares
  `expires_at`, and `purged_at`, with the server's clock. The download endpoint
  answers **410 Gone** once media has expired, even if its object is still in
  the store, and `getThread` marks each `AttachmentView` `expired` so the browser
  does not ask at all. The board has no attachment rows (its preview is only the
  first message's ciphertext), so its tiles find out from the 410.
  `fetchAttachment` turns a 410 into a `MediaExpiredError`, which is what makes
  the difference between the bomb and "Could not open this file". A thread left
  open also re-checks the countdown every 30 seconds, so a file expiring on
  screen turns into the bomb without a reload.
- **The countdown sits on the media itself.** A small pill in the image's
  bottom-left corner reads "[bomb] in 3 days"; on a video it goes in the
  top-left, because the native controls own the bottom edge. The bomb's
  accessible name is "Self-destructs", so a screen reader hears the whole
  sentence. The pill is a translucent near-black (`--media-badge-fill` in
  `theme.css`) behind a backdrop blur. That keeps it readable over a white
  photo without blacking out a dark one, and it ignores taps.
- **Unread tiles warn about unseen media.** A board tile says "Image
  self-destructs in 3 days", "2 videos self-destruct in…", or "Media…" for a
  mix. This covers files in the partner's messages since the viewer last read
  the thread, the same rule as unread, applied to each message. Permanent and
  already-expired files are left out. With several files, the tile shows the
  **soonest** expiry. The server knows the expiries but not the kinds, so
  `listBoard` also sends the bodies of the messages carrying those files, at
  most `UNSEEN_MEDIA_MESSAGE_LIMIT` per thread, soonest-expiring first.
  `ThreadSticker` decrypts them to name the kind. If the list was cut short, or
  a body would not decrypt, the tile says "Media" rather than guess. This works
  on sealed tiles too: the envelope still hides the content, but the warning
  is exactly what a sealed tile needs.
- **Browser caching ends with the media.** Self-destructing media is served
  with `private, max-age=<seconds left>`. Only permanent media keeps
  `immutable`.
- **A cron sweep deletes the objects.** Every 15 minutes (`triggers.crons` in
  wrangler.jsonc), `sweepExpiredMedia` in `src/lib/server/media/expiry.ts` finds
  rows where `purged_at IS NULL AND expires_at <= now`, using
  `message_attachments_expiry_idx`. It deletes their objects and sets
  `purged_at`. This is what stops the storage bill; it is not what makes media
  disappear, because the read check does that on time. The object is deleted
  before the row is marked, so a run that dies in between retries the same keys
  next time instead of leaving a row marked purged over an object nobody will
  delete. Batches are 1000 keys, which is R2's delete limit. Row updates are
  chunked under D1's 100 bound parameters per statement.
- **The row outlives the object.** It is a few bytes, and it is what lets the
  thread say the media self-destructed rather than that it is missing.
- **The decision is made when the message is sent.** Revoking `permanentMedia`
  does not start a countdown on media already sent as permanent, and granting it
  does not rescue media that is already counting down.

The cron handler, `src/lib/server/scheduled.ts`, is attached to the worker that
the adapter generates. It is added after the build by
`vite-plugins/scheduled-handler.ts`, for the same reason the Durable Object
export is (see "Exporting the class from a generated worker" below). The plugin
fails the build if the adapter's output ever stops having the `worker_default`
it assigns to, rather than shipping a worker that silently never sweeps.
`scheduled.ts` and everything it imports are therefore alias-free.

The self-hosted Docker build has no cron trigger either; it runs the same
`sweepExpiredMedia` every 15 minutes from SvelteKit's `init` hook, and deletes
anything under `expiring/` older than 31 days in the same pass, in place of the
lifecycle rule. See [self-hosting.md](self-hosting.md).

`vite dev` has no cron. Expiry still behaves correctly there, because it is
checked on read, but nothing deletes the files in `./local-media`. To exercise
the real sweep, run `npm run preview` and request
`/cdn-cgi/handler/scheduled` (wrangler serves that path when started with
`--test-scheduled`).

## Links and embeds

Message text is still decrypted entirely in the browser. The server stores only
ciphertext for the body and metadata sidecar and never decides what a message
says.

URL detection happens after decryption in `MessageBubble.svelte` through
`RichText.svelte`, which tokenises the text with `linkifyjs` and emits escaped
text nodes plus real anchors. There is no `{@html}` path for message text.

Supported URLs then pass through `UrlEmbed.svelte`:

- Redgifs, YouTube, and direct image URLs become native embeds.
- A curated set of other hosts use `noembed.com` for metadata and, when its
  response contains a plain iframe, a sandboxed player.
- Unknown or dead providers stay plain links.

For new messages, and for older ones whose embeds the viewer explicitly
reveals, the browser may also ask the first-party `/api/embed-metadata`
endpoint to resolve preview data for supported URLs it already extracted from
the decrypted text. The response is encrypted into
`messages.metadata_ciphertext`, so later board renders can use the cached
preview without another metadata fetch. Inline message embeds use that same
encrypted cache too: when a message already has cached embed details,
`UrlEmbed.svelte` renders from them instead of starting a fresh metadata
request. Older rows are backfilled per URL the first time an embed
without a cached entry actually loads, not for the whole thread on open, and a
viewer can manually refresh one cached URL entry from the embed itself if they
want fresh details.

A thread renders the embeds its messages carry, with nothing in front of them —
there is no per-account preference and no consent dialog. A link the sender
left without an embed gets a `Show` button instead, which inserts a card above
that paragraph for this reader only; it is never written back to the message,
so a reload brings the button back. Embeds that need a provider lookup draw
nothing until it answers, start the request when they are in or near the
scrollport, and share a page-wide queue of three lookups at a time — all
request-volume decisions, not consent ones. See [embeds.md](embeds.md).

Reddit is still the special case for live embeds. The browser cannot call
reddit's oEmbed endpoint directly because it is CORS-blocked, and `noembed.com`
does not support reddit, so a reddit embed sends only the reddit URL to
`/api/oembed`, which resolves share links to their canonical post, fetches
oEmbed server-side, and tries to extract the post's outbound URL from the post
RSS feed.

That outbound URL is what lets a reddit link post render the actual linked
media — especially a Redgifs player — instead of reddit's own NSFW preview
frame, which often serves a dead image. If there is no embeddable outbound URL,
the client falls back to `embed.reddit.com` for the reddit post itself.

## Partner-assisted history restore

Losing every way into an account — the password and every passkey — loses the
identity for good: the wraps are the only copies and those were the only keys
to them. But everything a partnership shares is sealed in its vault, and the
_other_ partner holds the vault key, so they can share it again. The server
cannot help, and does not need to.

This is the history half of a **partner-assisted sign-in**, which is how
someone in that position gets back into their account at all; the sign-in half
— starting from the login page, the code, completing — is in
[docs/account-recovery.md](account-recovery.md). The flow, and the one
security-critical part:

1. The person who lost everything makes a new identity from `/login/recover`,
   and a restore request is opened in each of their partnerships carrying a
   **snapshot** of its recipient.
2. Each partner is shown the request — on every screen, not only the board —
   and must compare the recovery code **out of band** before confirming.
3. On confirm, the partner's device first moves any rows still in the original
   scheme into the vault ([Moving into the vault](#moving-into-the-vault)) —
   they are encrypted to the requester's lost key, so the vault is the only way
   they will be read again. Then it wraps the vault key for the snapshotted
   recipient and posts it (`POST .../restore`, `restoreVaultAccess`). That one
   wrap restores the whole history, closes the request, and approves the
   sign-in if no other partner got there first.
4. The partner's device remembers the new key as vouched for, because comparing
   the recovery code is the same assurance as comparing the safety number. It
   is not pinned yet — the server serves the old key until the sign-in
   completes, and a pin would make that look like a change — but the moment the
   new key is served it is accepted as verified, with no "key changed" warning
   (`recordVouch` in `crypto/pins.ts`).

**The new wrap sits beside the requester's old one** (`vault_wraps` holds one
per member per recipient). Their current wrap has to keep working until the
sign-in actually completes — it may be declined or expire — and completing it
deletes the wraps for the old key.

**Another partner who does not confirm in time** still restores the
requester's access to their partnership, just later: as soon as their device
trusts the requester's new key, its ordinary vault pass wraps the vault for it
(`ensureVaults` in `crypto/ensure-vaults.ts`). Until then the requester's board
with them says their older messages are on their way.

Declining is a first-class answer, not tidiness: the out-of-band comparison is
the load-bearing step, and someone who finds the code does _not_ match needs a
way to say so that leaves the requester informed rather than waiting for ever.

A restore request lives only as long as its sign-in: one whose sign-in expired,
was superseded by a newer request or was declined disappears from the board
and is refused, so nobody hands a vault to a key that will never be used.

Step 2 is load-bearing. Without the out-of-band check, a malicious server could
inject a request carrying its own recipient and have the partner wrap the vault
for it. The snapshot matters for the same reason: the wrap is made for exactly
the recipient that was compared, not whatever `user_keys` says at the time.

Two honest caveats:

- **A partner can write anything into what you share.** The server cannot check
  that a re-sealed row says what the original said — it cannot read either. A
  partner holds the vault key and could always write whatever they liked, so
  this is no new trust boundary, but it is worth knowing.
- **If both partners lose every way in, the history is gone.** So is the
  history of anyone with no partner. There is no other copy.

## Drafts

Unsent words are never lost (see
[`docs/user-commitments-and-product-goals.md`](user-commitments-and-product-goals.md)).
Every composer keeps a draft in `localStorage` from the first keystroke until
the message is sent or its text deleted. The code is `src/lib/messaging/drafts.ts`.

- **One draft per composer.** Each thread's reply box has its own
  (`thread:<threadId>`), and so does each partnership's "Write something"
  dialog (`new-thread:<partnershipId>`). Writing in one never touches another.
  Daydreams' composer keeps its drafts the same way, under
  `daydream:<daydreamId>` ([docs/daydreams.md](daydreams.md)).
- **Encrypted to the writer alone.** A draft is an age file encrypted to the
  account's own recipient (`DraftPayload` in `src/lib/crypto/messages.ts`).
  Writing it needs only the public key; reading it needs the identity, which
  every composer has because none renders until the key is on the device. The
  draft therefore survives signing out, as ciphertext. The storage key
  includes the recipient, so two accounts in one browser never read or
  overwrite each other's drafts — and a draft sealed to a key that a
  partner-assisted sign-in has since replaced is simply never looked up.
- **The new-message dialog stores its tags with its text**, only while there
  is text. A draft whose text is emptied is removed, tags and all, so an
  emptied dialog that is closed and reopened comes back with neither. Tags on
  their own are never stored. On restore, tag ids that no longer exist are
  dropped, because sending one would fail as `no-such-tag`. A tag created
  inside the dialog invalidates the board, so it is in the board's tag list the
  next time the dialog opens.
- **Cleared only on a confirmed send.** A failed send keeps the draft.
- **Nothing renders until the draft is read.** The composer (and, in the
  dialog, the tag picker) mounts only once the stored draft has been
  decrypted. If an empty editor showed first, the restore would overwrite
  whatever had been typed in the meantime.
- **The thread composer is keyed on a derived thread id**, never on the
  `thread` prop. `invalidate()` reassigns that prop whenever a reply arrives,
  and a dependency on it would remount the composer under someone
  mid-sentence.
- **Writes are serialised and coalesced.** Encryption is async, so writes
  queue behind one another and a queued write that a newer one has overtaken
  is skipped. A removal cancels any write still in flight, so deleted text
  cannot reappear when its encryption finishes late.

Not kept: attachments (the files are still on the device, but have to be
picked again after a reload), and drafts that can no longer be decrypted
after a key change. Those are left in storage, not deleted, and the next save
replaces them.

## What the server still knows

Encrypting the content does not hide the shape of the conversation. Stated
plainly, because the framing of this feature invites the assumption that it does:

- That a partnership exchanges messages at all, and how many threads.
- Exactly when every thread started and every message was sent.
- Which side sent each message.
- The colors of the tags used by threads, how many there are, and which threads
  carry each — but not their names.
- How many attachments each message has, and **each one's exact byte size** — so
  approximate media sizes. After transcoding that size says more about the
  quality tier than about the original, since an SD photo is always about the
  same size whatever camera took it.
- How long the sender chose for each message's media to last, and whether it was
  sent as permanent. The server has to know this in order to delete the media.
- When each side opened each thread, and when they last read it. The partner
  sees the second too, as the read receipt.
- Which of the sixteen stored icons a thread has, even though the current UI no
  longer surfaces that choice directly.

What it does not know: any message text, any filename, any file type, any
reaction, any tag name, and anything that would let it read or forge any of them — a sealed
record can only be made by someone holding the vault key.

## Screens and endpoints

| Route                               | What                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------- |
| `/partner/[id]/messages`            | The board. The unopened-envelope state SSRs; previews decrypt after unlock. |
| `/partner/[id]/messages?thread=…`   | Where a notification tap lands: a never-opened thread highlighted, else on. |
| `/partner/[id]/messages/new`        | The board with its new-message dialog open, so a reload keeps it open.      |
| `/partner/[id]/messages/[threadId]` | One thread. Its load also records the open, and publishes `read` if it moved. |
| `/home`                             | A link per partner with something waiting.                                  |
| `api/partnerships/[id]/threads`     | `POST` multipart: a thread and its first message.                           |
| `.../threads/[threadId]/messages`   | `POST` multipart: a reply.                                                  |
| `api/partnerships/[id]/tags`        | `GET` / `POST`: list or create partnership-scoped tags.                     |
| `.../tags/[tagId]`                  | `PATCH`: rename or recolor a tag.                                           |
| `.../threads/[threadId]/tags`       | `PUT`: replace the thread's tag assignments.                                |
| `.../threads/[threadId]/unread`     | `GET`: whether the thread is unread for the viewer. For the in-app toast.   |
| `.../messages/[messageId]/reaction` | `PUT` / `DELETE`.                                                           |
| `.../attachments/[attachmentId]`    | `GET`, streams ciphertext. `410` once the media has self-destructed.        |
| `.../ack-warning`                   | `POST`, the one-time warning acknowledgement.                               |
| `.../restore`                       | `POST` the vault wrapped for the requester's new key, `DELETE` to decline.  |
| `.../sealed-migration`              | `GET` rows still in the original scheme, `POST` them sealed into the vault. |
| `.../messages/[messageId]/metadata` | `PUT` a sealed sidecar, beside a sealed body only.                          |
| `api/realtime/events`               | `GET`, the SSE feed, on the partnership's room and the `messages` topic. See [realtime.md](realtime.md). |
| `api/realtime/presence`             | `POST`, a stream's lease renewal or goodbye. See [realtime.md](realtime.md#a-stream-is-a-lease). |

**`src/routes/api/` sits outside both route groups deliberately.** A group guard
is a layout `+layout.server.ts`, and layout loads never run for a `+server.ts`
at all — so putting these under `(auth-required)` would advertise protection
that does not exist, which is worse than having none because the next reader
would trust it. Every handler carries its own `locals.user` check and its own
membership check.

**Neither page can SSR its content.** Bodies arrive as ciphertext and are
decrypted after hydration, so every bubble renders a placeholder first. The
ciphertext is never rendered as text, even for a frame — there is a component
test asserting exactly that, because it is the worst bug this feature could
have.

**A thread opens on its newest message, with its oldest unread at the top**,
and follows a new one only for a reader already at the end; one scrolled up to
read is left there. That is `followEnd` in `src/lib/scroll-parent.ts`, shared
with daydreams. Coming back to several messages, the thread is scrolled to the
end but no further than puts the first of them at the top of the screen
(`followEnd`'s `holdAt`), so nothing unread is carried off the top unread. The
oldest unread is the partner's first message after the viewer's read mark
(`firstUnreadMessageId` in `src/lib/messaging.ts`), and the mark is the one
from *before* this open: `openThread` reads it in the same call that moves it,
because read beside the write the two race, and a mark already moved says
nothing was unread. Only the first load's answer counts — every later one, on
a live event, has just moved the mark — and the hold lets go as soon as a
newer message arrives, which is followed as usual.

**Following glides once the thread is open.** A new message slides in with a
smooth scroll; the opening, anything further than a screen, and a reader who
asks for reduced motion jump instead (`followEnd` says why).

**The new-message dialog says who it is to**, in a "To …" line over the tag
picker, since its header is hidden to keep the panel small. On a phone it is a
sheet from the bottom of the visual viewport the shell tracks
(`--viewport-top`, `--viewport-height`), so the keyboard does not cover it.
Adding a tag is one button everywhere, a plain "Add tag" with a tag icon,
in the dialog and at the top of a thread alike.

**The new-message dialog is in the URL.** "Write something" shallow-routes to
`/partner/[id]/messages/new` (`pushState`), so the board stays mounted under
the dialog and Back closes it. Loaded in full, `/new` is a route of its own
that renders the same board component with the same load (`board.server.ts`),
which opens the dialog because of the route; closed there, it `replaceState`s
back to the board's URL. Whether it is open is the board's own state, synced
from `popstate`, not `page.state`: an `invalidate()` resets `page.state`, and
making a tag in the dialog invalidates the board, which closed it.
Sending steps back off `/new` before going to the new thread, so Back from the
thread goes to the board rather than to an empty dialog — and not by
`goto(…, { replaceState: true })` over `/new`, which left the thread sharing
the shallow entry's navigation index, so Back from it was taken as shallow and
went nowhere.

**This feature does not use superforms**, and that is the marker rather than an
omission: superforms exists to bind a `SuperValidated` to a `<form>` and
re-render errors from an action, and there is no action here — the body has to
be built in the browser because only the browser can encrypt it. Zod still
validates every field, in `src/lib/schemas/messageForm.ts`, imported by both the
endpoint and the client so a 25 MB refusal costs nothing.

### Attachment ids come from the client

The decryption keys live _inside_ the encrypted body, so the ids have to exist
before it is sealed. Letting the server assign them would mean either a second
round trip to re-seal the body or an unencrypted manifest. They travel alongside
the files as `fileIds`, in the same order, and the endpoint validates them as
UUIDs. Safe because they are only ever inserted: a duplicate collides with the
primary key, so a client-chosen id cannot reach or overwrite an existing row.

## Realtime

Both screens watch the partnership's realtime room on the **`messages`
topic** and, on anything arriving, call `invalidate()` on the `depends()` key
the load already declares. So a live update takes exactly the same authorised
path as a navigation. The room itself (one per partnership, shared with the
notebook, with streams that are leases closed while the page is hidden) is
described in [realtime.md](realtime.md); this section is what messaging adds.

**Message frames carry metadata only, and that is a rule rather than a
convention.** A frame is `{ kind, threadId }`, never a sender and never a
byte of content. The room relays any string it is given (notebook frames are
sealed ciphertext), so the rule lives with messaging: every publisher goes
through `publishMessagingEvent` (`server/realtime/messaging.ts`), whose
`MessagingEvent` type has nowhere to put a body, and which rebuilds the frame
field by field so nothing else can ride along. A future event wanting to carry
a body is a reason to stop and reconsider, not a small extension.

**Who is listening** is the one thing a room knows about its streams: the
viewer's user id, from the session, and their push device id, if the browser
has one. `publishMessagingEvent` returns the streams watching the `messages`
topic only, so a push notification is not also sent to a device already
showing the board, while a device that merely has a notebook page of the same
partnership open still gets one. See
[notifications.md](notifications.md#not-telling-a-device-what-it-is-showing).

### Notices while watching

A device with the board or a thread open is sent no push notification (see
[notifications.md](notifications.md#not-telling-a-device-what-it-is-showing)),
so the page tells the viewer itself:

- **On the board, a partner's message rings its sticker.** It is the same ring
  a notification's tap gives, fading after about four seconds. After each live
  reload the board compares itself before and after (`newlyArrived` in
  `src/lib/messaging.ts`). A thread counts when it is unread afterwards and
  either was not, or has a newer message than before. If several arrived
  together, the newest rings.
- **In a thread, a new message in another thread is a toast**
  (`MessageToasts.svelte`, a `wa-toast`) reading "New message from Sam". Its
  link is the URL a notification's tap opens, `?thread=` on the board, so the
  board's load makes the same decision: straight to a thread opened before, or
  the board with a never-opened one ringed. One toast shows at a time and the
  newest replaces the last, since two would be same-named links to different
  places. A message in the thread already open is a live update, not a toast.
  A reaction is not a toast either.

**Who wrote it is decided by `unread`, because events cannot say.** An event
names a kind and a thread and never a sender. "Unread for me" already means the
newest message is not mine, so a message the viewer sent from another device
never rings or toasts. The board has the whole board either side of its reload
to compare. A thread page has only its own thread, so for an event about
another thread it asks `GET .../threads/[threadId]/unread`.

**`thread` and `message` events mean a message was written, and nothing else
uses them.** A tag change publishes `tags`, and a read mark moving publishes
`read` (see [Read receipts](#read-receipts)). Before, tags borrowed `thread`,
and a thread page would have asked about every retag. A new event kind that is
not a written message must not reuse either of those two.

## Not built yet

The honest boundary:

- **Pins are per-device.** A new phone has seen no keys, so it trusts what it is
  first told — which is what "on first use" means, but it does mean a device
  change is indistinguishable from a substitution until the number is compared
  again. Surviving that needs `user_keys.sealed_pins` (the pin list encrypted to
  your own key), which is a noted follow-up. The UI shows when a key was first
  seen so "a moment ago" is not mistaken for "two years ago".
- **The Durable Object is covered end to end only on request.** `npm test` and
  CI run the Playwright suite against `vite dev` and the Docker image, whose
  live updates go through the in-process notifier. `npm run test:e2e:worker`
  runs the same suite on the built worker, where they go through the real
  `RealtimeRoom` (see [development.md](development.md#the-workers-target)); the
  class is also covered by direct unit tests (`durable-object.test.ts`).
- **Video is transcoded in unit tests, not end to end.** The browser project
  re-encodes a generated clip through the real VP9 path, but the Playwright
  suite only sends photos. A long phone video on a real phone, where the
  encode takes the longest, has been checked by hand at most.
- **Orphaned permanent media stays until disconnect.** The lifecycle rule only
  covers `expiring/`, so an orphan under `permanent/` (a failed send by an
  account with `permanentMedia`) is removed only when the partnership is
  disconnected. It is unreachable and unreadable, so the cost is storage alone:
  at most 25 MB per failed send.

## The body is a rich-text document

A message body is a Lexical `editorState.toJSON()` document, not prose — see
[docs/rich-text.md](rich-text.md). Three consequences specific to messaging:

- **`MAX_BODY_CHARS` counts visible text**, via `documentToPlainText`, not the
  stored string. The document is several times the size of the prose it
  carries, so counting it would cut people off after a few hundred typed
  characters. A body over the limit is refused rather than truncated: a
  document cannot be cut at a character offset without corrupting it.
- **Ciphertext is bigger than it used to be.** `MAX_CIPHERTEXT_BYTES` (64 KB)
  has less headroom than when bodies were plain text.
- **`messages.body_format` is a second plaintext column**, `'plain' | 'lexical'`,
  and a closed list for the same reason `icon` is. It exists only so the server
  can tell a pre-rich-text body from a converted one, which it otherwise cannot
  do at all. Moving a row into the vault converts its body and sets it to
  `'lexical'`, so once nothing is left in the original scheme nothing is
  `'plain'` either. It is temporary — see
  [docs/temporary-code.md](temporary-code.md).
