# Security review: current `main`, end-to-end encryption and user accounts

The plan for this change was the security review below, asked for as "make the
suggested changes": the three findings and the below-the-bar notes, each with
its recommendation. Kept as it was reported on 2026-10-22.

**Scope:** the whole current code base, not a diff. Four reviewers each covered
one area: client-side encryption, accounts and authentication, server-side
checks on sealed data, and partners and messaging. Every finding was then
re-checked on its own, and any scoring below 8/10 confidence was dropped.

**Threat model:** for end-to-end encryption the server is treated as the
adversary, as `docs/encryption.md` does. A server serving modified JavaScript
is already out of scope there, so all three findings below assume a server
that substitutes _data_ while running the honest code.

## Vuln 1: Wrapping to an own key the server chose: `src/lib/crypto/ensure-vaults.ts:302`

- **Severity:** High (confidence 9/10). It silently breaks the end-to-end
  guarantee for a whole partnership.
- **Category:** `crypto_key_substitution`
- **Description:**
  - When a device creates a partnership vault, it wraps its own copy of the
    key with `wrapFor(recipients.mine, userId)`.
  - `recipients.mine` comes straight from the server's `GET /api/vaults`
    response (`src/lib/server/vaults.ts:169-170`). It is never compared with
    the device's own `identity.recipient`, which the device knows for certain.
  - The only identity check, at `ensure-vaults.ts:132`, compares the top-level
    `listing.recipient`, not each partnership's `recipients.mine`.
  - The own-key pin also trusts whatever it sees first, even though the device
    knows the true value: `pins.ts:204` and `:225-226` store `served.mine` when
    the state is `new`, and `pinBlocksSending` (`encryption.ts:464`) only
    blocks `changed`.
- **Exploit scenario:**
  1. Alice accepts Bob's invite. Her device marks Bob's key as verified from
     the invite link.
  2. On her device's first run of `ensureVaults`, the server sends her real key
     as `listing.recipient`, so the check at `:132` passes. For that
     partnership it sends `recipients.mine` as the attacker's key.
  3. Her device creates the vault, wraps the vault key to the attacker's key,
     and pins the attacker's key as her own.
  4. The server decrypts that wrap and now holds the vault key. It can read
     every message, tag, task, reward and name in the partnership,
     permanently, because vaults are never rotated.
  5. Nothing looks wrong. Bob's device re-wraps the key for Alice's real key.
  - The safety number would expose it, but `PartnerKeyNotice.svelte:165` hides
    it when the partner shows as verified, so Alice is never shown a number to
    compare.
  - `docs/encryption.md` (around lines 486 and 775-781) does not describe this.
    It says the invitee side has "no trust-on-first-use", which this
    contradicts.
- **Recommendation:**
  - Wrap the creator's copy to `identity.recipient`.
  - Refuse any partnership entry whose `recipients.mine !== identity.recipient`,
    the way a `StaleIdentityError` is handled.
  - Fill the `'self'` pin from the local identity rather than from
    `served.mine`, so a mismatch shows as `changed`, not `new`.
  - Add a test in `ensure-vaults.test.ts` where `recipients.mine` is a
    different key, and update the docs.

## Vuln 2: Server-planted self vault: `src/lib/crypto/ensure-vaults.ts:149-162`

- **Severity:** Medium (confidence 8/10)
- **Category:** `crypto_missing_authentication`
- **Description:**
  - A vault wrap is plain age encryption to the user's public recipient, which
    the server stores in `user_keys` (`src/lib/crypto/vault.ts:105-115`). age
    does not prove who encrypted something.
  - `unwrapVaultKey` (`vault.ts:127-157`) only checks the `vaultId` and the
    `keyCheck`, and the server supplies both.
  - Partnership vaults are pinned, but the self vault never is. The self branch
    never calls `trustAllows`, and `selfWriteGrant` (`write-grant.ts:41-46`)
    grants writing with no check at all.
- **Exploit scenario:**
  1. The server picks a key K and computes
     `keyCheck = HKDF(K, "bound-up-vault-check-v1")`.
  2. It age-encrypts `{v:1, vaultId:X, key:K}` to the user's recipient and
     returns that as `listing.self`. For a new account it can do this from the
     very first request, or by answering the client's `POST /api/vaults` with a
     409.
  3. From then on every self-sealed record can be read by the server: self
     tasks and rewards, daydream setups and turns, the daydream library and
     the kink list. The server can also forge records that pass validation.
  - On an existing account the old records quietly show as "Can't be shown on
    this device". No warning appears and writing is not blocked.
  - This is not a documented gap. The claims in `docs/encryption.md` (around
    lines 541-545) and `vault.ts:122-125` that a server cannot pair a vault
    with a key it made up are wrong for the self vault.
- **Recommendation:**
  - Authenticate the self-vault wrap with a secret the server never sees: for
    example an inner AES-GCM layer or an HMAC over `{vaultId, keyCheck}`, keyed
    by `HKDF(wrapKey, "bound-up-self-vault-v1")`. Keep the escrow recovery path
    working.
  - As a cheaper stopgap, pin the self vault's id and `keyCheck` per device, so
    a change blocks writes and shows a warning.
  - Correct the docs and comments.

## Vuln 3: Sealing endpoint ignores `control`: `src/lib/server/content-sealing.ts:96-104`, `:489-512`

- **Severity:** Low (confidence 9/10 that the bypass exists). It is included
  only because it breaks the server-side permission that AGENTS.md invariant
  14 promises.
- **Category:** `authorization_bypass`
- **Description:**
  - `POST /api/sealing/[scope]` (`sealUnsealedContent`) only checks
    `isPartnershipMember` for a partnership. It never calls
    `canEditPartnership`.
  - The names write matches any partnership that is `accepted` with
    `names_ciphertext IS NULL`, and every new partnership is in that state
    right after its invite is accepted.
- **Exploit scenario:**
  1. A partner who was given read-only access accepts the invite, creates the
     partnership vault, and posts their own names and roles sealed under it.
  2. The server stores them. Both partners now see those labels, and the
     controller's device later finds nothing left to seal.
  - Legacy partnership tasks and rewards that are still plaintext can likewise
    be overwritten once.
  - The controller can see the change and undo it.
- **Recommendation:**
  - For partnership scopes, leave out the names and the legacy task and reward
    rows unless `canEditPartnership(row, actorId)`.
  - Add a server test for a read-only partner posting names.
  - Correct `docs/partners.md` (lines 58-63 and 83-87).

## Below the bar (dropped by the filter, worth knowing)

- **Sign-up timing through `POST /api/auth/sign-up/email`** (confidence 6/10).
  The 1500 ms floor only covers the form action, so the raw Better Auth
  endpoint is reachable and an address that already has an account answers
  faster.
  - Each address gives only one timing sample, and every probe emails the
    target.
  - **Side effect:** a probe leaves an unverified account with no encryption
    keys, which blocks that address's real owner from signing up later.
  - **Fix:** add `disabledPaths: ['/sign-up/email']` to the Better Auth options
    in `src/lib/server/auth.ts`. The form action calls it in-process, so it
    keeps working.
- **The invite link key comes from a wrap the server supplies** (confidence
  0.6). This is the same root cause as Vuln 2.
- **Rich-text link URLs are not checked for their scheme**
  (`src/lib/richtext.ts:128-131`), so a partner could plant a `javascript:`
  link. It is partner-only and opens with `noopener`.
- **Starting a recovery has no response floor.** It does one extra database
  read when the account exists, and it is rate-limited.
