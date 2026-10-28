# Notebook

Somewhere to write things down. A notebook holds **journal entries** (dated),
**notes** (free pages) and **scenes** (plans for play, with ideas and prompts
beside them: [scenes.md](scenes.md)), each a rich-text document with a title. Everyone
has their own notebook, and every partnership has a shared one; all of them are
at `/notebook`, which shows whichever the current context is — your own, one
partnership's, or every one at once ([contexts.md](contexts.md)). An entry is
edited live by everyone who has it
open, the way a shared online document is: each writer's edits merge into the
others' as they type, each sees where the others' carets are, and a history of
versions is kept automatically.

It is the first part of the roadmap's Notebook branch (`journal-notes`);
fantasies, a bucket list and the rest of that branch are not built yet.

## Encryption at rest

**Every byte of an entry is end-to-end encrypted before it leaves the
browser, and stays encrypted wherever it is stored.** A solo entry is sealed
to its owner's self vault and a shared entry to the partnership vault
([encryption.md](encryption.md#vaults)), with the same sealed records as
everything else (`sealRecord`, AES-256-GCM, associated data binding the kind,
the record's id, the vault and the version). Writing to a partnership vault
needs the trust check's grant (`writeGrantFor`), as every write does.

| Where | What | Sealed as |
| --- | --- | --- |
| D1 `notebook_entries.ciphertext` | The title and list excerpt (the header) | `notebook-entry` |
| D1 `notebook_updates.ciphertext` | Every batch of edits, title included | `notebook-update` |
| The media store (R2, or `MEDIA_DIR`) | Each version: the whole document | `notebook-snapshot` |
| Relayed by the room, never stored | Each writer's caret and presence | `notebook-awareness` |
| `localStorage` on the device | Edits not yet confirmed by the server | age-encrypted to the user's own key |

None of the kinds is compressed (`sz1.`): that is allowed only for content the
server has already seen. There is no plaintext column for content: an entry
is sealed from its first byte.

**What the server still knows**, all of it metadata it needs to route,
authorise and order: an entry's id and scope; whether it is a journal entry or
a note, and a journal entry's date; who created it and its access setting; when
it was last edited and by whom; who posted each batch of edits and when, and so
who contributed to each version; and every ciphertext's size. Never a title, a
word of the text, a link or an embed.

`e2e/notebook.spec.ts` types a sentinel phrase into an entry and checks that
neither it nor the title appears in any of the entry's stored rows.

## The document

An entry's content is a **Yjs document**, edited through Lexical with
`@lexical/yjs`. It has two shared types: `root`, the body, which the binding
keeps in step with the editor, and `title`, plain text the title field edits.
A scene has a third, `prompts`, what has become of each of its prompts
([scenes.md](scenes.md#where-the-prompts-state-lives)); the other kinds never
touch it.
Yjs merges concurrent edits deterministically, in any order, and ignores an
update it already has, which is what everything below leans on: edits can be
relayed, refetched and resent freely.

The editor is the app's own (`RichTextEditor.svelte`, given a `collaborate`
hook by `notebook/CollaborativeEditor.svelte`), with the document feature set:
formatting, links, lists and embeds, as in task descriptions. The stored
document inside Yjs is the *editor's* shape, where an embed is a block at the
root; `toStoredDocument` turns it into the stored shape for anything that
renders it outside the editor (a version preview). See
[rich-text.md](rich-text.md#collaborative-editing).

`@lexical/yjs` ships only React's wiring; `src/lib/notebook/collab.ts` is the
same wiring as plain functions with teardowns. Two rules from it matter:

- **Bind before the document has content.** The binding learns a document only
  from changes it sees happen, so the session holds what it fetched until the
  editor has bound itself (`attach`).
- **Undo is the document's.** `createRichTextEditor` is built with
  `history: false` and Yjs's undo manager takes Ctrl+Z, so undo takes back only
  your own edits, never your partner's.

### Bootstrapping

An editor bound to an empty document has to give it a root paragraph, and two
devices opening a brand-new entry at once would each add one. So the device
that creates an entry writes that first edit (`firstEdit()`, in a headless
editor) and posts it with the entry itself, in one batch. Nobody ever opens a
document without one.

## Live editing

The session (`notebook/session.svelte.ts`) is the page's half:

1. **Opening** fetches the latest version and every edit after it
   (`GET .../updates?after=0&snapshot=1`), opens each with the vault, and
   applies them once the editor has bound itself.
2. **Writing**: each local change is queued, and every 400 ms the queue
   becomes one batch, which goes into the outbox, is sealed and is posted
   (`POST .../updates`). The server stores it (assigning the next `seq`) and
   publishes it, still sealed, on the entry's topic.
3. **Reading**: every page with the entry open opens what the room relays and
   applies it. Each frame carries its sender's random `origin`, so a page
   skips its own.
4. **Catching up**: whenever frames may have been missed (the page becomes
   visible, a stream reconnects, the polling fallback ticks) the page fetches
   every edit after the last one it fetched (`?after=<seq>`). It listens before
   its first fetch, so nothing can fall between the two.

Edits travel **on the realtime stream as ciphertext**, unlike messages, whose
frames are metadata only: co-editing cannot wait for a refetch per keystroke.
The room cannot read them any more than the server can; see
[realtime.md](realtime.md) for the room, its topics and its leases.

**Presence and carets** are a `y-protocols` awareness update, sealed as
`notebook-awareness`, posted with the next batch (or alone), relayed and never
stored. A page that hears from someone new sends its own again, so a writer who
opens an entry late sees everyone at once rather than at their next heartbeat.
**No name travels with a caret**: the payload carries a user id inside
`awarenessData`, and each page labels carets itself (`relabelledCursors`) with
`partnerName()`, because a partnership's names are sealed and which one is
"theirs" flips with who is looking (AGENTS.md invariant 12). A reader's caret
is relayed too, so a partner who may only read still shows as there.

**The title** lives in the document, so it merges like the body. Lists need it
without loading every document, so the sealed **header** (`{ title, excerpt }`)
is a cache: whichever page is editing rewrites it five seconds after a change,
on leaving the page (with `keepalive`), and on opening an entry whose header is
stale. Its revision is compare-and-swap; the loser is told the current revision
and writes once more, since it is the one still editing. A scene's excerpt
leaves out anything hidden from either partner, since both lists show the same
header ([scenes.md](scenes.md#surprises)).

**Cost.** Every batch is one Worker request and one Durable Object request; at
about two and a half a second while typing, an hour of steady typing is about
nine thousand. Cursors ride on batches where they can. Streams close while the
page is hidden, as for messaging. `last_edited_at` is written at most once a
minute per entry, because D1 bills rows written.

## Never losing what was typed

A message composer keeps a draft; an entry has no draft, because everything
typed is already on its way. What it keeps instead is the **outbox**
(`notebook/outbox.ts`): every batch the server has not confirmed, stored like a
draft (age-encrypted to the user's own key, in `localStorage`). A batch leaves
it only once its POST succeeds. On opening the entry, anything still in it is
applied and sent again; Yjs and the batch's id make a resend harmless.

The save state says which of these is happening: "Saved", "Saving…", or
"Offline: changes kept on this device". A failed send retries with backoff
(1 second, doubling to 30), and at once when the browser says it is back
online, so an entry written offline does not sit out the backoff once the
connection returns. A batch reaches the outbox up to 400ms after the
keystrokes in it, encrypted on the way, so a page closed in that moment can
lose them: no synchronous save is possible without storing them in the clear.
A single change too large to seal (one paste over the batch cap) stays in the
outbox and the page says to undo it and add it in parts.

## Versions

A **version** is the whole document at one moment (`Y.encodeStateAsUpdate`),
sealed as `notebook-snapshot` and stored in the media store, not D1, because a
long entry outgrows a comfortable row. Its row says which `seq` it covers
(`up_to_seq`), who contributed since the last one, and whether it was cut by a
restore.

They are cut automatically, like a document editor's history: one per sitting,
by a page that wrote something, once the entry has been idle for two minutes
(`VERSION_IDLE_MS`), every thirty minutes of a longer sitting
(`VERSION_MAX_INTERVAL_MS`), and when the page is hidden. Before cutting, the
page catches up, so the snapshot holds every stored edit up to the `seq` it
claims. Two pages cutting the same version at once is ordinary: the second is
refused as `stale` and its upload deleted.

**Compaction.** Once a version is stored, edits up to the **previous**
version's `seq` are deleted (`compactionBound`). Not the newest version's: the
server cannot check a snapshot it cannot read, so the previous snapshot and
every edit after it are always kept, and a bad newest snapshot can still be
rebuilt around.

The history drawer lists versions with who wrote in each; a preview opens the
snapshot in a throwaway editor (`readDocument`) and renders it read-only.
**Restoring** replaces the body and title in the live editor as one ordinary
edit, so it reaches everyone live and can be undone, and then cuts a version of
its own, marked as a restore.

The e2e suite shortens the timings by setting `bound-up:notebook-timings` in
`localStorage` before the page loads; nothing else reads it.

## Access

The rules are pure, in `src/lib/notebook.ts`, and the server re-reads them from
the stored rows on every load, action and endpoint (invariant 14).

- **A solo entry** is its owner's alone.
- **A shared entry** can be edited by both partners by default. A member who
  manages the partnership's space (`space_members.can_manage`, what "holds
  control" means; [partners.md](partners.md#what-control-gates)) can make it
  **read-only** or **hidden** for the others: `partner_access` and
  `access_set_by_user_id`. The restriction binds every member but the one who
  set it. The rules take the space's members (`SpaceForAccess`), never the
  partnership's `control` column, which is only the invite's offer.
- **When more than one member manages (control shared), the say over an entry
  is its creator's** (`holdsAccessAuthority`, from `created_by_user_id`).
  Shared control used to let either member restrict any entry, and the other
  could not undo it, so each could hide the other's writing from them. An
  entry whose creator is no longer in the space (their account deleted) falls
  back to every member who manages.
- A restriction binds whoever did not set it for as long as its setter still
  has the say. Once the say moves away from them (control is handed over, or
  shared control makes the creator the one who decides), the member who has it
  now may lift it (`canSetAccess`), so nobody is locked out of their own
  notebook, and a restriction a non-creator set under shared control before
  this rule is not stuck. A hidden entry is listed for them, without its
  header, with a button to show it again.
- **Hidden is withheld by the server, not by cryptography.** The other partner
  holds the partnership vault's key and could open the entry if the server
  handed it over; it does not: lists, every endpoint and the realtime topic
  treat a hidden entry exactly like one that does not exist. Partners are
  trusted, and this is a privacy courtesy between them, not a guarantee
  against each other.
- Changing access evicts every other member's streams on the entry's topic when
  it becomes hidden, and tells every open page to reload what it may do.
- A reader's edits are refused (403) whatever the page allowed; the editor is
  made non-editable only as display. Deleting needs edit access, and takes the
  entry's edits, versions and snapshots with it.

## Moving an entry

An entry can be moved to another of your spaces: a note you now want to share
into a partnership's space, or a shared one back into your own. **Move**, beside
History, opens a dialog (`MoveEntryDialog`) that says where it is now ("This
note is currently shared with Bo", or just for you), lists
your other spaces, each with its colour (the only one already chosen, when
there is only one), and says what the move does: who stops
seeing it, who starts (with all of its history), and, for a scene leaving a
shared space, that the partner's surprises in it are taken out. The space chip
in the page's corner opens the same dialog.

**Who may.** The owner of a solo entry; for a shared one, whoever may change who
else sees it (`canMoveEntry`, which is `canSetAccess`), since taking it out of
the space takes it from everyone else, hiding it with no way back. They need
edit access too, and must be a member of the target and able to write into its
vault (the trust check, `writableVault`). The server re-checks all of it from
the rows (`mayMoveEntry`, and `requireSpaceMember` on the posted `spaceId`): a
move names its space, like any write, and never reads the context.

**It is a re-seal, not an update.** Every record is bound to its vault's id
([encryption.md](encryption.md#sealed-records)), so the device that moves it
(`NotebookSession.moveTo`) does the work:

1. It sends what is waiting and catches up, so it holds everything stored.
2. It opens every version with the entry's vault, re-seals it under the
   target's with the **same id**, and stages it, one request each
   (`PUT .../move/versions/[versionId]`, `stageMovedVersion`), under the
   prefix the entry will have afterwards. One request per version keeps a long
   history from making one request too large.
3. When there are edits after the newest version, it cuts a **head version**
   over all of them and stages that too. No stored edit is re-sealed: the head
   snapshot carries them, and the server deletes every edit it covers.
4. It commits (`POST .../move`, `moveEntry`) with the header re-sealed for the
   target, naming every version it staged and the `seq` it is up to.

The commit is one `db.batch()`, every statement conditioned on the entry row's
own move having happened, which is conditioned on its revision, its old vault
and there being no edit after the `seq` the device named. The row takes the
target's `owner_id` / `partnership_id`, `space_id` and `vault_id`, and its
access goes back to `edit`, since a restriction is between the members of the
space it was set in. Then the old prefix is deleted, the old room is told
`{ type: 'moved' }`, members of the old space not in the new one are evicted
from the entry's topic, and both spaces' lists refresh.

**Racing it.** Something stored while the device was staging (another device's
edit, a version cut) makes the commit `stale` (409): its staged objects are
deleted and the device starts again from what is stored, up to three times. An
edit arriving after the commit is refused, because `appendUpdate` inserts with
an `INSERT … SELECT` conditioned on the entry still having the vault the edit
was sealed under, and answered with a 409, which the page takes as "reload":
its batch is still in the outbox, and goes again sealed for where the entry is
now. Without that condition, an edit read and written either side of the
commit would land under the old vault, newer than every snapshot, and no
device could open the entry again.

**Open pages follow.** On `moved`, a page asks for the history through the
ordinary path: a 404 (no longer theirs) leaves for the list, anything else
reloads the entry in its new space. The entry page draws the session only once
it is the one for the vault as loaded (`NotebookEntryPage`'s `session`), so for
the moment between the load and the rebuilt session it shows that it is
opening rather than the old session with the new entry's buttons.

**Staged and never committed.** A move abandoned between staging and commit
leaves its objects under the target's prefix for that entry. A later move to
the same space overwrites them, and a partnership's go with
`purgePartnershipMedia`; there is no sweep for the rest.

## Data model

- `notebook_entries`: one row per entry, scoped to `owner_id` **or**
  `partnership_id` (a check constraint), and to the matching space in
  `space_id` ([spaces.md](spaces.md)), with the header's ciphertext. `kind`
  is `journal`, `note` or `scene`. Ordered by `entry_date` for the journal and
  `last_edited_at` for notes and scenes.
- `notebook_updates`: the batches of edits, by `seq`, deleted by compaction.
  Unique on the batch's own id, so a resend is stored once.
- `notebook_versions`: one row per version, unique on `(entry_id, up_to_seq)`.

Snapshots live under `permanent/<partnershipId>/notebook/<entryId>/` for a
shared entry, so disconnecting a partnership removes them with the rest of its
media (`purgePartnershipMedia`), and under `permanent/users/<userId>/notebook/`
for a solo one. The app has no account deletion; if it gains one, that prefix
has to go with it.

## The list in every context

`/notebook` follows the context ([contexts.md](contexts.md)), with the
switcher at the top right:

- **One space** (Me, or a partnership) lists that space's entries, live on its
  room (`space:<id>`, your solo space or the partnership's), as each notebook
  always has.
- **Everyone** lists every space you are in **in one query**
  (`space_id IN (…)`, by `notebook_entries_space_id_idx`), and works each row's
  access out against its own space exactly as that space's list would
  (`entryAccessFor`, and the hidden-but-liftable rows). Each row carries a chip
  saying whose it is. With only your own space, Everyone is just Me: no chips,
  no question.
- **Everyone is live on one stream.** Every list event (an entry made,
  deleted, retitled or re-restricted) is published to its space's room and
  fanned out to each member's own room, `user:<id>` (`publishListChange`), so
  an Everyone list watches the viewer's own room alone, however many
  partnerships it shows ([realtime.md](realtime.md#everyone-one-stream-not-one-per-space)).
  An entry's edits and cursors stay in its own space's room.
- **Starting an entry names its space.** An entry is started from the round
  add button at the bottom right (`AddButton`), for the kind of the tab that
  is open. In one space it is that space; in Everyone the button fans out an
  avatar for each space shown, as the context switcher does
  ([contexts.md](contexts.md#the-add-buttons-fan)), and the one picked is the
  space. A note or a scene starts at once (`NewEntryForm` with `bare`, which
  the button submits); a journal entry asks for its date first, in a dialog,
  today unless changed, because its date cannot be changed once it is
  started. Either way the form posts `spaceId`, and `createEntryAction`
  checks membership of it: it never reads the context, which another tab can
  change under this one.
- **An entry is its own space's.** `/notebook/[entryId]` takes its space from
  the entry, so one opened while the context says someone else shows as
  whoever's it is (a chip at the top right), with the actions its partnership
  allows. Its links go back to `/notebook`, in whatever the context is.

Today's notebook card links to `/notebook` and sets the context to its own
space on the way (`NotebookWidget`): your own in Everyone and Me, the
partnership's in its context. Following it shows what it previewed.

## Screens and endpoints

| Route | |
| --- | --- |
| `/notebook` | Journal, Notes and Scenes tabs in the current context; a new entry; `?/create` (naming its `spaceId`), and `?/show` for a hidden entry the viewer may show again (naming the entry's space). |
| `/notebook/[entryId]` | The entry, in its own space: title (its save status, Settings, History, Move and Delete at the end of its row, or on a row above it where they do not fit), editor, presence, history; `?/setAccess` (who else can see it, in the Settings popover, for whoever has the say over that) and `?/delete`. |
| `/notebook/[entryId]/menus/[menuId]` | A scene's menu on a page of its own, read only until Edit, its to-dos tickable by a writer ([scenes.md](scenes.md#a-menus-own-page)). |
| `api/notebook/entries/[entryId]/updates` | `GET` edits after a seq (with the latest version on open); `POST` a batch and/or a caret. |
| `.../header` | `GET` its revision (for a move starting again); `POST` the sealed header, compare-and-swap. |
| `.../move` | `POST` the commit of a move to another space. |
| `.../move/versions/[versionId]` | `PUT` one version re-sealed for the space it is moving to. |
| `.../versions` | `GET` the history; `POST` a version. |
| `.../versions/[versionId]` | `GET` one version's sealed snapshot. |

The live stream is the shared `api/realtime/events`, on the entry's topic.
Today's notebook card shows the three most recently edited entries
(`NotebookWidget`), leaving out anything hidden from the viewer.

The loads and actions are in `server/notebook-pages.ts`, and everything that
touches the database in `server/notebook.ts`. The old addresses,
`/home/notebook/**` and `/partner/[id]/notebook/**`, are gone, with no
redirects.

## Not built yet

- Fantasies, a bucket list, folders, renaming and icons (the rest of the
  roadmap branch).
- Editing a journal entry's date after it is made.
- A recovery bin (on the roadmap as `notebook-recovery-bin`): deleting is
  immediate and final today. Deleted entries are to wait in a bin for a
  recovery period, with deleting straight away a separate, deliberate choice.
- Thinning old versions: every version is kept.
- Splitting a single oversized paste into several batches; it is refused
  instead, without being lost.
