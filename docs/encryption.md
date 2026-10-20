# Encryption keys

Private messages between partners, and the content of tasks and rewards, are
encrypted in the browser, and the server stores only ciphertext. This document covers the keys: where they come from,
where they are kept, and what the guarantee actually is. The messaging feature
itself is [docs/messaging.md](messaging.md).

Beside each user's identity sit **vaults**: one key per user and one per
partnership, which a user's data is sealed under as **sealed records**. Both
are described below. Messages, message tags' names and the partnership's own names are sealed in
their partnership's vault;
tasks, rewards, and their completions and claims in the owner's or the
partnership's vault ([docs/tasks.md](tasks.md#what-the-server-can-see),
[docs/rewards.md](rewards.md#what-the-server-can-see)); a daydream's setup,
every turn and mark of it, and the user's library of characters and ideas in
the owner's own vault ([docs/daydreams.md](daydreams.md)). Moving the remaining
kinds of user data onto vaults is in progress, and until a kind has moved, it
is stored as it was.

Two narrow exceptions exist for embeds. First, when a URL is typed into the
composer, when a new message is sent, or when an embed with no cached preview
loads, the client may send that URL to `/api/embed-metadata` so the server can resolve preview data and hand it back
for encryption into the message's metadata sidecar. Second, a reddit embed
sends its URL to `/api/oembed` so the server can fetch reddit's CORS-blocked
oEmbed endpoint. Both happen when the embed reaches the scrollport rather than
on thread open. The server still does not store message plaintext, but it can
transiently receive those URLs because some providers do not expose a
browser-callable metadata API, and those lookups are not logged. The full
behaviour lives in [docs/embeds.md](embeds.md).

A third, wider exception is Daydreams. Their passages are written by a hosted
language model, so while a daydream is being played the browser sends its
setup and recent turns as plaintext to `/api/daydreams/[id]/reply`, and while
one is being set up, the character or idea being written to
`/api/daydreams/suggest` when the user asks for ideas; both forward them to
OpenRouter and a model provider. The server neither stores nor logs them, and
what is saved is sealed like everything else, but the words do leave the
device in the clear, and the user accepts that before their first
daydream. [docs/daydreams.md](daydreams.md#what-the-server-sees) states the
boundary exactly.

## What this does and does not promise

**The server never receives your password.** It receives a value derived from
it, and it cannot get back from that value to your password or to the key that
decrypts your messages.

That is an _operational_ property, not a cryptographic one, and the difference
matters enough to say first. The server also ships the JavaScript that does the
deriving. A server that wanted your password could add a line and get it, and
nothing in the browser would notice.

So what this genuinely buys is narrower than "end-to-end encrypted" usually
suggests, and still worth having:

- No plaintext password in a request log, an error report, a crash dump, or a
  captured request. This codebase has already had two `console.log(form)` calls
  removed for exactly that reason.
- No credential-stuffing value from any of the above, because the value that
  does travel is specific to this app.
- A stolen database is not a login verifier, and does not contain anything that
  decrypts a message.

What it does **not** protect against: a compromised or malicious server serving
modified JavaScript, or script injected into the page. Do not let
`extractable: false` on the cached key (below) become a reason to skip a CSP.

## Deriving the keys

All in the browser, in [`src/lib/crypto/kdf.ts`](../src/lib/crypto/kdf.ts). The
shape is Bitwarden's published design: one expensive derivation from the
password, then two cheap one-way derivations from that.

```
masterKey  = PBKDF2-SHA256(password, "bound-up-mk-v1|" + email, 650_000, 256 bits)
authSecret = HKDF-SHA256(masterKey, info "bound-up-auth-v1")  -> to the server
wrapKey    = HKDF-SHA256(masterKey, info "bound-up-wrap-v1")  -> never leaves
```

`authSecret` is 32 bytes as unpadded base64url — 43 characters — and is
submitted in Better Auth's `password` field. Better Auth hashes it again with
scrypt and a fresh 16-byte per-user salt, which is what stops a stolen database
being a login verifier.

`wrapKey` is produced by `deriveKey` directly as a non-extractable `CryptoKey`,
so it never exists as bytes in JavaScript.

Because HKDF is one-way, the value the server holds cannot be turned back into
`masterKey` or `wrapKey`.

### The limit you cannot design around

Anyone holding the stored wrap can attack it **offline**: guess a password,
derive, try to decrypt. Server-side iterations do nothing against that — this is
the published critique of Bitwarden's design, and it applies here identically.

So the confidentiality of your whole message history is capped by the entropy of
your password. That is why the signup minimum is 12 characters with a strength
meter, and why the meter rewards length over punctuation.

### Things that must never change quietly

- **Email normalisation** is `trim()` + `toLowerCase()`, defined once in
  `normaliseEmail` and nowhere else. Anything cleverer — Gmail dot-stripping,
  plus-address trimming — would be defensible product behaviour and would
  silently change the derived key for every existing account. There are tests
  asserting both are _absent_.
- **The KDF parameters** are compile-time constants, and cannot be per-user.
  Login has to derive before it can ask the server anything, so a "what
  parameters does this email use?" endpoint would answer "does this account
  exist?" for anyone who asked. That is the hole in Bitwarden's
  `/accounts/prelogin`, and it is deliberately not imported here.
  `MASTER_KEY_VERSIONS` is a newest-first ladder so a future change derives
  against the new parameters and falls back to the old ones on a 401, with no
  such endpoint.
- **`src/lib/crypto/kdf.test.ts` holds a frozen vector** for the shipping
  parameters. It is the most valuable test in the feature: it fails if any of
  the above moves, which is the difference between finding out in CI and finding
  out when every user has lost their history.
- **Changing an account's email would invalidate its master key.** The Account
  settings page therefore leaves email read-only for now. If email changes are
  ever added they must re-wrap the identity first and coordinate with auth.

## The identity, and how it is stored

Each user has one long-term age X25519 identity, generated in the browser at
signup.

| Where                 | What                                                                         |
| --------------------- | ---------------------------------------------------------------------------- |
| `user_keys.recipient` | The public `age1…`. Stored in the clear — it is public by construction.      |
| `user_key_wraps`      | One row per way to unlock: `(type, params, blob)`. All opaque to the server. |

`blob` is base64url of a ciphertext the server cannot read, in one format for
every `type`: `12-byte IV ‖ AES-256-GCM(identity) ‖ 16-byte tag`, with the
additional authenticated data set to `"bound-up-wrap-v1|" + recipient`. That AAD
binds a wrap to the public key it belongs to, so a wrap row moved between
accounts fails its tag check instead of decrypting into someone else's
identity. What differs between types is only where the wrap key comes from:

- **`password`** — derived from the account password (above).
- **`passkey-prf`** — from a passkey's PRF output. See [Passkeys](#passkeys).
- **`passkey-handle`** — from a secret this app stores in a passkey's user
  handle, for providers that will not do PRF. See [Passkeys](#passkeys).

age's own passphrase mode is deliberately not used for the password wrap: it
would run scrypt over a value that is already 650,000 PBKDF2 iterations deep,
and would imply to anyone reading the stored blob that a passphrase existed
which the server does not have.

### Why there are many wrap rows

Two reasons, and the first is load-bearing:

1. **A password change inserts the new wrap _before_ changing the credential.**
   A crash between the two then leaves two password wraps, of which exactly one
   opens under whichever password is now current — rather than none. This is why
   `user_key_wraps` has **no unique index on `(user_id, type)`**; adding one
   would break password changes in a way that only shows up on a mid-request
   failure.
2. Every passkey has a wrap of its own, beside the password's.

### One identity, never rotated

There is no forward secrecy and no revocation, and that is the deliberate trade
for a feature whose whole point is that a new device can download and read the
history. A compromised identity exposes everything, past and future. Rotating
is not an escape either: the server holds ciphertext only, so there is nothing
to re-encrypt from.

The single exception is losing every way in — the password and every passkey —
which loses the identity outright. A partner-assisted sign-in then replaces it
and a partner wraps the partnership vault for the new one; see
[docs/account-recovery.md](account-recovery.md).

### Passkeys

Signing in with a passkey unlocks, in the same touch — that is the whole design,
and [docs/passkeys.md](passkeys.md) has it in full. In brief:

- **One ceremony.** The sign-in assertion asks for the PRF extension with a
  fixed, app-wide salt (`PASSKEY_PRF_SALT_SOURCE`). Fixed because the salt has
  to be in the request before anyone knows which passkey will answer, and
  passkey autofill needs an empty `allowCredentials`, which rules out a salt
  per credential. PRF output is already unique to each credential, so nothing
  is lost.
- **A fallback that always works.** Every passkey is created with `user.id`
  set, by the browser, to `0x01 ‖ 32 random bytes`. Every discoverable passkey
  stores its user handle and returns it on every assertion, whatever the
  provider — so a passkey whose provider will not do PRF is sealed to that
  instead (`passkey-handle`).
- **Exactly one wrap per passkey**, written as it is created: `passkey-prf`
  when the provider returned PRF output (at creation, or in one extra
  evaluation straight after), `passkey-handle` otherwise. Never both — a
  credential with both would be only as strong as the weaker one.
- **Neither secret reaches the server.** The ceremonies call Better Auth's
  endpoints directly (`crypto/passkey-ceremony.ts`) and strip
  `clientExtensionResults` and `userHandle` before posting. Better Auth never
  needed either: it verifies the signature against the stored public key and
  looks the passkey up by credential id.

**The trade the user-handle wrap makes, plainly.** A PRF key never leaves the
authenticator. A user handle is stored in the passkey provider's vault — like a
strong random password would be — and is exported with the passkey (CXF) and
visible to browser extensions that wrap WebAuthn. It is never visible to this
server. That is weaker than PRF and it is the reason PRF is always preferred;
it is still far stronger than the alternative it replaced, which was a passkey
that could sign in but could never read a message.

Both wrap keys go through HKDF with their own `info`
(`PASSKEY_PRF_WRAP_INFO`, `PASSKEY_HANDLE_WRAP_INFO`) into a non-extractable
AES-GCM key, and `crypto/passkey-wraps.test.ts` holds frozen vectors for both,
made by an independent implementation — the same reason as the KDF's frozen
vector.

Adding a passkey needs the password, because on a device that caches a
non-extractable `CryptoKey` opening the password wrap is the only way to get
the identity as a string to seal. Deleting one deletes its wrap in the same
batch (`/api/keys/passkey/[id]`).

## Import boundaries

- **`src/lib/crypto/**` is browser-only.** Nothing there may be imported from
  `src/lib/server/**` or from any `+*.server.ts`. Every function in it touches
  `crypto.subtle`, IndexedDB or age-encryption.
- **`src/lib/encryption.ts` is pure and alias-free.** The Drizzle schema imports
  its types by relative path, and drizzle-kit loads the schema outside Vite.
  This is why the types and the string logic live there and the cryptography
  lives in `crypto/` — the login page needs the KDF and must not pull in
  age-encryption, which brings ML-KEM with it for a feature this app never uses.
- The server's entire involvement is storing and returning four opaque strings:
  `recipient`, `type`, `params`, `blob`. It reads one field inside `params` — a
  passkey wrap's public `credentialId` — to tie the wrap to its passkey row.
  For vaults it stores a public key check and age ciphertexts, and decides only
  who may write which: see [Vaults](#vaults).
- **`src/lib/vault.ts` and `src/lib/sealed.ts` are the pure halves** of vaults
  and sealed records, alias-free like `encryption.ts`, so the schema and the
  server can share their types, formats and size caps. The cryptography is in
  `crypto/vault.ts`, `crypto/sealed.ts` and `crypto/ensure-vaults.ts`.

## What the forms do

Login and signup are still server form actions with superforms and Zod. Three
things changed:

1. The password `<input>` **has no `name`**, so it is not in the submitted
   FormData whether or not any JavaScript ran. It lives in
   `PasswordField.svelte` rather than `InputField.svelte`, which sets
   `name={field}` unconditionally — a name there would be one thrown exception
   away from posting the plaintext.
2. A hidden `authSecret` field is filled by superforms' `onSubmit`, which is
   awaited before `enhance` dispatches. That is an implementation detail rather
   than a documented contract, so `e2e/encryption.spec.ts` asserts the posted
   body never contains the password.
3. Password strength and confirmation are checked in the browser, because the
   server now sees a fixed-length derived value and cannot tell a passphrase
   from a single character.

**Do not add a `validators` option to either form.** Client-side validation runs
against `$form`, whose `authSecret` is empty until `onSubmit` fills the FormData
and which has no password field at all. It would reject every submission.

Because strength is checked against the component's own state rather than the
FormData, that state has to actually be right — and a password manager can
change an input without producing an event the component can see. This shipped
as a bug: an autofilled 21-character password was refused for being under 12,
while sitting visible in the box. `PasswordField.svelte` therefore reads the
value out of the **native control inside `<wa-input>`'s shadow root**, on the
element's events, on the inner control's events, and once more on a
capture-phase `submit` listener. The element's own `value` property is not
authoritative — after a fill that dispatches nothing it is still stale. The
mechanism, the measurement of which fill paths break, and the regression tests
are described in AGENTS.md and `e2e/helpers.ts`.

This is only a usability bug, never a security one: a password that fails to
reach the component cannot derive a key either, so the failure mode is a
refused submission rather than a weak one.

Password _strength_ being unenforceable server-side looks like a violation of
AGENTS.md invariant 14. It is not: that invariant is about a **permission**
being enforced by a disabled input, which is still forbidden. This is a
**policy** that has structurally moved into the browser, and cannot move back
without giving up the property this whole document is about. The compensating
server-side control is rate limiting on signing in and changing a password, per
client address — see [rate-limiting.md](rate-limiting.md).

### JavaScript was already required

Login and signup cannot work without JavaScript, and could not before this
change either: every text field is a `<wa-input>` custom element whose real
`<input>` only exists once Web Awesome upgrades it, so with scripting disabled
there are no usable inputs on those pages at all. Measured, and pinned by an
e2e assertion. The `<noscript>` block added here explains a dead end that
already existed.

## Where the identity lives on a device

`src/lib/crypto/keystore.ts` caches it in IndexedDB, and `session.svelte.ts`
holds the one piece of state everything reads (`currentKeyring()`).

**Signing in is what unlocks.** There is no unlock step and no unlock form. The
login form derives the wrap key from the password as it signs in; the passkey
ceremony gets its PRF output or user handle as it signs in; signup has the new
identity in hand. Each leaves what it has in a module-level stash
(`src/lib/crypto/stash.ts`), and a moment later `initialiseKeyring` opens the
identity with it and caches it through the storage ladder below. The next load
finds it cached and needs nothing.

So a device ends up in one of two states:

1. **It holds the identity** — cached from an earlier sign-in, or just opened
   from the stash.
2. **It does not.** Most often the browser has cleared its storage — Safari does
   after a week of use without a visit — while the session cookie survived.
   `EncryptionGate` then signs the device out and sends it to
   `/login?redirectTo=…&reason=device`. That login page looks exactly like any
   other: nothing about keys or messages. Signing in brings the identity back,
   and the user lands where they were. `reason=device` only makes the storage
   explanation below due afterwards.

Every screen is sent back, not only messaging: "signed in, except some
features" is the half-state this replaced. A device whose cached identity no
longer matches the public key the server serves — because a partner-assisted
sign-in on another device replaced it — drops the stale copy and is sent back
too.

**Signing out forgets the identity** on this device (`lock()`). It used to be
left in IndexedDB, readable by whoever signed in next on the same browser
profile. `lock()` leaves the keyring `signed-out` rather than `unknown`, so
nothing starts working the state out again — and deciding to send the device
to sign in — while the sign-out's own redirect is still in flight.

A sign-in that hands over a secret which opens nothing ends up
`locked` with `signInFailed`, and is **not** sent round again. Every way in is
created with a wrap, so that is a bug, and a redirect loop would hide it.

Every screen that switches on the status renders a placeholder, never content,
for anything but `unlocked` — see the last section of
[docs/passkeys.md](passkeys.md) for what went wrong when one did not.

### The storage ladder

Not every browser will hold the identity in the form we would like, so the
keystore tries three, best first, by writing a real key and reading it back.
Whichever survives is the one this browser profile uses, decided once:

| Tier         | What is written                                               | Needs                  |
| ------------ | ------------------------------------------------------------- | ---------------------- |
| `crypto-key` | the non-extractable X25519 `CryptoKey` itself                 | X25519 + a clone of it |
| `sealed`     | the identity string, AES-GCM sealed under a device key        | IndexedDB + AES-GCM    |
| `memory`     | nothing — the identity lives in a variable until the tab goes | —                      |

**Why the second tier exists.** WebCrypto X25519 only shipped in Safari 18.4 /
iOS 18.4. Before that a `CryptoKey` identity cannot be made at all, and the
device was dropped straight to `memory` — a password prompt on every page load,
which is what an iPhone actually did. Nothing about _storing_ the identity ever
needed X25519, though: age decrypts perfectly well from a string identity via
`@noble/curves`, and only the `CryptoKey` form of it needs the algorithm. So the
sealed tier keeps the string, encrypted under an AES-GCM key that is itself a
non-extractable `CryptoKey` in IndexedDB. On Apple platforms that stored key is
in turn wrapped by one in the system keychain.

**What the second tier gives up, plainly.** Under `crypto-key`, script injected
into the page can _use_ the identity for as long as it runs but can never obtain
its bytes. Under `sealed` it can call decrypt and walk away with the age secret
key permanently. That is a real downgrade. It is taken only on devices that
would otherwise persist nothing at all — where the identity already sits in
memory as a string for the whole session — and never in place of a tier that
works. A device climbs back to `crypto-key` on its own after an OS update,
because the probe runs again whenever the best tier is not already in use.

The in-memory form is not the tier. Wherever the browser can do X25519 the
identity is held as a non-extractable `CryptoKey` in the keyring, even on the
sealed and memory tiers — the tier decides what reaches disk, not what a
variable holds.

`fallbackReason` records why a device is not on `crypto-key`, and the Security
page's "This device" block shows it when the device ends up on `memory` — where
every page load loses the identity and signs the user out. It exists
because one `catch` around the whole probe made "iOS asks for my password every
time" indistinguishable from an unsupported curve, a refused database and a
`DataCloneError` without attaching a remote inspector.

### Storage still gets evicted

Safari deletes a site's storage after seven days of use without a visit to it,
and any browser may evict under pressure. Two things reduce how often that
costs a sign-in; neither can stop it, so signing in again is designed as the
ordinary path it is, not an error.

**The Home Screen.** A web app opened from the iOS Home Screen is WebKit's one
documented exemption from the seven-day rule, so on iPhone and iPad (in a
browser tab, not already standalone) `HomeScreenHint` suggests "Add to Home
Screen to stay signed in for longer", on the login page and in the app shell.
The web cannot add itself, so it says how, drawing Safari's share icon rather
than naming it. (A Web Share API button was tried: the sheet a page opens has
no "Add to Home Screen".) `shouldOfferHomeScreen` in
`src/lib/home-screen.ts` decides, and a dismissal is remembered per device by
`DismissibleHint`, which `NotificationsHint` shares (see
[notifications.md](notifications.md#ios)). The
manifest's `start_url` is `/home`, so the Home Screen app opens the app rather
than whatever page it was added from.

**Asking the browser to keep it.** `navigator.storage.persist()` helps where the
browser agrees — Chrome decides from engagement, Firefox asks the user. It is
not asked for on the login page: Safari shows no prompt, grants it mainly to
Home Screen apps, and does not document it as overriding the seven-day rule.

The request is never made unprompted. Firefox shows a permission prompt, and
the keystore used to fire it on its first durable write — the silent unlock
straight after signing in, with nothing on screen to say why. Now
(`src/lib/crypto/storage-persistence.svelte.ts`):

- **Only a sign-in the browser forced makes the explanation due** — one that
  arrived through `reason=device`, carried in the stash. An ordinary sign-in,
  and a load that finds the key already cached, do not. That forced sign-in is
  the moment eviction has just cost the user something.
- **It is skipped** when the device is on the `memory` tier (nothing is stored to
  keep), when the Storage API is missing, when `persisted()` already says yes,
  or once this device has pressed OK (the `bound-up:storage-persistence-asked`
  localStorage key — per origin, because the permission is).
- **`StoragePersistenceDialog`, in the app shell, explains; only its OK asks.**
  Its copy is "Stay signed in on this device" — about staying signed in, which
  is what the user experiences, never about keys. `persist()` is called in the
  click handler before anything is awaited, because Firefox prompts only while
  the click's user activation is live. Closing the dialog any other way asks
  nothing and records nothing, so it comes back the next time.
- **The Security page can ask again** whenever the device holds the key on a
  durable tier and `persisted()` says no — whether the dialog was dismissed or
  the browser refused an OK.

## Changing the password, and losing it

Every account has message keys — signup creates them, and a signup whose keys
fail to store is undone rather than left without — so there is one path for
each of these, not one per kind of account.

**Changing the password** (Security) re-seals the same identity, so nothing
already sent is lost. The order is chosen for crash-safety, and there is a test
asserting it:

1. Insert the **new** wrap. Both password wraps now exist.
2. Change the credential.
3. Only now retire the old wrap.

Dying between 1 and 2 leaves two wraps of which the old password opens one;
between 2 and 3, two of which the new password opens one. Sign-in tries each in
turn, so neither loses the identity. If step 2 fails outright the new wrap is
rolled back. A change that arrives without a re-sealed wrap is refused, since it
would leave the identity sealed to a password that no longer exists.

The old password is checked **in the browser** first, by opening the existing
wrap with it. A wrong one therefore fails before anything is sent.

**Losing the password alone loses nothing**, as long as a passkey is left: every
passkey unlocks, so signing in with one brings the identity back.

**Losing every way in** — the password and every passkey — loses the identity
for good. What remains is a partner-assisted sign-in, from the login page: a new
password and a new identity, a partner who compares a code and shares the
partnership vault with the new key, a link emailed to the account's address, and
every old passkey and session removed. See
[docs/account-recovery.md](account-recovery.md).

## Trust on first use

The server hands you your partner's public recipient, so a dishonest server
could hand you its own and read everything you send afterwards. Nothing in the
protocol prevents that. What the design gives you instead is that a
**substitution is visible**.

- **A safety number.** The first 80 bits of
  `SHA-256("bound-up-safety-v1\n" + the two recipients, sorted)`, as Crockford
  base32 in groups of four. Sorted so both people derive the same string without
  either needing to know who is "first"; Crockford because it has no I, L, O or
  U to misread aloud. 80 bits makes forging a match a 2^80 search, and 16
  characters is short enough to read down a phone line without losing your
  place. The copy tells you to compare it **somewhere other than this app**,
  which is the whole point — a server that can swap a key can also swap what
  both people see on screen.
- **Pin on first sight, and never re-pin silently.** A mismatch is the signal
  the whole mechanism exists to produce, so it has to survive the load that
  notices it. Accepting a changed key is a separate, deliberate act, and the new
  pin is **unverified** whatever the old one was — carrying verification across
  a key change would defeat the point of having pinned anything.
- **Your own recipient is pinned too**, separately. A server that swapped
  _your_ key would make everything your partner sends undecryptable by you,
  which without a pin looks like data loss rather than an attack. The two
  mismatches read very differently and are worded differently.
- **A changed key blocks sending** — on the board and in the thread, since a
  reply is a send too — until the user explicitly accepts it. The banner says
  that already-received messages stay readable, because "key changed" otherwise
  reads as "your history is gone" and would make the safe action look expensive.

**Partnership vaults are pinned too**, under `vault:<partnershipId>`: the
vault's key check, beside the partner's recipient. A vault is never replaced —
a partner-assisted sign-in re-wraps it for the new key rather than making a new
one — so unlike the two above there is no innocent cause for a change. It
blocks writing into the vault, and the only way on is comparing the safety
number, which covers the vault: once a partnership has one, the number is v2,
`SHA-256("bound-up-safety-v2\n" + the two recipients, sorted + "\n" + key check)`.
Without that, a server could make a vault of its own, wrap it to both partners'
public recipients, and be the only party who knew it was not theirs.

Two things about this that look like flaws and are not:

**The blocking is client-side only, necessarily.** The server is the adversary
in this threat model, so it cannot be asked to enforce a warning about itself.
This is _not_ the thing AGENTS.md invariant 14 forbids — that is about a
_permission_ being enforced in the browser, which is still forbidden. There is
no server-side version of this check to have skipped.

**A device that cannot remember keys does not block sending.** The keystore
already falls back to memory when IndexedDB refuses it, so reaching that state
means something more unusual — and refusing to let someone message their partner
because their browser will not persist a pin would be the wrong trade. The UI
says so instead.

## Vaults

A **vault** is one key that a scope's data is sealed under: each user has one
of their own, and each partnership has one the two partners share. It is 32
random bytes, made in the browser, and never used directly. HKDF-SHA256 over
it, each with its own `info` (`src/lib/vault.ts`), gives:

| `info`                      | What it is                                                    |
| --------------------------- | ------------------------------------------------------------- |
| `bound-up-vault-enc-v1`     | The AES-256-GCM key records are sealed with                   |
| `bound-up-vault-check-v1`   | The **key check**: a public fingerprint, stored and pinned    |
| `bound-up-index-v1\|<purpose>` | One HMAC key per blind index — see below                    |

All three are non-extractable `CryptoKey`s. The raw bytes exist only while a
vault is being made or wrapped for someone, and are zeroed straight after;
wrapping for someone later opens the device's own wrap again rather than
keeping the key around.

| Table         | What                                                                          |
| ------------- | ----------------------------------------------------------------------------- |
| `vaults`      | `id` (chosen by the browser), `kind`, the owner or the partnership, `key_check` |
| `vault_wraps` | One per member: the key age-encrypted to their recipient, and which recipient |

A wrap's plaintext is `{ v: 1, vaultId, key }`, and opening one checks both
that it names the vault it was served with and that the key it holds derives
that vault's key check. So a server cannot pair a real wrap with another
vault's row, or a vault row with a key it made up.

**Why a symmetric key, and not a vault public key.** Anyone can encrypt to a
public key, the server included, so a public-key vault would let the server
write a record that opens and validates like a real one. With a symmetric key,
only someone holding it can produce a record that opens. A partner still can,
since they hold the key too, and that is accepted: a partner is someone the
user chose to share this with. The server cannot. It is also cheaper per record than an age header, and
works as a non-extractable key on every browser, not only those with X25519.

**Why one key per scope.** A change of someone's key — a partner-assisted
sign-in — then means re-wrapping one key for them, not re-encrypting
everything in the scope, the same indirection attachments already use with a
key per file.

### Made by the devices, on one path

Nothing creates a vault on the server's side. After sign-in unlocks the
identity, `EncryptionGate` runs `initialiseVaults` (`crypto/vaults.svelte.ts`),
which runs `ensureVaults` (`crypto/ensure-vaults.ts`) over
`GET /api/vaults`:

- **The self vault** is opened, or made if the account has none.
- **Each accepted partnership's vault** is opened, or made — wrapped to both
  members — if the partnership has none. The device that made it pins its key
  check at once, so its first sighting is the real one.
- **A partner whose wrap is missing, or made for a key they no longer have**,
  is wrapped for again (`PUT /api/vaults/[id]/wraps`).

That one path is what covers a new account, a newly linked pair and every
partnership that existed before vaults, with no migration of its own.

**Making or wrapping for a partner waits on the trust check.** Both hand the
vault key to whatever recipient the server says the partner has, so a key this
device has been warned about gets nothing until the user accepts it. Opening a
vault needs no such check — reading leaks nothing — so a vault is open even
while writing into it is held back.

**Two devices racing** to make the same partnership's vault is ordinary: the
unique column refuses the second insert, `POST /api/vaults` answers 409, and the
device that lost lists again and opens the winner's. The vault and its wraps
are written in one `db.batch()`, because a vault nobody can open is worse than
none — the scope could never get another.

**The server checks who may write, nothing else.** A vault is created only by a
member of its scope, with exactly one wrap per member made for the recipient
that member has now (a wrap for an old or made-up recipient is a vault silently
lost to them). A wrap may be added for a member who has none or a stale one,
but one already made for their current recipient can be replaced only by its
owner: such a wrap opens, and replacing it could only break it.

Vault keys are held in memory for the page's life and fetched again on the
next load: a few hundred bytes per vault, opened with one age decryption each.

## Escrow

A partnership's vault survives one partner losing every way in, because the
other partner holds it too and can wrap it for the new key. A user's **own**
vault has nobody else to hold it, so it is held in **escrow**: half by each
partner, half by the server, and opened only with both, after the account
holder proves it is them.

    inner  = AES-256-GCM_share(own vault key),   AAD = "bound-up-escrow-v1|<vault id>|<key check>"
    escrow = age(inner) → the partner's recipient               (vault_escrows, one per partner)
    share  = HMAC-SHA256(auth secret, "vault-escrow|" + escrow id)

- **The partner** can open the outer layer, and gets only `inner`.
- **The server** can compute the share, but cannot open the partner's layer.
- **The share is stored nowhere**: it is derived from the escrow's id under
  the auth secret. The auth secret is a server setting, in the same database
  (docs/server-settings.md), so a stolen database holds the server's half —
  but never the partner's, which is sealed to a key only the partner's
  devices hold, so it still opens nothing. Before the secret moved into the
  database a stolen database held neither half; that extra margin is what was
  given up for a server that needs nothing set up. Regenerating the auth
  secret invalidates every escrow, until each user's next load makes new
  ones.
- **The server hands out a share only for an escrow id that does not exist
  yet** (`issueEscrowShare`) — the moment a device is making one. The share of
  an existing escrow is never handed out outside a recovery, even to the
  account: a stolen session plus a willing partner must not be enough.

`ensureVaults` keeps one escrow per partner, made as soon as the trust check
allows writing for them. **A user with no partner has no escrow**, so losing
every way in loses their own vault: a device that finds it can never be
brought back deletes it and starts a new one (`deleteLostSelfVault`, which the
server allows only when the account holds no wrap for its current key and no
escrow could still be released).

### Getting it back

During a partner-assisted sign-in ([account-recovery.md](account-recovery.md)),
the helping partner's device opens their layer of the requester's escrow and
re-encrypts `inner` to the key on the request — a **relay**
(`vault_escrow_relays`), posted with the vault wrap. It is still sealed under
the share.

After the sign-in completes, the requester's first load finds its own vault
with no wrap for its new key, and asks for the escrow back
(`POST /api/vaults/self/escrow-release`). The server releases each relay with
its share **only** to the account itself, and only for a sign-in that
completed — which took a partner's approval **and** the link emailed to the
account's address — within the last seven days (`ESCROW_RELEASE_WINDOW_MS`).
The device opens the relay with its new key, then `inner` with the share,
checks the result matches the vault's key check, and writes itself a wrap.
Every escrow is then **replaced**, under new ids and so new shares, because the
old shares have been released.

**What this does not protect against**: the server and a partner working
together. Each holds half; together they can open the user's own vault. That
is inherent to splitting a key two ways, and is the price of being able to
recover it at all. Since the auth secret lives in the database, a partner with
a copy of the server's database counts as the server here. Every other
combination — the partner alone, the server's database alone, a stolen
session, the inbox alone — gets nothing.

`crypto/escrow.test.ts` holds a frozen vector for the inner layer, made by an
independent implementation, for the same reason as the others.

## Sealed records

A **sealed record** is a row whose content the server cannot read. It keeps a
plaintext envelope that Drizzle and SQL migrations still manage — its id, its
scope, foreign keys, whatever fields the server acts on, `payload_version` and
`revision` — and one `ciphertext` column for everything else:

    ciphertext = "sb1." + base64url( 12-byte IV ‖ AES-256-GCM(JSON) ‖ 16-byte tag )

under the vault's encryption key, with associated data
`bound-up-sealed-v1|<kind>|<record id>|<vault id>|<payload version>`
(`sealedAad` in `src/lib/sealed.ts`). A ciphertext moved to another row,
another kind or another vault fails its tag check, and so does one whose
plaintext `payload_version` was edited to have it read as an older shape. The
`sb1.` prefix is so a later change of algorithm can tell old ciphertexts apart
without guessing. Record ids are chosen by the browser, because they are part
of what the ciphertext is bound to.

A kind may be **compressed** (`compressed` on `defineSealedKind`): its JSON
is deflated (raw DEFLATE) before it is encrypted, and the ciphertext starts
`sz1.` instead, with the same IV, tag and associated data. Compressing first
lets a ciphertext's length say something about what is in it, so only a
kind whose content the server already handled in plaintext may opt in: a
daydream's exchanges with the model (`daydream-exchange`), which passed
through the server on their way to and from it
([debug-mode.md](debug-mode.md#exchanges)). A kind opens only under its own
prefix, so neither kind can be read as the other.

`crypto/sealed.ts` seals and opens. Sealing takes a **write grant**
(`crypto/write-grant.ts`): for a partnership vault one comes only from
`writeGrantFor` in `crypto/trust.svelte.ts`, which asks the trust check first,
so a write that forgot to ask does not compile. Before vaults, reactions and
embed metadata were written without that check.

### The payload is versioned in code

The server cannot read a payload, so it cannot migrate one either. Each kind
declares every version of its payload it has ever had, with `defineSealedKind`
in `src/lib/sealed.ts`:

- **Writers always write the latest version.**
- **Readers accept every version ever shipped** and upcast, one version at a
  time, validating against each version's Zod schema on the way. Whatever
  comes out of a vault was written by a partner's device or forged, so it is
  parsed, never cast, and a schema that strips undeclared keys is also what
  keeps a record from carrying extra data.
- **A new version's reader usually ships a release before its writer**, so a
  tab still open on the previous build never meets data it cannot read. The
  two may ship in one release when the cost is acceptable: a tab left open on
  the previous build cannot open a record written at the new version until it
  reloads, which the app prompts it to do
  ([versions-and-updates.md](versions-and-updates.md)), and only a record made
  after the deploy is affected. Daydreams' setup v4 (the monologue voice,
  and the scene renamed the idea) shipped this way, since a stale tab
  missing one new daydream costs nothing but a reload.
- **A record read at an older version is written back at the latest**,
  compare-and-swap on `revision`, so a background upgrade can never overwrite
  a newer edit from the other partner.
- **`payload_version` is plaintext** so the server can count records still on
  an old version; an upcaster can go once its count reaches zero.

The server checks a sealed write's size against the kind's cap and its version
against the kinds it knows, and nothing about its content. Validation that used
to happen on the server — lengths, rich-text sanitising — happens in the
browser before sealing and again after opening. That is a policy that has moved
into the browser, like password strength above, and not a permission:
who may write a record is still the server's decision (AGENTS.md invariant 14).

### Showing them

`sealedReader.read(kind, row, vault)` (`src/lib/sealed-cache.svelte.ts`) is
what a template calls. It answers at once — `undefined` while working or
before the vault is open, `null` for anything that will not open, the payload
otherwise — and the answer updates when the open lands. That keeps the rule
that nothing encrypted renders before the keyring is `unlocked`, by
construction: there is no vault before then. Results are cached per record and
ciphertext, and cleared on sign-out.

### Blind indexes

Uniqueness on something the server cannot read is kept with a **blind index**:
`HMAC-SHA256(indexKey, normalised value)`, at full length, in a plaintext
column the unique constraint covers (`blindIndex` in `crypto/vault.ts`). The
key is derived per vault and per purpose, so equal values in two partnerships,
or two fields, never share an index. What it reveals is what the constraint
needs: that two values in one scope are equal. Normalisation happens before
hashing, because afterwards nothing can.

### Frozen vectors

`crypto/vault.test.ts` and `crypto/sealed.test.ts` hold vectors made by an
independent implementation on `node:crypto`: the key check, a blind index and a
sealed record. Like the KDF's, they are the tests that matter most: every vault
and record ever stored was made with these formats, and a drift would fail
nowhere locally — existing data would simply stop opening. Never regenerate
them to make a failure go away.

## Not built yet

The honest boundary of the above:

- **Pins do not survive a new device.** They live in IndexedDB, per device, so a
  new phone trusts what it is first told and a device change is
  indistinguishable from a substitution until the number is compared again.
  `user_keys.sealed_pins` — the pin list age-encrypted to your own recipient —
  would fix it and is not built. Until then the UI shows _when_ a key was first
  seen, so "first seen a moment ago" cannot be mistaken for "first seen two
  years ago".
- **Only one direction arrives out of band.** The invitee learns the inviter's
  recipient from the invite itself, sealed under the key in the link's
  fragment, and pins it as verified — no trust-on-first-use for that direction
  ([docs/partners.md](partners.md#names-are-sealed)). The inviter still learns
  the invitee's recipient from the server the first time, as before, until the
  safety number is compared.
