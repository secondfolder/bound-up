# Partner-assisted sign-in

How someone who has lost every way into their account — their password and
every passkey — gets back in, with a partner vouching for them. The history
half of it, the re-encryption, is in [docs/messaging.md](messaging.md); the
keys themselves are in [docs/encryption.md](encryption.md).

There is no password reset by email. The password is turned into a key in the
browser and the server never sees it (docs/encryption.md), so an emailed reset
link could set a new password but could not bring back the key that decrypts
the user's messages — the password was the only thing that could open it. A
partner can: every message in a partnership is encrypted to both people, so the
other one can re-encrypt it to a new key.

## The flow

**Starting — `/login/recover`, no session.** The login page links to it as
"Forgot password". The person enters their email and a new password. Their
browser makes a brand-new identity and seals it under the new password — the
same `buildIdentitySubmission` signup uses — and posts the email, the new
public key and the new password wrap to `POST /api/account-recovery`. It gets
back a random **token**, and keeps it, the new identity and the new password's
derived `authSecret` in the page's memory only. Nothing is stored in the
browser, so reloading starts again; the alternative would be a login credential
sitting in browser storage.

The server stores an `account_recovery_requests` row and opens a
`history_restore_requests` row in **each** of the account's partnerships, all
carrying the new public key.

**The code.** The requester's page shows a code derived from the new public
key (`recoveryCode` in `crypto/fingerprint.ts`, formatted like the safety
number) and asks them to read it to their partner **somewhere other than this
app**. It then polls `POST /api/account-recovery/status` with the token.

**Approving — any partner, signed in.** The app shell shows "{name} can't sign
in and asked for your help" on every screen, because someone who cannot get
into their account has no way to message you about it. It links to the
messages board, where `RestoreRequests.svelte` shows the same code, computed
from the public key snapshotted on the request. If it matches, the partner
confirms, and their device re-encrypts the history the two of them share to
the new key (docs/messaging.md). The **final page of that re-encryption
approves the sign-in**. The partner's device also remembers the new key as
vouched for — comparing the code is the same assurance as comparing a safety
number — so when the server starts serving it, it is accepted as verified with
no "key changed" warning. Only on that device: another of the partner's devices
never saw the code, so it still warns.

"It doesn't match" declines. When every partner who was asked has declined, the
requester's page says so.

**Completing — authorised by the token.** Once the status is `approved`, the
requester's page posts the token and the new password's `authSecret` to
`POST /api/account-recovery/complete`. In one `db.batch()` the server:

- swaps `user_keys` to the new public key;
- deletes every old wrap and stores the new password wrap;
- **deletes every passkey** — none can open the new key, and one left behind
  would sign in to a device that could never get its key;
- sets the password credential to Better Auth's own hash of the `authSecret`
  (`setPasswordHashStatement` in `server/credentials.ts`), so sign-in verifies
  it like any other;
- **deletes every session**, which signs out whoever has the lost devices;
- marks the request `completed`.

The page then signs in with Better Auth's ordinary email sign-in, stashes the
new identity the way signup does, and lands on `/home` with the key in hand.

**More than one partner.** Every partner is asked, and whichever finishes first
approves the sign-in. The others' requests stay open, and each re-encrypts
their own partnership's history when they get to it; until they do, the
requester's board with them says their older messages are still on their way,
and the partner's copy notes that someone else already approved the sign-in —
and still asks them to check the code with the requester themselves.

A device that still had the old key cached finds the server serving a
different public key the next time it loads, drops the stale key, and is sent
to sign in again (`initialiseKeyring` in `crypto/session.svelte.ts`).

## Rules the endpoints are built around

**No account-existence oracle.** `POST /api/account-recovery` is
unauthenticated, so it must not say whether an email has an account, or
whether that account has a partner. It answers `{ token }` for every
well-formed request; an unknown email still gets a row (with no user), still
counts towards the rate limit, and simply never gets approved — its status
stays `pending` until it expires, the same as a request nobody has answered
yet. An unknown token reads as `expired`.

**Nothing usable at rest.** The token is stored as its SHA-256. The email and
the client address are stored only as HMACs keyed with the auth secret, used
for the rate limit and for superseding — an unkeyed hash of either would be
reversible by guessing. The new password's `authSecret` reaches the server
only at completion, and only as the hash Better Auth stores.

**Rate limits.** Three requests per email and ten per client address, per
hour (`MAX_REQUESTS_PER_EMAIL`, `MAX_REQUESTS_PER_IP` in `server/recovery.ts`).
A 429 is the only other answer the start endpoint gives, and an unknown email
reaches it at exactly the same rate.

**One request at a time.** A new request supersedes the requester's pending
one, and its restore requests go with it, so a partner is never shown two codes
and left to guess which is current. Requests expire 24 hours after they start.
A restore request whose sign-in has expired, been superseded or been declined
disappears from the board and refuses uploads (`restoreStillLive` in
`server/messaging.ts`).

**The token is never in a URL.** Status and completion are `POST`s, so the
token stays out of access logs and browser history.

## Not built yet: email verification

**Until this exists, a partner alone can take over an account.** Nothing in the
flow proves the requester controls the account's email address, so a partner
can file a request for your email from their own browser, approve it
themselves, and sign in as you — and every other partner of yours who then
approves would re-encrypt their history to that partner's key.

The fix is to require proof of the email address as well: a partner's approval
_and_ a link sent to the address, before completion is allowed. It needs a
mailer this app does not have yet. Meanwhile:

- The prompt to every partner insists on comparing the code with the requester
  in person or over a call, which is the only thing that limits the damage.
- Completing wipes every session and passkey, so a takeover signs the real
  owner out — it is loud, not silent.

This is also recorded in [docs/temporary-code.md](temporary-code.md) and in a
comment at the approval site in `applyHistoryRestore`.

## Files

| Where                                          | What                                              |
| ---------------------------------------------- | ------------------------------------------------- |
| `src/routes/(public)/login/recover/`           | The requester's page                              |
| `src/routes/api/account-recovery/`             | Start, status, complete                           |
| `src/lib/server/recovery.ts`                   | Everything the three endpoints do                 |
| `src/lib/server/messaging.ts`                  | Restore requests, and the approval on the last page |
| `src/lib/components/RestoreRequests.svelte`    | The partner's side, on the board                  |
| `src/lib/components/HelpRequestCallout.svelte` | The app-shell callout                             |
| `account_recovery_requests`                    | One row per request; see the comment in the schema |
