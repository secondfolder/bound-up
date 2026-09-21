# Passkeys

A passkey in this app does two jobs. It signs you in, and — if its provider
will co-operate — it unlocks your encrypted message history with a touch
instead of your password. The second job is the interesting one, and it is not
something every passkey can do.

The keys themselves, the wraps and what the encryption guarantees are in
[docs/encryption.md](encryption.md). This document is about the credential: how
one is created, how the app finds out what it can do, what it is called, and
what each screen says when the answer is disappointing.

## Adding one

`AddPasskeyFlow.svelte` owns the whole sequence, and both entry points use it —
Security and Encrypted messages. It used to be two implementations of one job,
and they drifted far enough apart that only one of them ever checked PRF.

1. **The password, in a dialog.** Asked for two reasons at once, and the copy
   says both.
2. **Prove it, twice.** Locally, by opening the stored password wrap — a wrong
   password fails its AES-GCM tag on the device, with no round trip, so it is
   answered instantly and tells a watcher nothing. Then on the server, via
   `POST /api/keys/verify-password`.
3. **Register.** `authClient.passkey.addPasskey({ returnWebAuthnResponse: true })`.
4. **Seal.** The identity is encrypted to the new credential, which is a real
   PRF evaluation and the only honest test of whether it works.
5. **Record.** `POST /api/keys/passkey-enrolled` stores the verdict and, if
   there is one, the wrap.
6. **Name it**, in a second dialog, pre-filled from the provider.

### Why the password is asked for

**It is a re-authentication.** The new credential signs in on its own
afterwards, so a session someone walked away from should not be enough to mint
one. That check is on the server (invariant 14), not only in the browser.

**It is the only route to the identity.** Sealing needs the age secret as a
_string_, and this device's cache holds a non-extractable `CryptoKey` that no
API turns back into one. Opening a password wrap is the only way to get it —
with the happy side effect that adding a way in requires proving you already
have one.

### Why the order cannot change

Verify, then register, then seal. Registering first would leave a stray passkey
behind every mistyped password — a credential the user did not mean to create,
on a screen that had just told them they got something wrong.

### A passkey-only account

An account with no password credential is necessarily an account with no
message keys, because `/settings/encryption` is the only way to get them and it
sets a password on the way through. So that flow skips the prompt entirely,
registers, and records the verdict from the registration flag alone.

## Working out whether it can unlock messages

**The registration flag is a hint, never the verdict.**
`clientExtensionResults.prf.enabled` says what the provider claims at creation
time, and providers disagree with themselves in both directions:

- Samsung Pass and KeePassXC report `enabled: false` at creation and then return
  PRF output perfectly well at assertion.
- Microsoft Password Manager does the reverse — fine at creation, then
  `NotAllowedError` every time it is used.

So a `false` flag does not stop the flow. It only changes what the progress text
says while a real seal is attempted anyway. `verdictFor` in
`src/lib/crypto/passkey-enrolment.ts` turns the outcome into what gets stored:

| Outcome                                              | Recorded      |
| ---------------------------------------------------- | ------------- |
| The seal worked                                      | `supported`   |
| The credential answered, without PRF output          | `unsupported` |
| The ceremony was dismissed, or failed some other way | **nothing**   |
| No identity to seal, and the flag said `false`       | `unsupported` |
| No identity to seal, and the flag said `true`        | **nothing**   |

The two "nothing" rows are the point. A dismissed Face ID sheet is not evidence
about the credential, and recording `unsupported` for it would brand a working
passkey with a warning it could never shake off. Equally, a provider claiming
`enabled` has not proved anything, so that is not written down as a promise
either.

**Absence of a row is a third state**, and it must never render as a warning.
Every passkey registered before this check existed is in it.

## The credential binding

`wrapIdentityToPasskey` can pin the ceremony to one credential, via age's own
`AGE-PLUGIN-FIDO2PRF-1…` identity string. Without it, `allowCredentials` is
empty and the platform opens a chooser — which seconds after creating a passkey
is a confusing second prompt, and which makes "which passkey does this wrap
belong to" unanswerable, because the user may well pick a different one.

`age-encryption` builds those strings in `createCredential()` and exports
neither that encoder nor a way to get one for a credential Better Auth
registered, so `encodeAgeCredentialIdentity` in `src/lib/crypto/passkey.ts`
reproduces the encoding: bech32 over CTAP2-flavoured CBOR of version,
credential id, rp id and transports.

Depending on a private format is normally a bad idea. Two things make it safe
here: `age-encryption` is pinned to an exact version precisely because
`age.webauthn` is experimental, so the format cannot move without a deliberate
bump; and `passkey.test.ts` holds a frozen vector _and_ round-trips the result
through age's own decoder, so a bump that did change it fails in CI rather than
on someone's phone.

`params.ageIdentity` and `params.passkeyId` are both optional. Wraps written
before this existed have neither and still open through the chooser, and wraps
written by `PasskeyOffer` — which seals to whichever passkey the user picks —
deliberately have neither.

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
so the copy cannot drift silently.

**Apple zeroes the AAGUID** under the default `attestation: "none"`, which is
the flow this app uses. So the single most common passkey in existence resolves
to no provider at all, and every caller has an answer for `null` — the name
falls back to `navigator.platform`, and the copy that would have named a
provider says "the password manager holding it" instead. Asking for attestation
to get a real value would put a consent prompt in front of every registration
to improve a default label, which is not a trade worth making.

## Which providers can do this

Surveyed September 2026, and kept in `PRF_PROVIDERS` so the copy has one
source. This table is **never** used to decide anything — the verdict for a real
credential always comes from actually trying it. It is there so someone whose
passkey just failed knows where to put the next one.

| Provider                          | PRF for third-party sites                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| Apple Passwords / iCloud Keychain | Yes                                                                                |
| Google Password Manager           | Yes, every GPM passkey                                                             |
| Windows Hello                     | Yes, with the February 2026 Windows 11 update and Chrome/Edge 147+ or Firefox 148+ |
| 1Password                         | Yes — extension, Android, iOS 18                                                   |
| Proton Pass                       | Yes                                                                                |
| Keeper                            | Yes                                                                                |
| Enpass                            | Yes, despite its capability flags saying otherwise                                 |
| Bitwarden                         | Platform-dependent — Linux with Firefox yes, iOS and Safari no                     |
| KeePassXC                         | Usually refuses at creation, then works                                            |
| Samsung Pass                      | Says no at creation, then works                                                    |
| Microsoft Password Manager        | Accepts at creation, then refuses every unlock                                     |
| Dashlane                          | No — uses PRF for its own vault, does not offer it to other sites                  |
| NordPass                          | No                                                                                 |

Three constraints that are nothing to do with the provider:

- **PRF must be requested at credential creation.** A passkey registered before
  this feature existed can never do PRF and cannot be upgraded.
- **iOS and iPadOS cannot pass PRF to an external authenticator.** A security
  key on an iPhone will not work; platform passkeys do.
- **PRF needs iOS 18+, macOS 15+ or Chrome 132+.**

## What each screen says

**Security** lists every passkey with its provider, and a badge:

- `unsupported` → "Cannot unlock your messages", the reason, and the provider
  list. Persistent, so it is still answerable tomorrow rather than only in the
  moment the passkey was created.
- `supported` → "Unlocks your messages".
- no verdict → nothing at all.

**The unlock panel** (`UnlockPanel.svelte`) is the one unlock form, used by the
app-shell callout, the messaging board, a thread, and Encrypted messages.
Before it there were four, and two of them passed no passkey callback at all —
so the screens a locked device is most likely to be found on were the ones with
no passkey button. `unlockMode` in `src/lib/passkey-unlock.ts` is pure and
decides which of four shapes it takes:

| Mode                | When                                                       | What it shows                                                                                                    |
| ------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `passkey-ready`     | a `webauthn-prf` wrap exists                               | the passkey button, and the password behind a **button** — someone who set up a passkey did so to stop typing it |
| `passkeys-unusable` | passkeys exist and **every one** has been tried and failed | the explanation, naming the provider where it can, and the password field straight away                          |
| `offer-setup`       | no wrap, and something might still work                    | the password field plus "set up a passkey"                                                                       |
| `password-only`     | this browser has no WebAuthn                               | the password field alone                                                                                         |

`passkeys-unusable` needs _every_ passkey to have failed. One unverdicted
passkey drops it to `offer-setup`, because a passkey registered before the check
existed might work perfectly well.

**Why `offer-setup` does not offer passkey _unlock_.** With no wrap there is
nothing to open, and with no passkey at all the platform opens a chooser with
nothing in it and reports that as a plain `NotAllowedError` — the same error a
dismissal gives, deliberately, so a page cannot learn which credentials exist.
The button would appear to do nothing and could not explain itself. It offers to
_create_ one instead, which needs the password first, because a locked device
has no identity to seal.

## Two things that are easy to break

**The unlock panel must outlive the unlock.** Unlocking flips the keyring, and a
caller that wraps `<MessageUnlock>` in its own `{#if locked}` unmounts it — and
the add-a-passkey dialogs with it — while "unlock, then set up a passkey" is
still half way through. So the chrome goes in through a snippet, and the
messaging screens additionally hold the branch open via `onFlowOpen` while a
ceremony is running.

**`lock()` leaves the keyring at `unknown`, not `locked`**, because what the
device can do next depends on what the account still has. `EncryptionGate`
re-asks whenever the status goes back to `unknown`. Without that re-ask the
status stayed `unknown` for the rest of the session, and two things broke:
`/settings/encryption` showed no panel at all after "Lock on this device", and —
worse — the messaging board fell through to rendering itself, every thread
preview and every message showing "…" where the plaintext should be. Every
screen that switches on the status therefore has an explicit `unknown` branch
that renders a placeholder, never content.
