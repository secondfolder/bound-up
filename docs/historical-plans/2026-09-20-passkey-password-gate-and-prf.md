# Plan — password-gated passkey creation, PRF detection, and one unlock form

## Goal

1. Adding a passkey asks for the account password first. The password both
   re-authenticates and yields the message identity, so the new passkey is
   sealed for message unlock in the same flow.
2. The registration response says whether the credential can do PRF. If it
   cannot, say so — at creation, and afterwards next to that passkey in the
   Security list.
3. One unlock component, used by the app-shell callout and by the messaging
   screens, with four states driven by what the account actually has.
4. Name the passkey in a dialog, pre-filled from the provider's AAGUID.

## What already exists (do not rebuild)

- `src/lib/crypto/passkey.ts` — `wrapIdentityToPasskey`, `unwrapIdentityWithPasskey`,
  `describePasskeyFailure` (already distinguishes `no-prf`).
- `src/lib/crypto/setup.ts` — `openIdentityWithPassword` returns
  `{ identity, master }`, which is exactly the two things this flow needs.
- `/settings/encryption?/addWrap` — validates and stores an opaque wrap.
- `PasskeyOffer.svelte` — the free, password-less offer right after an unlock.
  Stays as is; it is a different moment.
- `e2e/passkey.spec.ts` — CDP virtual authenticator with `hasPrf` on/off.
- Better Auth 1.7.5 already stores `passkey.aaguid`, returns it from
  `listPasskeys` **and from `addPasskey`**, and exports
  `getAuthenticatorName(aaguid)` from `@better-auth/passkey` (server entry).
- `authClient.passkey.addPasskey({ returnWebAuthnResponse: true })` returns
  `webauthn.clientExtensionResults` — which carries `prf.enabled`.
- `authClient.passkey.updatePasskey({ id, name })` exists.

## Research findings

### WebAuthn PRF support by provider (as of Aug–Sep 2026)

| Provider | PRF for third-party sites |
| --- | --- |
| Apple Passwords / iCloud Keychain | Yes, macOS + iOS, all major browsers |
| Google Password Manager | Yes, every GPM passkey, all platforms |
| Windows Hello | Yes — needs the Feb 2026 Windows 11 24H2/25H2 update and Chrome/Edge 147+ or Firefox 148+ |
| 1Password | Yes — extension, Android, iOS 18 |
| Proton Pass | Yes |
| Keeper | Yes |
| Enpass | Yes (despite its capability flags saying otherwise) |
| Bitwarden | Partial and platform-dependent — good on Linux/Firefox, poor on Android, none on iOS/Safari or macOS/Chrome |
| KeePassXC | Partial — usually fails at *creation*, usually works at assertion |
| Samsung Pass | Partial — nothing at creation, values at assertion |
| Microsoft Password Manager | Partial — creation works, assertion fails with `NotAllowedError` |
| Dashlane | No — uses PRF internally for its own vault, returns nothing to third-party sites |
| NordPass | No — returns `prf.enabled: false` |

The partial row is why the flow must not trust `prf.enabled` alone — see
"Deciding the verdict" below.

### AAGUID → provider name

- Community source: `passkeydeveloper/passkey-authenticator-aaguids`.
- Better Auth already vendors a 14-entry subset and exports
  `getAuthenticatorName`. It is on the **server** entry, so it is resolved in
  `load` rather than imported into the browser bundle.
- **Apple zeroes the AAGUID** under the default `attestation: "none"`, so
  iCloud Keychain passkeys resolve to nothing. The name dialog needs a
  non-AAGUID fallback; this is a limitation to state, not a bug to fix.

## Decisions taken (flagged for review)

**D1 — Bind the seal ceremony to the credential just created.**
`wrapIdentityToPasskey` currently passes only `rpId`, so the platform opens a
picker. Right after registering a passkey that is a confusing second chooser,
and it makes "which passkey does this wrap belong to" unanswerable. age accepts
an `identity` string (`AGE-PLUGIN-FIDO2PRF-1…`, bech32 of CBOR: version,
credential id, rp id, transports) that pins `allowCredentials`. The encoder is
not exported by `age-encryption`, so a ~30-line `encodeFido2PrfIdentity` goes in
`src/lib/crypto/passkey.ts` using `@scure/base` (already a direct dependency),
with a frozen test vector. `age-encryption` is pinned exactly, so the format
cannot move underneath us.
*Fallback if it proves fragile:* drop it, keep the empty-`allowCredentials`
picker, and drop `passkeyId` from the wrap params. Nothing else in the plan
depends on it.

**D2 — Account with no message keys yet.** Verify the password, register the
passkey, record the PRF verdict, write no wrap. The name dialog says the passkey
will be usable for messages once messaging is turned on. (An account with no
password at all — `hasPassword === false` — is necessarily an account with no
message keys, because `/settings/encryption` is the only way to get keys and it
sets a password. That path skips the password prompt entirely.)

**D3 — "Set up passkey unlock" from the unlock screen.** The device is locked,
so there is no identity to seal; the password is unavoidable. The button
therefore reveals the password field with its own copy, and on a successful
unlock runs registration + seal + the name dialog straight away.

## Phases

### Phase 1 — Provider metadata (pure, no UI)

New `src/lib/passkey-providers.ts`, alias-free and pure:

```ts
export type PrfSupport = 'full' | 'partial' | 'none';
export type PasskeyProvider = { name: string; prf: PrfSupport; note?: string };
export function providerForAaguid(aaguid: string | null): PasskeyProvider | null;
export const PRF_PROVIDERS: readonly { name: string; prf: PrfSupport; note?: string }[];
```

- `PRF_PROVIDERS` is the table above, and is what the warning dialog renders, so
  the copy has one source.
- `providerForAaguid` maps the AAGUID subset onto it; all-zero and unknown
  return null.
- Tests (`passkey-providers.test.ts`, node project): every AAGUID Better Auth
  knows resolves here to the same name — the test imports
  `getAuthenticatorName` from `@better-auth/passkey` so the local table cannot
  silently drift from upstream. Plus all-zero → null.

### Phase 2 — Storage for the verdict

New table in `src/lib/server/db/schema/app.ts`:

```
passkeyPrfStatus
  id           text pk, crypto.randomUUID()
  passkeyId    text not null unique, references passkey.id on delete cascade
  status       text not null           -- 'supported' | 'unsupported'
  aaguid       text                    -- as seen at registration, for support answers
  timestamps
```

A row is absent for passkeys registered before this change — that is the third
state ("unknown"), and the Security page must render it as "not checked" rather
than as a warning.

`params` for a `webauthn-prf` wrap gains an optional
`passkeyId` and `identity` (the `AGE-PLUGIN-FIDO2PRF-1…` string) in
`src/lib/encryption.ts`. Both optional: existing wraps have neither, and
`unwrapIdentityWithPasskey` falls back to the rpId picker when `identity` is
absent.

`src/lib/server/keys.ts` gains `setPasskeyPrfStatus(db, userId, passkeyId, …)`
and `listPasskeyPrfStatus(db, userId)`. `UnlockBundleView` gains
`passkeysWithoutUnlock: number` and keeps `hasPasskeys`, so the unlock panel can
tell "no passkeys" from "passkeys, none usable".

Migration: `npx drizzle-kit generate --name add_passkey_prf_status`, then read
the SQL before committing. Never `push`.

### Phase 3 — The add-passkey flow

New `src/lib/components/AddPasskeyFlow.svelte`, owning both dialogs and the
whole sequence. Used by Security; also reachable from the unlock panel (D3) and
from `/settings/encryption`.

Sequence:

1. **Dialog A — password.** `<wa-dialog>` with a `PasswordField`. Copy explains
   both reasons: confirming it is you, and unlocking the message key so the
   passkey can open messages too. Skipped when `hasPassword === false`.
2. **Verify locally, then server-side.**
   - If the account has message keys: `openIdentityWithPassword(...)` — a wrong
     password fails its AES-GCM tag here, on the device, with no round trip.
   - Server-side proof regardless, because invariant 14 forbids a
     browser-only gate: derive `authSecret` and post it to a new
     `?/verifyPassword` action that does the no-op `changePassword` this repo
     already uses as its "is this the current password?" primitive (see the
     comment in `encryption/+page.server.ts`). Returns 400 on `INVALID_PASSWORD`.
3. **Register.** `authClient.passkey.addPasskey({ returnWebAuthnResponse: true })`.
   Take `aaguid` from `res.data` and `prf.enabled` from
   `res.webauthn.clientExtensionResults`.
4. **Deciding the verdict.** `prf.enabled === true` → attempt the seal.
   `prf.enabled === false` → **still attempt the seal once**, because Samsung
   Pass and KeePassXC report false at creation and work at assertion. The
   recorded verdict is the seal's outcome; `enabled` is only a hint that decides
   whether the UI says "checking" first. If the account has no message keys
   (D2), the verdict falls back to `enabled` alone and the row is marked
   `unsupported` only when `enabled === false`.
5. **Seal.** `wrapIdentityToPasskey({ identity, rpId, credentialId })` bound to
   the new credential (D1), then post to `/settings/encryption?/addWrap` with
   `params = { type: 'webauthn-prf', version: 1, rpId, passkeyId, identity }`.
6. **Record.** New `?/recordPrfStatus` action writes the `passkeyPrfStatus` row.
7. **Dialog B — name and result.** Pre-filled with
   `providerName ?? navigator.platform ?? 'Passkey'`, where `providerName` comes
   from the server-resolved AAGUID name in the action's response. Above the
   field, one of:
   - success: "This passkey can also unlock your messages."
   - failure: the PRF warning — "<Provider> can store this passkey and sign you
     in with it, but it cannot unlock your encrypted messages…", followed by the
     `PRF_PROVIDERS` table so the user can pick a manager that works, and the
     line that they can still unlock with their password. Names the provider
     when the AAGUID resolved, generic otherwise.
   Confirm → `authClient.passkey.updatePasskey({ id, name })` → `invalidateAll()`.
   Dismissing keeps the fallback name; nothing is lost.

Failures never leave a half state: a dismissed registration aborts with nothing
written; a failed seal still leaves a working sign-in passkey plus an
`unsupported` row, which is exactly what the Security warning is for.

### Phase 4 — Security page

- `load` joins `listPasskeys` with `listPasskeyPrfStatus` and resolves
  `getAuthenticatorName(aaguid)` on the server (keeps the plugin out of the
  browser bundle).
- "Add a passkey" opens `AddPasskeyFlow` instead of calling `addPasskey` directly.
- Each list row shows the provider name as a subtitle, and for
  `status === 'unsupported'` a `<wa-tag variant="warning">` reading "Can't
  unlock messages", with a `<wa-tooltip>`/details giving the reason and pointing
  at the password. `status` absent → no badge (registered before this check).

### Phase 5 — One unlock component

Replace `UnlockForm.svelte` with `UnlockPanel.svelte`, used by
`EncryptionGate.svelte`, `/partner/[id]/messages/+page.svelte`,
`/partner/[id]/messages/[threadId]/+page.svelte` and
`/settings/encryption/+page.svelte`. Today the two messaging pages pass no
`passkeyUnlock` at all, so passkey unlock is silently unavailable there — that
drift is the bug this phase fixes.

Mode is a pure function in `src/lib/passkey-unlock.ts` so it is testable without
a DOM:

```ts
export type UnlockMode = 'passkey-ready' | 'passkeys-unusable' | 'no-passkeys' | 'password-only';
export function unlockMode(input: {
  hasPasskeyWrap: boolean; hasPasskeys: boolean;
  passkeysAvailable: boolean; passkeysWithoutUnlock: number;
}): UnlockMode;
```

| Mode | Rendering |
| --- | --- |
| `passkey-ready` | "Unlock with a passkey" (brand) + "Use your password" **button**; the button reveals the `PasswordField` |
| `passkeys-unusable` | Explanation that the manager holding their passkey cannot unlock messages, naming the provider when known, + the password **field** shown directly |
| `no-passkeys` | Password field + "Set up passkey unlock" secondary button (D3): reveals/focuses the field, and on a successful unlock runs `AddPasskeyFlow` from step 3 — the identity is in hand, so no second password prompt |
| `password-only` | Password field alone (no WebAuthn in this browser) |

`willRepeat`, `wrongPassword`, `busyLabel`, `submitLabel` and
`describePasskeyFailure` handling carry over unchanged.

`/settings/encryption`'s own "Add a passkey" section collapses onto
`AddPasskeyFlow` too, so there is one code path for "make a passkey that can
open messages" and one for "seal an existing one" (`PasskeyOffer`).

### Phase 6 — Tests

**Pure (node)**
- `passkey-providers.test.ts` — AAGUID mapping, agreement with Better Auth's
  table, all-zero → null.
- `passkey-unlock.test.ts` — every `unlockMode` combination, including
  `hasPasskeys && !hasPasskeyWrap` vs `!hasPasskeys`.
- `passkey.test.ts` — `encodeFido2PrfIdentity` against a frozen vector, and that
  `new age.webauthn.WebAuthnIdentity({ identity })` accepts it.

**Server**
- `settings/security/page.server.test.ts` — `load` returns each passkey with its
  PRF status and resolved provider name; `recordPrfStatus` is scoped to the
  owner and is idempotent; `verifyPassword` returns 400 on a wrong secret.
- `settings/encryption/page.server.test.ts` — `addWrap` accepts params carrying
  `passkeyId` and `identity`, and still accepts params without them.

**Component (jsdom)**
- `UnlockPanel.svelte.test.ts` — one case per mode: which buttons exist, that
  the password field is hidden until the password button is pressed in
  `passkey-ready`, and that `passkeys-unusable` names the provider.
- `AddPasskeyFlow.svelte.test.ts` — through a wrapper, with the ceremony
  injected: the name dialog pre-fills from the provider name, and the warning
  body lists the providers.

**End to end** (`e2e/passkey.spec.ts`, CDP virtual authenticator)
- Add-passkey asks for the password; a wrong one refuses and registers nothing.
- `hasPrf: true` — name dialog pre-filled, renamed passkey appears in the list,
  wrap count goes 1 → 2, and a later cold device unlocks with the passkey.
- `hasPrf: false` — warning dialog names the provider and lists the managers,
  the passkey is still created and still signs in, the Security row carries the
  "Can't unlock messages" badge, and no wrap was written.
- Unlock panel, `passkey-ready`: passkey button plus a password *button*, and
  the field appears only after pressing it — asserted on the messaging page
  **and** on the app-shell callout, so the shared component is proven shared.
- Unlock panel, `passkeys-unusable`: the explanation renders and the field is
  shown directly.
- Unlock panel, `no-passkeys`: "Set up passkey unlock" creates a passkey and
  seals it in one password entry.

### Phase 7 — Documentation

- **New `docs/passkeys.md`** — registration, the password gate and why, PRF
  detection and the create-vs-assert discrepancy, the provider table, AAGUID
  naming and Apple's zeroed AAGUID, and the per-passkey states. Added to the
  table in AGENTS.md.
- **`docs/encryption.md`** — rewrite the "Passkey unlock" section for the new
  enrolment path, cross-link `docs/passkeys.md`. **Also delete the stale
  "Passkey unlock" bullet under "Not built yet"**, which claims nothing derives
  from PRF and no `webauthn-prf` wrap is ever written; both have been false
  since `2026-09-20-device-seal-and-passkey-unlock`.
- **`AGENTS.md`** — note that `UnlockPanel` is the only unlock form and that a
  second one is drift; add the `docs/passkeys.md` row.
- **`docs/historical-plans/2026-09-20-passkey-password-gate-and-prf.md`** — an
  exact copy of this plan, as part of done.

## Verification

`npm run check` (0/0), `npm run lint`, `npm test`, `npm run test:e2e`, and
`npm run preview` with a real page load — the last because Phase 1 adds a module
that both the browser and the server graph touch, and Lit/`node` condition
breakage there only shows under the real Workers runtime.
