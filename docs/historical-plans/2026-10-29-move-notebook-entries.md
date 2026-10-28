# Move notebook entries between spaces

## Context

A notebook entry belongs to the space it was created in (your solo space, or a
shared space with a partner) and can never leave it. The user wants to move an
entry from one space to another, e.g. a private note they now want to share, or
a shared note they want to take back.

It is not a column update. Everything in an entry is sealed to its space's vault,
with the vault id in the associated data (`docs/encryption.md`, "Sealed
records"). That covers the header (`notebook_entries.ciphertext`), the update log
(`notebook_updates`) and every version snapshot (in the media store, under a
prefix derived from `ownerId`/`partnershipId`, `notebookEntryPrefix` in
`src/lib/server/media/index.ts`). So the browser has to re-seal all of it under
the target vault, and the server has to swap scope, vault and storage prefix in
one go without losing an edit made at the same moment.

Decisions made with the user:
- **Keep every version.** Each snapshot is re-sealed. History is not collapsed.
- **Who may move:** whoever may set the entry's access (`canSetAccess`: the creator or
  whoever holds control) for a shared entry, and the owner for a solo one. You must also
  be a member of the target space and able to write into its vault (the trust check).
- **All kinds move, scenes included.**

## Approach

The browser re-seals the entry and uploads it in stages, then makes one atomic
commit. The server checks only envelopes and permissions, as everywhere else.

### Shape of the move

1. **Flush.** The entry's session must be saved: an empty outbox and no
   offline state. Otherwise the dialog says to wait.
2. **Scenes leaving a shared space.** The mover's session makes an ordinary
   edit that removes every block whose `hiddenFrom === me`. Those are the
   partner's surprises, which would otherwise sit as undeletable "A surprise"
   placeholders in a solo scene. The mover's own surprises (`hiddenFrom` = the
   partner) are left alone and do nothing in a solo space. Wait for the flush
   again.
3. **Stage the versions.** List the versions (`GET versions`), then for each one:
   fetch it, open it with the current vault, re-seal it under the target vault
   with the **same version id**, and `PUT` it to the staging endpoint. That
   writes it under the target's prefix. Then add one new head version: a
   snapshot of the live doc at the session's head `seq`, under a fresh id. It
   is staged the same way, unless the head already equals the latest version's
   `upToSeq`. Show progress in the dialog.
4. **Commit.** `POST` the target `spaceId`, the expected `vaultId`, the
   `revision`, `upToSeq` (head), the new head version's metadata, the list of
   staged version ids, and the header re-sealed to the target vault.
   - The header is built the way the session already builds it for the target scope.
   - For a shared target, the excerpt leaves out anything hidden from either partner.
5. **Server commit.** Everything goes in one `db.batch()` (never `transaction()`;
   invariant 3). Each statement is conditioned so the batch is all-or-nothing in
   effect:
   - **The entry row:** `UPDATE notebook_entries`, setting `owner_id`/`partnership_id`/`space_id`/`vault_id`.
     - Reset `partner_access` to its default and `access_set_by_user_id` to null.
     - Set the new `ciphertext` and `payload_version`, and add 1 to `revision`.
     - `WHERE id = ? AND vault_id = <old> AND revision = ? AND NOT EXISTS (update with seq > upToSeq)`.
   - **Each kept version:** `UPDATE notebook_versions` with the new `vault_id`, `payload_version` and `size`,
     `WHERE … AND EXISTS (entry with vault_id = <new>)`.
   - **The head version:** inserted conditionally (`INSERT … SELECT … WHERE EXISTS`).
     Its contributors are computed beforehand, as `createVersion` does.
   - **The update log:** `DELETE notebook_updates WHERE seq <= upToSeq AND EXISTS (entry with vault_id = <new>)`.
     The new head snapshot covers them, so no update needs re-sealing.
   - **Zero rows changed on the entry row** means the answer is `stale`. The staged
     objects are deleted, and the client retries from step 3, up to 3 times.
6. **After a successful commit:**
   - `deletePrefix` the old prefix.
   - Publish `{ type: 'moved' }` on the old room's entry topic.
   - Evict members of the old space who are not in the new one (`notifier.evict`, as `setAccessAction` does).
   - `publishListChange` for both spaces.

### Closing the race with concurrent edits

- **Make `appendUpdate` atomic with the vault check.** Its insert becomes
  `INSERT … SELECT … WHERE EXISTS (entry with vault_id = ?)`, and 0 rows means
  `wrong-vault`. An edit that lands before the commit makes the commit `stale`.
  One that lands after is refused.
- **Make `wrong-vault` recoverable.** The update, header and version endpoints
  answer `wrong-vault` with **409**, and `#send` in
  `src/lib/notebook/session.svelte.ts` treats 409 like 403: it calls
  `onAccessChanged` and the page reloads. `entrySession` rebuilds on the new
  `vaultId`/`room`. The batch is still in the outbox and is re-sealed with the
  new vault on resend, so nothing typed is lost.
- **Handle the new `moved` frame in the session.** It calls `onAccessChanged`.
  A partner who lost access then gets a 404 on reload, and that already goes
  through `onGone` back to the list.

### Abandoned moves

If a move is abandoned between staging and commit, its staged objects are left
orphaned under the target's prefix for that entry id. Two things limit this:
- A later move to the same space reuses that prefix and overwrites them.
- A shared target's objects go with `purgePartnershipMedia`.

This is documented as a known, bounded leak. There is no sweep for it.

## Files

**Pure rules (alias-free)**
- `src/lib/notebook.ts`: add `canMoveEntry(entry, userId, partnership)`. It
  returns true for the owner of a solo entry, and `canSetAccess` for a shared
  one. Also add `isMovable` target checks. Tests go in `src/lib/notebook.test.ts`.

**Server**
- `src/lib/server/notebook.ts`:
  - Add `stageMovedVersion(...)` and `moveEntry(db, store, context, userId, target, input)` as described above.
  - Make `appendUpdate`'s insert conditional.
  - Export the scope → prefix helper for a *target* scope, from `notebookEntryPrefix` in `src/lib/server/media/index.ts`, so staging can compute it.
- Resolving the target: use the existing `requireSpaceMember` + `resolveScope`
  (`namedScope` in `src/lib/server/notebook-pages.ts:181`) to get the target
  scope and `vaultId`.
- New routes:
  - `src/routes/api/notebook/entries/[entryId]/move/+server.ts`: POST commit, then publishing via `notebook-live.ts`.
  - `src/routes/api/notebook/entries/[entryId]/move/versions/[versionId]/+server.ts`: PUT stage. It takes `spaceId` in the body, checks membership, vault and envelope, and that the id is stored or new.
- Existing endpoints answer `wrong-vault` with 409:
  - `src/routes/api/notebook/entries/[entryId]/updates/+server.ts`
  - `src/routes/api/notebook/entries/[entryId]/header/+server.ts`
  - `src/routes/api/notebook/entries/[entryId]/versions/+server.ts`

**Browser**
- `src/lib/notebook/move.ts` (new): the flush → strip-surprises → stage → commit
  flow, taking the live session and the target scope. Pieces it uses:
  - `writableVault(scope)` from `src/lib/sealed-forms.ts` for the trust check (`KEYS_CHANGED` blocks the move with the usual message).
  - `sealRecord`/`openRecord` from `src/lib/crypto/sealed.ts`.
  - The notebook sealed kinds from `src/lib/sealed-kinds/notebook.ts`.
  - `tryFetch` for every request.
- `src/lib/notebook/session.svelte.ts`:
  - Handle the `moved` frame and 409.
  - Expose what move needs: the head seq, a flushed promise, a snapshot of the doc, and a header for a given scope.
- Removing the partner's surprises: a small helper next to `isSurpriseFor` in
  `src/lib/scenes/blocks.ts`, run through the scene editor, which already walks
  `hiddenFrom` on `MenuNode`/`MenuLineNode` and sections.
- `src/lib/components/notebook/NotebookEntryPage.svelte`:
  - Add a **Move** button in `.actions` beside Delete, shown when `entry.canMove` is true.
  - It opens a `ResponsiveDialog` with a space picker. Reuse the "For whom?"
    picker from `NotebookList.svelte` (or extract it), listing every space the user
    belongs to except the current one.
  - The dialog warns about what each move does:
    - "Your partner will no longer see this" (out of a shared space).
    - "They'll see all of its history" (into one).
    - "Your partner's surprises will be removed" (a scene leaving a shared space).
  - It shows a progress line and a failure that leaves the entry where it was.
  - Copy never mentions encryption (memory: encryption invisible).
- `src/lib/server/notebook-pages.ts`: add `canMove` to the entry load (and
  `loadSceneMenu`). Check that scene extras (partner id, kink lists) are
  derived from the space at load time, so they follow the move. Fix them if they are not.

**No migration.** Every column already exists.

## Tests

- **Pure:** `canMoveEntry` for a solo owner, a shared creator, the holder of
  control, and a partner with neither.
- **Server** (`src/lib/server/notebook.test.ts`, using the existing fixtures
  `createTestNotebookEntry`, `ensureTestSelfVault`/`ensureTestPartnershipVault`
  and `createTestMediaStore`):
  - Solo → shared and shared → solo: scope columns, vault and access are reset;
    versions' vault ids are updated; the head version is added; updates ≤ upToSeq
    are deleted; snapshots are under the new prefix and the old prefix is gone.
  - Refused when the user lacks authority, is not a member of the target, sends
    the wrong target vault, has an un-staged version or an incomplete version
    list, or sends a stale revision or upToSeq.
  - The race: an update appended after staging makes the commit `stale`, and an
    `appendUpdate` with the old vault after the commit is `wrong-vault`. Both
    leave the entry consistent.
  - The space no-orphans test in `src/lib/server/spaces.test.ts` still passes.
- **Route tests** for the two new endpoints, with `fakeEvent`/`runAction`.
  Also check that the updates endpoint answers 409 on `wrong-vault`.
- **Component/browser:** surprise stripping removes only `hiddenFrom === me` blocks.
- **E2E**, added to `e2e/notebook.spec.ts` and `e2e/scenes.spec.ts`:
  - Solo → shared: the partner sees it in their list. History restores an old
    version for both people.
  - Shared → solo while the partner has it open: the partner's page goes to the
    list. The mover's entry has its history, and its SQL row has the new
    vault (as the sentinel test does).
  - A partner without authority sees no Move button.
  - Typing during a move loses nothing.
  - A scene moved out of a shared space no longer contains the partner's surprise.

## Docs and housekeeping

- `docs/notebook.md`: a new "Moving an entry" section covering the protocol, the race,
  the 409 recovery and the orphan bound. Remove anything that says entries
  cannot change space.
- `docs/scenes.md`: what happens to surprises on a move.
- `docs/encryption.md`: re-sealing across vaults as a pattern.
- `docs/contexts.md`: a move names its target space and never reads the context.
- `src/lib/roadmap/roadmap.json`: update the entry if one covers moving items.
- Copy this plan to `docs/historical-plans/2026-10-28-move-notebook-entries.md`.

## Verification

1. `npm run check`, `npm run lint`, then the vitest runs for the touched files.
2. `npx playwright test e2e/notebook.spec.ts e2e/scenes.spec.ts` while
   iterating, then the whole `npm run test:e2e`.
3. `npm run test:e2e:worker` for the notebook specs. This touches R2 (staging,
   `deletePrefix`), the Durable Object publish and D1 batch semantics.
4. Manually: on a dev server with two accounts, move an entry each way with
   both open, and check the version history in both.
