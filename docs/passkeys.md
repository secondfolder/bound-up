# Passkeys

A passkey in this app does two jobs in one touch: it signs you in, and signing
in with it unlocks your encrypted messages. Every passkey does both, whatever
password manager holds it.

The keys themselves, the wraps and what the encryption guarantees are in
[docs/encryption.md](encryption.md). This document is about the credential: how
one is created, what it carries, how signing in with it opens the identity, and
what it is called.

## Two secrets, one wrap each

A passkey can hand the page one of two secrets, and whichever it can is what its
wrap is sealed to. Both wraps are the same AES-GCM envelope as the password
wrap, under a key derived with HKDF (`src/lib/crypto/passkey-wraps.ts`).

- **PRF output — `passkey-prf`.** The WebAuthn PRF extension evaluated with a
  fixed, app-wide salt: SHA-256 of `bound-up-prf-salt-v1`. The authenticator
  computes it from a key it never releases, so this is the strong one, and it
  is always preferred.
- **The user handle — `passkey-handle`.** At registration, the browser replaces
  the `user.id` Better Auth proposed with `0x01 ‖ 32 random bytes`. Every
  discoverable passkey stores its user handle and returns it on every assertion,
  whatever the provider — so this works where PRF does not. The prefix byte is a
  format version: a handle without it is not a secret, and is never treated as
  one.

**Why a fixed salt.** The salt has to be in the sign-in request before the
browser knows which passkey will answer, and passkey autofill (conditional
mediation) requires an empty `allowCredentials`, which rules out
`evalByCredential`. A salt per credential would therefore mean a second ceremony
after signing in — which is exactly what the previous design, age's own
`webauthn` recipient with a fresh salt per file, needed. PRF output is already
unique to each credential, so sharing the salt costs nothing.

**Why replacing `user.id` is safe.** Better Auth (1.7.5) generates a random
`userID` for each registration, never stores it and never checks it: it finds a
passkey by credential id and verifies the signature against the stored public
key. `residentKey: 'required'` in `src/lib/server/auth.ts` makes every passkey
discoverable, so every one stores a handle to return.

**What the user-handle wrap gives up.** The handle is stored in the passkey
provider's vault, like a strong random password would be. It is exported with
the passkey if the user moves it to another manager (CXF), and a browser
extension that wraps WebAuthn can see it. It never reaches this server. That is
weaker than PRF — it is the reason a passkey never has both wraps, since two for
one credential would be only as strong as the weaker — and it is the price of
every passkey unlocking.

**Neither secret reaches the server.** Better Auth's own client posts the
assertion as the browser produced it, handle included, so the ceremonies in
`src/lib/crypto/passkey-ceremony.ts` call the same endpoints through
`authClient.$fetch` instead, with the same `@simplewebauthn/browser` helpers, and
strip `clientExtensionResults` and `response.userHandle` before posting. An e2e
test asserts on the posted bodies.

## Adding one

`AddPasskeyFlow.svelte`, on Security, owns the sequence:

1. **The password, in a dialog.** Opening the password wrap with it is the only
   way to the identity as a string on a device that caches a non-extractable
   `CryptoKey`, and sealing needs the string. It is also the password check: a
   wrong one fails the AES-GCM tag on the device, instantly, without asking the
   server. It is a check on the device, not a permission — the server lets any
   signed-in session register a passkey.
2. **Register** (`registerPasskey`): fetch Better Auth's options, replace
   `user.id` with a fresh secret handle, ask for PRF, create the credential,
   verify it with the server minus the extension results.
3. **Pick the secret.** PRF output from creation if the provider returned it;
   otherwise one more assertion, pinned to the new credential, to evaluate PRF
   (the dialog says "Touch your passkey once more to finish"); otherwise the
   handle. Any failure of that extra assertion — a dismissed prompt included —
   falls back to the handle, which always works.
4. **Store the wrap** (`POST /api/keys/passkey-enrolled`). The server refuses a
   wrap that names any credential but the passkey's own, because that is what
   signing in and deleting both match on. **If this fails, the passkey is
   deleted again** — a passkey with no wrap would sign in and then have nothing
   to open, and send the device round the sign-in-again loop for good.
5. **Name it**, in a second dialog, pre-filled from the provider.

The order cannot change: opening the identity comes before registering, or a
mistyped password would leave a stray passkey behind.

**Why "one more touch" is sometimes needed.** Many platforms cannot evaluate PRF
while a credential is being created, only when it is used. The evaluation is a
real assertion rather than a read of `prf.enabled` from the registration
response, because providers disagree with themselves about that flag in both
directions: Samsung Pass and KeePassXC say no at creation and then work;
Microsoft Password Manager says yes and then refuses.

## Signing in, which is unlocking

`signInWithPasskey` asks for PRF with the fixed salt, including on the passkey
autofill request the login page makes from its email field. It returns the
credential id, the PRF output if any, and the handle secret if any; the login
form stashes them, and `initialiseKeyring` opens the wrap that names that
credential with whichever secret its type needs (`openPasskeyWrap`). One touch,
and the user is signed in with their messages readable.

Deleting a passkey (Security, via `DELETE /api/keys/passkey/[id]` rather than
Better Auth's own delete, which knows nothing about wraps) removes its wrap in
the same batch.

**Known open risk:** a provider that answered PRF at creation and then refuses
it at sign-in would fail the sign-in outright. Microsoft Password Manager is
reported to behave like that. Retrying without the extension would get the user
in, but only by prompting again after what might have been a deliberate
dismissal — the two are the same error by design. Not done yet; worth checking
against the real provider.

## Naming, and the AAGUID

An AAGUID identifies an authenticator _model_, and it exists only in a
registration response. That is why the name dialog comes **after** the
credential is made rather than before it: there is nothing to pre-fill with
until then. `registerPasskey` therefore registers with no name at all, and
`renamePasskey` sets it when the dialog is confirmed.

`src/lib/passkey-providers.ts` maps AAGUID to provider. It mirrors
`commonAuthenticatorNames` in `@better-auth/passkey`, which mirrors the
community list at `passkeydeveloper/passkey-authenticator-aaguids`. It is a
copy rather than an import because Better Auth exports `getAuthenticatorName`
from its **server** entry, and pulling that whole plugin into the browser bundle
to read a fourteen-entry object would be a poor trade.
`passkey-providers.test.ts` imports the upstream map and asserts the two agree,
so the copy cannot drift silently. The Security page reads the AAGUID from
Better Auth's own `passkey` row.

**Apple zeroes the AAGUID** under the default `attestation: "none"`, which is
the flow this app uses. So the single most common passkey in existence resolves
to no provider at all, and every caller has an answer for `null` — the name
falls back to `navigator.platform`. Asking for attestation to get a real value
would put a consent prompt in front of every registration to improve a default
label, which is not a trade worth making.

## What went away, and why

There used to be a PRF _verdict_ per passkey (`passkey_details.prf_status`), a
survey of which providers could do PRF, "Cannot unlock your messages" badges on
Security, an unlock form with four modes, and an offer to seal an existing
passkey after a password unlock. Every one of them existed because a passkey
might not be able to unlock. Once every passkey could, there was nothing left
for them to say, and they were removed rather than kept quiet.

## One thing that is easy to break

**A screen must never render message content without the key.** Every screen
that switches on the keyring renders a placeholder for anything but `unlocked`.
Falling through to the content was a real bug: the messaging board rendered
every thread preview and every message as "…", which is ciphertext presented
as if it were the text.
