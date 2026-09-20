# Plan — keep the unlock on the device as long as possible, then Face ID

## The problem

On iOS, unlocking messages and then reloading the page shows the unlock prompt
again. `/settings/encryption` confirms `keyring.durable === false`, so the
identity was never written to IndexedDB — it lived in module state for the life
of the tab and died with it.

The cause is the gate in `src/lib/crypto/session.svelte.ts`:

```ts
const usable = store.durable && (await webCryptoX25519Available());
if (usable) await store.putIdentity(value);
```

Persistence is coupled to WebCrypto X25519, because the only storable form the
codebase has is a non-extractable X25519 `CryptoKey`. X25519 in WebCrypto
shipped in **Safari 18.4 / iOS 18.4** (March 2025); before that both probes —
`keyStore()`'s clone probe and `webCryptoX25519Available()` — fail, and the
keystore falls back to memory permanently. IndexedDB being unusable (Private
tab, Lockdown Mode) produces the same outcome by a different route.

That coupling is unnecessary. `age-encryption` falls back to `@noble/curves`
for *string* identities; only a `CryptoKey` identity needs WebCrypto X25519.

## The shape of the fix

A ladder, best first:

| Tier           | Stored form                                       | Needs              | Cold start        |
| -------------- | ------------------------------------------------- | ------------------ | ----------------- |
| 1 `crypto-key` | non-extractable X25519 `CryptoKey`                | X25519 + OKP clone | nothing           |
| 2 `sealed`     | identity string sealed under a device AES-GCM key | IndexedDB + AES-GCM| nothing           |
| 3 `memory`     | identity string in module state                   | —                  | unlock every load |

and, when all three are empty — evicted storage, a new device, a Private tab —
a **passkey unlock**: one Face ID touch instead of typing the password.

Phase 1 is the storage ladder, phase 2 is the passkey. Phase 1 alone fixes the
reported bug on any device where IndexedDB works at all; phase 2 covers the rest
and turns the ~7-day iOS eviction into a touch rather than a password.

---

## Phase 0 — record *why* the keystore fell back

Small, and it stays useful. `keyStore()` swallows every failure into one
`catch`, so there is no way to tell an unsupported curve from a refused
IndexedDB from a `DataCloneError`.

- `src/lib/crypto/keystore.ts` — carry a `fallbackReason: string | null` on the
  `KeyStore` (`'no-indexeddb'`, `'x25519-unsupported'`,
  `` `${error.name}: ${error.message}` ``). Probe X25519 and the clone as
  separate steps so they are separately attributable.
- `src/routes/(auth-required)/(app)/settings/encryption/+page.svelte` — show it
  under the existing warning, quietly (a `<small>`), so a support answer is one
  screenshot rather than a remote-inspector session.

This also answers open question 1: whether iOS is failing on the curve or on
IndexedDB. If it is IndexedDB itself, phase 1 does not help that device and
phase 2 is the only fix — build both regardless, but know which.

## Phase 1 — tier 2: seal the identity under a device key

**Dependency:** add `idb` (8.0.3, ISC). It replaces `openDatabase`,
`promisify` and the `tx()` helper in `keystore.ts` with a typed schema and an
`upgrade` callback, and unlike `idb-keyval` it supports the `userId` index
`getPins` needs. Plumbing only — none of the crypto below comes from it.

**`src/lib/encryption.ts`**

- `DEVICE_SEAL_INFO = 'bound-up-device-seal-v1'`.
- `deviceSealAad(userId, recipient)` → `` `${DEVICE_SEAL_INFO}|${userId}|${recipient}` ``.
  Binds a sealed blob to both the account and the public key, so a row copied
  between profiles or accounts fails its tag check. The user id *is* included
  here, unlike `wrapAad` — there is no signup-ordering reason to leave it out,
  the id always exists by the time anything is cached.

**`src/lib/crypto/wrap.ts`**

- Take the AAD as an explicit argument instead of computing `wrapAad(recipient)`
  internally, so the device seal gets its own domain separation while there is
  still one AES-GCM envelope implementation and one set of tests. Callers pass
  `wrapAad(recipient)`.

**`src/lib/crypto/keystore.ts`**

- `DB_VERSION` 1 → 2, adding a `device` object store. It holds one row, the
  non-extractable AES-256-GCM device key, under a fixed key `identity-seal-v1`;
  generated on first tier-2 write and never rotated (rotating it would strand
  the sealed identity for no gain — it is not a secret anyone can reach).
- `CachedIdentity` becomes a union: `{ userId, recipient, key }` (tier 1, the
  existing shape, still read as-is so rows written today keep working) or
  `{ userId, recipient, sealed: Uint8Array }` (tier 2, `iv || ciphertext || tag`).
- Replace `durable: boolean` with `tier: 'crypto-key' | 'sealed' | 'memory'`;
  keep `durable` as a derived `tier !== 'memory'` so call sites and the settings
  copy do not all have to change at once.
- Probe ladder in `keyStore()`, preserving the existing "a row already exists,
  so skip the probes" shortcut:
  1. no `indexedDB` → memory.
  2. open fails/blocked → memory.
  3. an identity row exists → adopt the tier that row uses.
  4. X25519 generate + clone round-trip succeeds → tier 1.
  5. AES-GCM generate + clone round-trip succeeds → tier 2.
  6. otherwise memory.
- `putIdentity(userId, recipient, identity: string)` — the store now takes the
  *string* and decides the form. Tier 1 imports it to a `CryptoKey`; tier 2
  seals it under the device key.
- `getIdentity(userId)` — tier 1 returns the `CryptoKey`; tier 2 unseals to a
  string and then, if `webCryptoX25519Available()`, imports it to a
  non-extractable `CryptoKey` before handing it back. So even on the sealed
  tier the in-memory form is the unstealable one wherever the browser allows.
- Best-effort `navigator.storage.persist()` once, after the first successful
  durable write — that is the "as long as possible" part. Safari usually denies
  it unless the site is on the Home Screen; the call is harmless when it does.

**`src/lib/crypto/session.svelte.ts`**

- `cache()` stops consulting `webCryptoX25519Available()` and stops branching on
  `store.durable`: it hands the identity string to `putIdentity` and reads the
  resulting form back. The store owns the tier decision now.
- `Keyring.unlocked` carries `tier` alongside `durable`.

**Deliberately not doing:** an app-level TTL on the cached identity. The
browser's eviction *is* the expiry, and anything we add on top only makes the
prompt appear more often than it has to.

## Phase 2 — passkey unlock, via typage's `webauthn` module

**No new dependency and no server change.** `age-encryption@0.3.1` — already
installed — exports `webauthn` with `createCredential`, `WebAuthnRecipient` and
`WebAuthnIdentity`. It owns the whole PRF ceremony: the
`navigator.credentials.get()` call, `userVerification: 'required'`, a 16-byte
nonce per encryption carried in the age stanza, HKDF over **both**
`prf.results.first` and `.second` (so one user-presence check cannot be made to
yield two unwraps), and the AEAD. It also absorbs the 1Password extension's
non-compliant PRF result shape.

On the server, `userKeyWraps` already stores an opaque `type`/`params`/`blob`,
`parseKeyWrapParams` already accepts `webauthn-prf`, `addWrap()` already exists
in `src/lib/server/keys.ts`, and `revokeWrap` already refuses to remove the last
unlock method. `PRF_REGISTRATION_EXTENSIONS` in `src/lib/server/auth.ts` already
asks every new passkey for a PRF key. What is missing is a client module and one
form action.

**Which credential.** Reuse the account's existing sign-in passkeys: construct
`new webauthn.WebAuthnIdentity({ rpId })` with no `identity`, which leaves
`allowCredentials` empty and lets the platform offer the user's discoverable
credentials. The alternative — `createCredential()` — registers a *second*
passkey that Better Auth does not know about and that never appears in the
Security page's list, which is worse to explain than a picker.

The cost of that choice: `createCredential()` is the only path that can check
`getClientExtensionResults().prf.enabled`, the check
`docs/encryption.md` argues for. Enrolment still fails loudly and at the right
moment, because `WebAuthnRecipient.wrapFileKey()` performs a real PRF
evaluation and throws `PRF extension not available` when the authenticator has
no PRF — a stronger signal than `enabled`, since a wrap only exists if the
ceremony has already succeeded once on that authenticator. Rewrite the doc note
to say so.

**Wrap format.** The blob becomes an age file rather than the AES-GCM envelope:

```ts
const age = await loadAge();
const encrypter = new age.Encrypter();
encrypter.addRecipient(new age.webauthn.WebAuthnRecipient({ rpId }));
const blob = toBase64Url(await encrypter.encrypt(identity)); // ~400 chars
```

- `wrapBlobField` in `src/lib/schemas/keyWrap.ts` already allows
  `[A-Za-z0-9_-]{40,1024}`, which fits; its comment and the `blob` column
  comment in `src/lib/server/db/schema/app.ts` both claim "IV || AES-256-GCM
  ciphertext || tag" and must be widened to "an opaque ciphertext — an AES-GCM
  envelope for password wraps, an age file for passkey wraps".
- `KeyWrapParams` for `webauthn-prf` becomes `{ type, version: 1, rpId }`. The
  `credentialId` and `salt` fields go: typage carries the nonce in the stanza,
  and the credential is chosen by the platform picker. (`identity?: string`
  stays available for a future `createCredential()` path — it is the
  `AGE-PLUGIN-FIDO2PRF-1…` string, a hint and not a secret.)
- `src/lib/crypto/kdf.ts`'s `deriveWrapKeyFromPrf` and
  `PRF_WRAP_KEY_INFO` become dead and should be deleted with their tests, not
  left as a second way to do this.

**Enrolment — `/settings/encryption`, "Unlock with Face ID on this device"**

Offered only while `keyring.status === 'unlocked'` (the identity has to be in
hand to wrap it) and the account has at least one passkey; otherwise link to
Security, where registration already requests PRF. Encrypt as above, POST a new
`addWrap` action with the params and blob, label it with the device name.

**Unlock — `unlockWithPasskey(user)` in `session.svelte.ts`**

```ts
const decrypter = new age.Decrypter();
decrypter.addIdentity(new age.webauthn.WebAuthnIdentity({ rpId }));
const identity = await decrypter.decrypt(fromBase64Url(wrap.blob), 'text');
```

then `cache()` — so a Face ID unlock persists through phase 1, and the next load
is silent. That is the A-then-B ladder this plan exists for.

It does **not** go through `tryWraps`: that helper loops over every wrap, and
here each iteration is another biometric prompt. With more than one passkey wrap
the user picks one (or the most recently used is tried first), and a failure
falls back to the password form rather than prompting again.

**Edges to handle:**

- `replaceUserKeys()` deletes *every* wrap, so a forgotten-password reset or a
  history restore drops the passkey wrap. Say so on the reset screen rather than
  leaving a Face ID button that fails.
- A password change adds a new password wrap and must leave the passkey wrap
  alone — verify, since the two share no key material.
- A passkey removed from Security leaves an orphan wrap. `revokeWrap` already
  exists; offer it from the same list rather than letting the button fail.
- PRF needs iOS 18+ / macOS 15+ / Chrome 132+, and iOS cannot pass PRF to an
  *external* authenticator (platform passkeys are fine) — already in the doc.
- `webauthn` is marked `@experimental` in typage. Pin `age-encryption` exactly
  rather than `^`, and note it in the doc.

## Phase 3 — surfacing, docs, tests

**UI**

- The "you will be asked for your password each time" warning currently lives
  only on `/settings/encryption`. A user hitting this on the thread page sees a
  bare unlock form with no hint that it will recur — which is why this read as a
  bug. Surface the tier-3 case in `EncryptionGate` and the thread page too.
- Tier-aware copy in settings: tiers 1 and 2 both say "unlocked here", tier 3
  keeps the warning plus the phase-0 reason.
- "Unlock with Face ID" button wherever a locked state renders — `UnlockForm`
  (above the password field, only when the bundle holds a `webauthn-prf` wrap),
  `EncryptionGate`, the thread page's `.locked` block, `/settings/encryption`.

**Docs** (part of the change, not a follow-up — AGENTS.md)

- `docs/encryption.md`: replace "Two things treated as normal rather than
  exceptional" with the three-tier ladder; add the passkey unlock to the four
  ways a device ends up unlocked; rewrite the `enabled`-at-registration
  constraint per phase 2; record Safari 18.4 / iOS 18.4 as the X25519 floor and
  why persistence no longer depends on it; note that there are now two wrap
  envelope formats and which is which.
- State the security delta plainly: under tier 1 injected script can *use* the
  identity but never obtain its bytes; under tier 2 it can call decrypt and walk
  away with the age secret key permanently. That is a real downgrade, taken only
  on devices that today store nothing at all — where the identity already sits
  in memory as a string for the length of the session. Nothing on disk opens
  without user verification under the passkey wrap.
- Add a line on OPAQUE (`@serenity-kit/opaque`) as the known upgrade path for
  the `masterKey → authSecret/wrapKey` split: it would stop a
  password-equivalent value reaching the server at all and stop the KDF salt
  being the user's email. Out of scope here — Rust/WASM both sides, bespoke
  Better Auth integration, and a migration for every existing account — but it
  should be written down rather than rediscovered.
- `AGENTS.md` only if an invariant moves — the "one AES-GCM envelope" line now
  takes an explicit AAD, and no longer covers passkey wraps.

**Tests**

- Add `fake-indexeddb` as a devDependency, registered in
  `vitest-setup-client.ts` (the jsdom project in `vite.config.ts`).
- `src/lib/crypto/keystore.test.ts` (new): each tier selected under the right
  conditions; tier-1 rows written by the old code still read; seal/unseal round
  trip; a sealed blob with a mismatched userId or recipient fails its tag; the
  fallback reason is recorded; the "existing row skips the probe" shortcut.
- `src/lib/crypto/wrap.test.ts`: extend for the explicit AAD.
- `src/lib/crypto/session.test.ts` (new): cold start finds a sealed identity and
  comes up unlocked without touching the network; `unlockWithPasskey` persists
  through `cache()`; a failed passkey unlock falls back to the password form
  without a second prompt.
- Passkey enrolment/unlock: stub `navigator.credentials` and assert the wrap
  round-trips through typage. Testing typage's own ceremony is not our job.
- E2E: unlock, full page reload, messages still readable and no prompt.
  Chromium exercises tier 1; force tier 2 with a test seam that fails the
  X25519 clone probe. For the passkey path, try Playwright's CDP virtual
  authenticator — if it cannot evaluate PRF, leave e2e on the password path and
  say so in the spec rather than pretending coverage.
- Copy this plan into `docs/historical-plans/YYYY-MM-DD-...md` on completion.

## Open questions

1. **Which tier iOS actually lands in.** Phase 0 answers it. If IndexedDB
   itself is refusing, phase 1 does not help that device and phase 2 is the fix.
2. Whether tier 2 should be opt-in for users who would rather type a password
   than have a decryptable blob on disk. Probably not worth a setting, but it is
   the one place this plan trades security for convenience.
3. Whether to keep a `createCredential()` path as well, for users who want a
   dedicated encryption passkey (and the `prf.enabled` check) rather than
   reusing a sign-in one. Cheap to add later; the `params.identity` field is
   reserved for it.
