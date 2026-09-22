# Explain persistent storage before asking for it

## Context

`src/lib/crypto/keystore.ts` calls `navigator.storage.persist()` (`requestPersistence()`)
straight after the first durable `putIdentity`. That happens on the silent
unlock right after login and signup, so Firefox shows its permission prompt
without warning or context. The new behaviour:

- Nothing is requested on its own any more.
- After an **explicit** unlock (password or passkey on an unlock panel, not the
  silent unlock after login or signup), a dialog explains what the permission is
  for.
- `persist()` is called only when the user presses **OK**.
- Dismissing the dialog (Escape or the close button) requests nothing, and the
  dialog comes back on the next explicit unlock.
- The dialog is skipped when:
  - the device holds the key in memory only (`durable: false`),
  - the Storage API is missing,
  - `navigator.storage.persisted()` is already true, or
  - this device has already pressed OK (a localStorage flag).
- `/settings/encryption` gets a button that asks again while persistence is not
  granted.

## Changes

### 1. New module `src/lib/crypto/storage-persistence.svelte.ts` (browser-only)

This file holds the reactive state and the API calls, next to the keystore it
serves.

- `let due = $state(false)` and `let holds = $state(0)`.
- `offerStorageExplanation(durable: boolean): Promise<void>` returns early if:
  - `!durable`,
  - the Storage API is missing,
  - the localStorage flag `bound-up:storage-persistence-asked` is set, or
  - `await navigator.storage.persisted()` is true.
  Otherwise it sets `due = true`. Every localStorage access is wrapped in
  try/catch, and the flag is per device, not per user, because the permission
  belongs to the origin.
- `storageExplanationVisible()` returns `due && holds === 0`. It is reactive.
- `holdStorageExplanation(): () => void` returns an idempotent release. While
  "unlock, then set up a passkey" is running, it stops this dialog opening on
  top of the add-a-passkey dialogs.
- `acceptStorageExplanation(): Promise<boolean>` sets `due = false`, writes the
  flag and returns `persist()`. It must call `persist()` synchronously inside the
  click handler, before any `await`, so that Firefox still sees the user
  activation. Add a comment saying why.
- `dismissStorageExplanation()` sets `due = false` and does not write the flag.
- `storagePersistenceState(): Promise<'granted' | 'not-granted' | 'unsupported'>`
  and `requestStoragePersistence(): Promise<boolean>` are for the settings
  button.
- `resetStorageExplanation()` is a test seam.

### 2. `src/lib/crypto/keystore.ts`

- Remove `requestPersistence()`, `persistenceRequested`, both call sites in
  `putIdentity` and the reset line in `resetKeyStore`.
- Leave a short comment at `putIdentity` saying that persistence is now asked for
  only after an explanation, from `storage-persistence.svelte.ts`, and why: a
  Firefox prompt with no context, straight after sign-in.

### 3. `src/lib/crypto/session.svelte.ts`

- In `unlockWithPassword` and `unlockWithPasskey`, after a successful `cache()`,
  call `void offerStorageExplanation(keyring.durable)`.
- Do **not** call it from `initialiseKeyring`. The stash unlock after sign-in
  and a cached load are not explicit unlocks.
- In `lock()` and `resetKeyring()`, call `dismissStorageExplanation()`.

### 4. `src/lib/components/MessageUnlock.svelte`

In `onSetUpPasskey`, take `holdStorageExplanation()` before
`addPasskey.start()`, and release it in the `onDone` passed to `AddPasskeyFlow`.

- **Ordering:** `setUpPasskey` runs in the same microtask chain as the unlock
  resolving. The offer waits on `persisted()`, which resolves later, so the hold
  is always in place before the dialog could show. Comment this at the site.

### 5. New `src/lib/components/StoragePersistenceDialog.svelte`

- A `<wa-dialog label="Keep your messages unlocked here" open={visible}>` whose
  `onwa-after-hide` calls `dismissStorageExplanation()`.
- **Copy:** the browser can clear what this site stores (iPhones do after about
  a week), and then you have to unlock again. You can ask the browser to keep
  it. Your browser may ask you to allow this, or may decide on its own.
- One `wa-button variant="brand"` **OK** that calls
  `acceptStorageExplanation()`.
- Follow the dialog styling in `AddPasskeyFlow.svelte` (`passkey-dialog`).
- Add `wa-dialog` to `src/lib/webawesome.ts` if it is not already imported
  there. It is already used elsewhere, so it should be.

### 6. `src/lib/components/EncryptionGate.svelte`

Render `<StoragePersistenceDialog />` beside `<PasskeyOffer />` under
`{#if user}`, with no `handledByPage` gate. Like the offer, it follows an unlock
wherever that unlock happened.

### 7. `src/routes/(auth-required)/(app)/settings/encryption/+page.svelte`

- In the "This device" unlocked branch, when `keyring.durable`, look up
  `storagePersistenceState()` (in an effect keyed on the keyring status).
- If the state is `not-granted`, show a short note and an outlined
  `wa-button`, "Ask the browser to keep it", that calls
  `requestStoragePersistence()` and then re-checks.
- If the browser still refuses, show a quiet line saying so, noting that Safari
  generally allows this only from the Home Screen.
- **Choice:** the button shows whenever persistence is not granted. That covers
  a dismissed dialog and also an OK that the browser declined.

## Tests

- **`src/lib/crypto/storage-persistence.svelte.test.ts`** (browser project;
  stub `navigator.storage` and clear localStorage). Cover:
  - each skip condition;
  - accept calls `persist` exactly once and sets the flag;
  - dismiss calls nothing, leaves the flag unset, and a later offer makes the
    dialog due again;
  - a hold hides the dialog until it is released.
- **`src/lib/crypto/session.svelte.test.ts`:**
  - a password unlock and a passkey unlock both make the explanation due;
  - `initialiseKeyring` through the stash does not;
  - a memory-tier store does not;
  - `lock()` clears it.
- **`src/lib/crypto/keystore.test.ts`:** `putIdentity` no longer calls
  `navigator.storage.persist`.
- **`src/lib/components/StoragePersistenceDialog.svelte.test.ts`:** the dialog
  opens when due, and OK calls `persist`. Hiding it calls neither `persist` nor
  sets the flag.
- **e2e, `e2e/encryption.spec.ts`:** an `addInitScript` stubs
  `navigator.storage.persisted` to return false and counts `persist` calls.
  - Login with the stash unlock shows no dialog and makes zero `persist` calls.
  - Lock, then unlock with the password: the dialog is visible and `persist` has
    still not been called. Press OK and `persist` has been called once.
  - A fresh context that dismisses the dialog: `/settings/encryption` shows the
    re-request button, and clicking it calls `persist`.

## Docs

- `docs/encryption.md`, "Storage still gets evicted": rewrite the paragraph that
  starts "The keystore asks `navigator.storage.persist()` once…" to describe the
  explain-then-ask dialog, which unlocks trigger it, the device flag, and the
  settings button.
- Copy this plan to `docs/historical-plans/2026-09-22-storage-persistence-prompt.md`.

## Verification

`npm run check`, `npm run lint` and `npm test` (vitest, then playwright). Then
check by hand in Firefox, which is the browser that really prompts:

1. Sign in: no prompt.
2. Lock on `/settings/encryption`, then unlock: the dialog appears.
3. Press OK: Firefox's prompt appears.
