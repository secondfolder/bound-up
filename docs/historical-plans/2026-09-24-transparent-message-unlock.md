# Transparent message unlock: sign-in is the unlock

## Context

Unlocking messages is currently a separate step the user has to think about.
A password sign-in unlocks silently through `stash.ts`. A **passkey sign-in never
does**: it lands on "locked", and the user has to touch the passkey a second time
(age's own ceremony) or type the password. A passkey without PRF can never unlock
at all. After iOS wipes storage (7 days of Safari use without visiting the site),
the session cookie survives, so the user is still signed in, but their messages
are locked.

Goal: the user signs in once, with a password or any passkey, and every feature
works, messages included, across closed tabs and days. Encryption never appears
in the UI as a separate concept. We keep today's E2E guarantee: the server,
whether at rest or while running, never holds anything that decrypts. That was a
deliberate choice, so a cookie-anchored auto-recovery after eviction is **out of
scope**.

**No backwards compatibility.** There are no real users yet. Existing passkeys will
be recreated by hand, and accounts created before encryption are not supported. All
legacy handling is removed rather than migrated: age-format passkey wraps, the
`absent` key state, per-passkey PRF verdicts, the add-a-passkey-later offer, and
the unlock form.

## Research findings (what shaped the design)

1. **One ceremony can do both sign-in and PRF.** The installed
   `@better-auth/passkey@1.7.5` passes `extensions` through to
   `@simplewebauthn/browser`, which spreads them unchanged into
   `navigator.credentials.get()` and returns `getClientExtensionResults()`. That
   includes autofill (conditional UI). age's `WebAuthnIdentity` runs its own ceremony
   with a different salt for each file, so it can't share the sign-in assertion. So
   the new wrap uses a **fixed, app-wide PRF salt**: `eval`, not `evalByCredential`,
   because conditional UI requires an empty `allowCredentials`. PRF output is
   already unique to each credential, so a global salt loses nothing.
2. **A secret in the user handle, for passkeys without PRF.** Every discoverable
   passkey stores `user.id` (up to 64 bytes) and returns it as `userHandle` on every
   assertion, with any provider. Better Auth generates a random `userID` for each
   registration (`@better-auth/passkey` `index.mjs:164`), **never stores it or checks
   it**, and looks passkeys up by credential ID. So the browser can replace `user.id`
   with `0x01 ‖ 32 random bytes` before `create()`, and the server never sees it,
   provided we strip `userHandle` from the assertion before posting it.
3. **Rejected alternatives:**
   - **`largeBlob`:** support is narrower than PRF (iCloud yes, Google Password Manager
     no).
   - **Deriving a key from the signature:** ES256 signatures are randomised, so the
     output isn't stable.
   - **localStorage:** Safari's 7-day rule wipes it along with IndexedDB.
   - **`persist()` on the login page:** Safari shows no prompt, and it isn't documented
     to override the 7-day rule.
4. **Libraries considered:**
   - **Juicebox:** adds a PIN, and its servers are in Rust and can't run on Workers.
   - **Privy / Turnkey / Web3Auth:** SaaS on secure hardware, built for crypto wallets,
     and it would tie us to a vendor.
   - **Bitwarden "log in with device":** needs a second device.

   Conclusion: **no new crypto library.** The only new direct dependency is
   `@simplewebauthn/browser` (already transitive; pin it to the version Better Auth
   uses).
5. **Why iOS eviction only partly matters.** The 7-day counter only runs on days Safari
   is used *without* visiting this site, and Home Screen web apps are exempt.
6. **Existing gap: sign-out doesn't clear the device key.** `/logout` is a server
   action only.

## Trade-offs, stated plainly

| Choice | Gains | Costs |
| --- | --- | --- |
| Fixed-salt PRF wrap (`passkey-prf`) | One touch signs in and unlocks, including autofill | Gives up age's two-output nonce design. The protection it gave (one touch yielding two decryptions) matters little for same-origin use |
| User-handle wrap (`passkey-handle`) | Every provider unlocks | The secret sits **in the passkey provider's vault**, like a strong random password would; PRF's key never leaves the authenticator. It is exported with the passkey (CXF) and visible to extensions that wrap WebAuthn. It is still never visible to our server |
| Exactly one wrap per passkey, PRF preferred | PRF-capable passkeys keep the stronger property | Two wraps for one credential would be only as strong as the weaker one |
| No cookie-anchored recovery | The server never holds anything that decrypts | An infrequent iOS Safari user, or a device under storage pressure, is sent back to sign in (one tap with autofill) |
| No unlock form: a device without its key signs in again | One way in, which the user already knows | Guides and partner screens redirect too. A wrong password costs a server round trip instead of the on-device check |

## Implementation

### 1. Wrap formats: `src/lib/encryption.ts`, `src/lib/crypto/wrap.ts`
- `KeyWrapType` becomes `'password' | 'passkey-prf' | 'passkey-handle'`. **Remove
  `webauthn-prf`.** The passkey params are `{ credentialId, rpId, version: 1 }`.
  Both passkey types use the existing AES-GCM envelope (`seal`/`unwrapIdentity`,
  with the AAD bound to the recipient) under `HKDF(secret, info
  "bound-up-passkey-prf-v1" | "bound-up-passkey-handle-v1")`.
- Constants: `PASSKEY_PRF_SALT = SHA-256("bound-up-prf-salt-v1")` and
  `USER_HANDLE_SECRET_PREFIX = 0x01`. The prefix is a format version byte, and a
  handle without it is simply not a secret.
- New `src/lib/crypto/passkey-wraps.ts`: `wrapKeyFromPrf`, `wrapKeyFromHandle`,
  `parseHandleSecret`. Add a frozen test vector for each derivation, following
  `kdf.test.ts`.
- `type` is a TypeScript-only `$type<>` on text, so the new types need no migration.

### 2. Registration seals as it creates: new `src/lib/crypto/passkey-ceremony.ts`
- `registerPasskey(identity)` bypasses `authClient.passkey.addPasskey`:
  1. `$fetch('/passkey/generate-register-options')`.
  2. Overwrite `user.id` with `0x01 ‖ S` and add `extensions.prf.eval.first = SALT`.
  3. `startRegistration`.
  4. POST `/passkey/verify-registration` without `clientExtensionResults`.
- Choosing the wrap:
  - If `create()` returned `prf.results.first`, write a `passkey-prf` wrap.
  - Otherwise make one `get()` with PRF, pinned to the new credential. If it
    returns output, write a `passkey-prf` wrap.
  - Otherwise write a `passkey-handle` wrap from `S`.

  A passkey therefore never exists without a wrap. If the wrap upload fails, delete
  the credential (`passkey.deletePasskey`) and show an error, so there is no
  half-made passkey.
- `src/lib/server/auth.ts`: set `authenticatorSelection.residentKey: 'required'`,
  so every passkey returns a user handle. Comment why.
- `AddPasskeyFlow.svelte` keeps its password step, because on the `crypto-key` tier
  opening the password wrap is the only way to get the identity as a string. Opening
  that wrap is also the password check: a wrong password fails the AES-GCM tag on the
  device. It then calls `registerPasskey`. The flow no longer skips the password for
  passkey-only accounts, because every account has a password.
- **Delete `/api/keys/verify-password`**, along with `verifyPasswordWithServer` and its tests.
  It was described as the server-side re-authentication, but passkey registration only
  needs a session, so it enforced nothing. The on-device wrap check above is the real one.
- **Delete `hasPasswordCredential`** and the Security page's `hasPassword` branches. They
  only existed for passkey-only accounts, and every account now has a password: signup
  requires one, and recovery sets one.
- **Delete the verdict machinery.** All passkeys unlock, so there is nothing to
  report:
  - `verdictFor` and the verdict half of `passkey-enrolment.ts`
  - `PrfProviderList.svelte` and `PRF_PROVIDERS`. `passkey-providers.ts` keeps AAGUID
    → name for labels.
  - The Security page badges
  - **The whole `passkey_details` table.** With `prf_status` gone, its only other
    column is `aaguid`, and Better Auth's own `passkey` table already stores that
    (`schema/auth.ts`). The Security page names providers from `passkey.aaguid`. Remove
    the table, its insert and its selects in `src/lib/server/keys.ts`, and the
    `PasskeyPrfStatusValue` type. Run `drizzle-kit generate --name
    drop_passkey_details` and read the SQL.
  - `/api/keys/passkey-enrolled` becomes "store this wrap" only.
  - AGENTS.md invariant 10's two PRF bullets. Keep the hostname binding.
- **Delete the age passkey path:** `passkey.ts`'s `wrapIdentityToPasskey`,
  `unwrapIdentityWithPasskey` and `encodeAgeCredentialIdentity`, plus their frozen
  vector. `age-encryption` stays for messages. Remove the exact-version pin
  rationale that was about `age.webauthn`, and keep the pin itself only if
  something else still needs it.
- **Delete the enrolment offer:** `PasskeyOffer.svelte`, plus `openEnrolmentOffer`,
  `pendingIdentity` and `enrolmentIdentityFor` in `session.svelte.ts`. Its only
  purpose was sealing a passkey that had no wrap, and that can no longer exist.

### 3. Sign-in unlocks: `LoginForm.svelte`, `stash.ts`, `session.svelte.ts`
- `signInWithPasskey({ autoFill })` in `passkey-ceremony.ts`:
  1. `$fetch('/passkey/generate-authenticate-options')`.
  2. `startAuthentication` with the PRF `eval` extension.
  3. Delete `response.userHandle` and `clientExtensionResults`.
  4. POST `/passkey/verify-authentication`.

  It returns `{ credentialId, prfOutput?, handleSecret? }`. If the extension makes
  the ceremony fail with `NotAllowedError`, retry once without it, then use the
  handle. This covers Microsoft Password Manager accepting PRF at creation and
  refusing it at sign-in.
- `LoginForm` replaces both `authClient.signIn.passkey` calls. `Stashed` becomes a
  union: `{ kind: 'password', email, wrapKey }` or `{ kind: 'passkey',
  credentialId, prf?, handle? }`. It still survives only client-side navigation and
  is still cleared as it is read.
- `initialiseKeyring`: the stash path picks the wrap by `credentialId` and opens it
  with whichever secret matches its type. If that fails, the device has no key,
  which leads to section 4. It should never happen now; if it does, it's a bug.
  Log it rather than loop: the redirect is skipped when the stash was just consumed.
- **Delete the `absent` state.** Signup always creates keys, so a bundle without a
  recipient becomes an error rather than a state. Remove:
  - the `absent` callouts in `EncryptionGate` and on the board
  - the "set up messaging" flow on `/settings/encryption`, including its password
    check via a no-op `changePassword`
  - the keyless branch in `/settings/security`'s password change

### 4. No unlock form: a device without its key signs in again
- When `initialiseKeyring` finds no key on this device, `EncryptionGate` calls
  `signInAgain(redirectTo)`:
  1. `lock(user.id)`.
  2. POST `/logout` with a `redirectTo` field. The action runs it through
     `safeRedirect` and sends the user to `/login?redirectTo=…&reason=device`.

  Signing out is necessary because `/login`'s load already redirects anyone with a
  session.
- **The login page looks exactly like a normal login.** `reason=device` changes
  nothing on screen. It only triggers the storage dialog afterwards (section 5).
  The email is pre-filled so password managers and passkey autofill match the
  account.
- **No exemptions.** The `/settings/encryption` exemption existed only for a
  passkey that couldn't unlock, and that can no longer exist.
- **Delete:**
  - `UnlockPanel.svelte`, `MessageUnlock.svelte` and `src/lib/passkey-unlock.ts`,
    with their tests
  - `unlockWithPassword`, `unlockWithPasskey` and `passkeyWrapFor`
  - the locked callout in `EncryptionGate`
  - the `locked` branches on the board, the thread
    (`partner/[id]/messages/+page.svelte`, `[threadId]/+page.svelte`) and
    `/settings/encryption`
  - "Lock on this device"

  `Keyring` shrinks to `unknown | unlocked` plus a short-lived `locked` that renders
  the `unknown` placeholder while the redirect runs.
- **AGENTS.md:** replace the "one unlock form" convention (and its snippet and
  `onFlowOpen` rules) with "no unlock form: a device without its key signs in again".
  Keep the placeholder-not-content rule, now covering `locked` too.

### 5. Staying signed in
- Sign-out: call `lock(user.id)` before posting `/logout`, in `settings/+page.svelte`
  and `SiteHeader.svelte`.
- Session: set `session.expiresIn` to 30 days and `updateAge` to 1 day in
  `auth.ts`. Comment why.
- **`StoragePersistenceDialog`** is the existing dialog whose OK button calls
  `navigator.storage.persist()`: Firefox prompts, while Chrome and Safari decide
  silently. It is shown only after a moment when a cleared browser has just cost
  the user something, so the request has context.
  - Trigger: after a sign-in that arrived with `reason=device`, replacing "after an
    explicit unlock".
  - New copy, with no mention of messages or unlocking:
    - Title: "Stay signed in on this device".
    - Body: "Your browser can clear what this site stores on your device, which signs
      you out here. We can ask your browser to keep it. It may ask you to allow that,
      or it may decide on its own."
  - The re-ask moves with the device diagnostics to the "This device" block on Security (section 6).
- **Home Screen hint (iOS/iPadOS, WebKit):** new `HomeScreenHint.svelte` under the
  login form and in the app shell.
  - Copy: **"Add to Home Screen to stay signed in for longer"**, plus "Share → Add to
    Home Screen".
  - Shown when `shouldOfferHomeScreen({ userAgent, maxTouchPoints, standalone })` in
    `src/lib/home-screen.ts` says so: iOS or iPadOS (iPadOS reports as a Mac, so also
    check `maxTouchPoints > 1`), and not already standalone (`navigator.standalone`
    or `display-mode: standalone`).
  - A dismissal is remembered in localStorage (`bound-up:home-screen-hint-dismissed`),
    wrapped in try/catch.
  - Add `static/manifest.webmanifest` (`display: standalone`, icons), linked from
    `src/app.html`.

### 6. Further removals (from the sweep)
- **`userHasMessageHistory`.** The `(app)` layout runs this D1 query on every request only to decide
  whether to show the locked or keyless callouts. Remove it from `(app)/+layout.server.ts`,
  `settings/+page.server.ts` and `messaging.ts`, and remove `EncryptionGate`'s
  `userHasMessageHistory`/`handledByPage` props and the page tests that pass them. After this,
  `EncryptionGate` only initialises the keyring and redirects.
- **`user_key_wraps.last_used_at`, `/api/keys/wrap-used`, `touchWrap` and `noteWrapUsed`.** These only chose
  the most recent passkey wrap and fed the list of unlock methods; wraps are now picked by credential ID.
  This goes in the same migration as `passkey_details`.
- **`/settings/encryption`, the whole page:**
  - "Ways you can unlock", `addWrap`, `revokeWrap`, `deleteWrap`: a wrap now matches the password or
    one passkey exactly.
  - "Add a passkey": duplicated on Security, so `AddPasskeyFlow` gets one caller.
  - Setup: already planned.
  - "Forgotten your password?" and `forgetPassword`/`clearPasswordCredential`: replaced by section 7.

  What's left is the device diagnostics (tier, `fallbackReason`, the storage re-ask), which move to a
  "This device" block on Security. Remove the settings link and its `hasMessageHistory` load.
- **HistoryWarning (your call: remove).** Delete `HistoryWarning.svelte`, `/api/partnerships/[id]/ack-warning`,
  `acknowledgeHistoryWarning` and `user_keys.history_warning_ack_at` (migration), plus the warning branch in
  e2e `openBoard`. Its claim ("lose your password, lose your history") is no longer true, and it makes users
  think about encryption.
- **The `missing` state in `trust.svelte.ts`/`PartnerKeyNotice`** ("partner hasn't set up messaging").
  Every account now has keys.
- **`UnlockBundleView`/`Keyring` fields that only fed the unlock form:** `passkeyCount`,
  `passkeysKnownUnusable`, `unusableProviderAaguid`, `reason`, and `tier` on `locked`.
  `getUnlockBundle` stops querying passkeys.
- **`describePasskeyFailure`'s `no-prf` category.** `passkeysAvailable` stays only to hide the passkey
  button on the login page.
- **Addition:** deleting a passkey on Security (`authClient.passkey.deletePasskey`) must also delete its
  wrap by `credentialId`. Do it in a small `/api/keys/passkey/[id]` DELETE that removes both, in one
  `db.batch()`, or orphan wraps pile up.

### 7. Partner-assisted sign-in (replaces "forgotten password" restore)
For someone who has lost every way in: no password, no passkey. The identity is lost with them, so a
partner re-encrypts their shared history to a new one, and approving that is what lets them back in.

- **Starting a request** (login page link "Can't sign in? Ask your partner" → `/login/recover`, in `(public)`):
  - The requester enters their email and a **new password** (`PasswordField`, same strength rules as
    signup).
  - The browser generates a new identity and password wrap, reusing signup's `buildIdentitySubmission`
    from `setup.ts`.
  - It POSTs `{ email, recipient, wrap }` to `/api/account-recovery`. The server returns a random
    **request token** and stores only its SHA-256.
  - `authSecret` is **not** sent yet, so no login credential sits in the database while a request is
    pending.
  - **No account-existence oracle:** the response is identical for an unknown email or an account with no
    partners. A token comes back either way, and it simply never gets approved.
  - Rate-limit the endpoint by IP and by email.
  - Requests expire after 24 hours, and a new request supersedes the requester's pending one.
- **The code:** the requester's screen shows a short code derived from the new recipient (reuse the
  safety-number formatting in `fingerprint.ts`), and tells them to read it to their partner **somewhere
  other than this app**. It polls `/api/account-recovery/status` with the token.
- **Approving** (the partner, signed in; `RestoreRequests.svelte`, reworked):
  - The app shell shows "{name} can't sign in and asked for your help", not only the messages board.
  - The partner compares the code, then approves or declines.
  - Approving runs the existing paged re-encryption (`listHistoryForRestore`/`applyHistoryRestore`) to the
    new recipient, then marks the recovery `approved`.
  - The partner's pin for the requester moves to the new recipient as **verified**, because they just
    compared it. That avoids the "key changed" block they would otherwise hit.
- **Completing** (the requester's page sees `approved`):
  - It POSTs `{ token, authSecret }` to `/api/account-recovery/complete`.
  - In one `db.batch()`, the server:
    - swaps `user_keys` to the new recipient (`replaceUserKeys`)
    - deletes every old wrap and inserts the new password wrap
    - **deletes every passkey** (none can open the new identity, and keeping them would leave a sign-in
      with no key)
    - sets the password credential to the scrypt hash of `authSecret` via Better Auth's
      `ctx.password.hash`, in a new `setPasswordCredential` in `credentials.ts`
    - revokes all sessions, which signs out whoever had the lost devices
    - marks the request `completed`
  - The page then runs a normal password sign-in with the password just chosen, so the stash unlocks it
    as usual.
- **More than one partner:** the request goes to all of them, and the first approval completes the sign-in.
  Completion opens a `history_restore_requests` row in each **other** partnership, with the new recipient,
  so those partners can re-encrypt later through the same approve UI. It tells them who approved the
  sign-in, and asks them to check the code with the requester first.
- **Schema:** new `account_recovery_requests` (`id`, `user_id` nullable for unknown emails, `token_hash`,
  `recipient`, `wrap_params`, `wrap_blob`, `status`, `approved_by`, `expires_at`, timestamps; index on
  `user_id, status`). `history_restore_requests` stays for per-partnership re-encryption, but requests are
  now created by recovery completion, not by `requestHistoryRestore` from a signed-in user (which is
  deleted). Generate with `drizzle-kit generate --name account_recovery` and read the SQL.
- **⚠ Known gap, recorded on purpose:** until email verification exists, **a partner alone can take
  over the account**. They can file a request for your email, approve it themselves, and sign in. They
  also then receive re-encrypted history from your other partners if those approve. The future fix is
  that recovery also requires proving control of the email address. Record this:
  - in `docs/account-recovery.md` under "Not built yet"
  - in `docs/temporary-code.md`
  - in a comment at the approval site in the server code

  so it can't be forgotten. The other-partner prompt is worded to push them to check with the requester
  out of band, which limits the damage meanwhile.

## Critical files
- Crypto: `session.svelte.ts`, `stash.ts`, `wrap.ts`, `passkey.ts`,
  `passkey-enrolment.ts`; new `passkey-ceremony.ts` and `passkey-wraps.ts`;
  `keystore.ts` unchanged
- `src/lib/encryption.ts`, `src/lib/passkey-providers.ts`, `src/lib/home-screen.ts` (new)
- Components: `LoginForm`, `EncryptionGate`, `AddPasskeyFlow`,
  `StoragePersistenceDialog`, `HomeScreenHint` (new)
- `src/lib/server/auth.ts`, `src/lib/server/keys.ts`, `schema/app.ts` (drop `passkey_details`, + generated
  migration), `api/keys/passkey-enrolled/`, `(public)/logout/`, `settings/security/`,
  `settings/encryption/`, the two messaging pages
- Deleted: `UnlockPanel`, `MessageUnlock`, `PasskeyOffer`, `PrfProviderList`, `HistoryWarning`,
  `passkey-unlock.ts`, the `/settings/encryption` route, `/api/keys/wrap-used`,
  `/api/partnerships/[id]/ack-warning`, `/api/keys/verify-password`
- New: `/login/recover`, `/api/account-recovery/{,status,complete}`, `/api/keys/passkey/[id]`,
  `account_recovery_requests`. Reworked: `RestoreRequests.svelte`, the restore half of `messaging.ts`
  and `credentials.ts`
- Migrations (drizzle-kit, named): drop `passkey_details`, `last_used_at` and
  `history_warning_ack_at`; add `account_recovery_requests`. One generation run is fine.
- Docs:
  - `docs/encryption.md`: sign-in unlocks, the wraps, the user-handle trade-off,
    sign-out clears the key, no unlock form, the redirect.
  - `docs/passkeys.md`: largely rewritten. No verdicts, no provider table, the
    registration sequence, and the password checked once on the device (the "prove it,
    twice" section and its server claim go).
  - `docs/messaging.md`: the locked screens, HistoryWarning and the old restore trigger are gone.
  - New `docs/account-recovery.md` (add it to the AGENTS.md feature-doc table): the flow, the
    no-oracle rule, why passkeys and sessions are wiped, and **"Not built yet: email verification"** with
    the partner-takeover gap stated plainly.
  - AGENTS.md: invariant 10, and the unlock-form convention.
  - Copy this plan to `docs/historical-plans/2026-09-23-transparent-message-unlock.md`.

## Verification
- **Unit (node):**
  - Frozen vectors for both derivations; `parseHandleSecret` rejects handles without
    the prefix.
  - The logout action's `redirectTo` goes through `safeRedirect`, so a hostile value
    lands on `/`.
  - `shouldOfferHomeScreen` for iPhone Safari, iPad (reporting as a Mac, touch
    points > 1), desktop Mac Safari, Chrome on iOS, standalone mode and Android.
- **Component:**
  - `HomeScreenHint` shows the exact copy, stays hidden once dismissed, and still
    renders when localStorage throws.
  - `StoragePersistenceDialog` shows the new copy.
- **Server (recovery):**
  - The start endpoint returns the same shape for an unknown email, an account with no partners and a
    real one.
  - The token is stored hashed.
  - `status` is `pending` until a partner approves, and a non-member can't approve.
  - Completing with a wrong token, or before approval, fails.
  - Completing swaps the recipient, deletes old wraps and passkeys, sets the credential and revokes
    sessions, all in one batch.
  - Other partnerships get restore requests.
  - Expiry works, and a new request supersedes the pending one.
- **Server:** deleting a passkey deletes its wrap. The `(app)` layout load no longer queries message history.
- **Server:** `passkey-enrolled` accepts only the two new types and validates params.
  The migration applies cleanly (`createTestDb`), and the Security page still names the
  provider from `passkey.aaguid`.
- **e2e (`e2e/passkey.spec.ts` and others, CDP virtual authenticator):**
  - `hasPrf: true`: register, sign out, sign in with the passkey, and messages are
    readable with no further prompt. The stored wrap is `passkey-prf`.
  - `hasPrf: false`: the same, with a `passkey-handle` wrap.
  - The verify-authentication and verify-registration bodies contain no `userHandle`
    and no PRF output.
  - Clear IndexedDB and reload `/home/guides`: the user lands on a login page
    identical to the normal one. A passkey sign-in, and separately a password
    sign-in, returns them to `/home/guides` with messages readable, and the storage
    dialog appears.
  - Sign out, then check IndexedDB: the identity is gone.
  - No page renders message content or "…" while the keyring is `unknown` or
    `locked`.
  - Recovery end to end with two contexts: the requester starts at `/login/recover` and sees a code.
    The partner sees the prompt, the same code, and approves. The requester lands signed in, with the
    shared history readable under the new key. Their old passkey no longer exists, and an old session
    in a third context is signed out.
  - Remove or rewrite specs for the deleted flows (unlock panel, enrolment offer,
    PRF verdicts, keyless account setup).
- Run `npm run check`, `npm run lint`, `npm test` and `npm run test:e2e`. Then
  `npm run preview` with real passkeys on an iPhone (iCloud Keychain) and in Chrome
  with a PRF-less provider (e.g. Bitwarden on iOS).

## Open questions (not in this change)
- **Email verification for partner-assisted sign-in** (see section 7). Until then a partner can take over
  the account alone.
- Providers that rewrite `user.id` on sync (none known) would break a handle wrap.
