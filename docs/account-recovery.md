# Partner-assisted sign-in

How someone who has lost every way into their account — their password and
every passkey — gets back in, with a partner vouching for them. The history
half of it, sharing the partnership vault again, is in
[docs/messaging.md](messaging.md); the keys themselves are in
[docs/encryption.md](encryption.md).

There is no password reset by email alone. The password is turned into a key
in the browser and the server never sees it (docs/encryption.md), so an emailed
reset link could set a new password but could not bring back the key that
decrypts the user's messages — the password was the only thing that could open
it. A partner can: everything a partnership shares is sealed in its vault, and
the other partner holds the vault key, so they can wrap it for a new key.
Email still plays a part:
completing needs a partner's approval **and** a link sent to the account's
address, because each on its own is someone else's say-so (see below).

## The flow

**Starting — `/login/recover`, no session.** The login page links to it as
"Forgot password?", under the password box. The page is titled "Can't log
in?" and sits in the same `AuthPage` layout and `AuthBox` as log in and sign
up; its "Ask my partner" button stays outlined until the email, the new
password's strength and the confirmation would all pass. The person enters their email and a new password. Their
browser makes a brand-new identity and seals it under the new password — the
same `buildIdentitySubmission` signup uses — and posts the email, the new
public key and the new password wrap to `POST /api/account-recovery`. It gets
back a random **token**, and keeps it, the new identity and the new password's
derived `authSecret` in the page's memory only. Nothing is stored in the
browser, so reloading starts again; the alternative would be a login credential
sitting in browser storage.

The server stores an `account_recovery_requests` row and opens a
`history_restore_requests` row in **each** of the account's partnerships, all
carrying the new public key. When the email has an account, it also emails that
address a confirm link (below).

**The code.** The requester's page shows a code derived from the new public
key (`recoveryCode` in `crypto/fingerprint.ts`, formatted like the safety
number) and asks them to read it to their partner **somewhere other than this
app**. It then polls `POST /api/account-recovery/status` with the token.

**Approving — any partner, signed in.** The app shell shows "{name} can't sign
in and asked for your help" on every screen, because someone who cannot get
into their account has no way to message you about it. It links to the
messages board, where `RestoreRequests.svelte` shows the same code, computed
from the public key snapshotted on the request. If it matches, the partner
confirms, and their device wraps their partnership's vault for the new key
(docs/messaging.md). **Storing that wrap approves the sign-in**. The partner's device also remembers the new key as
vouched for — comparing the code is the same assurance as comparing a safety
number — so when the server starts serving it, it is accepted as verified with
no "key changed" warning. Only on that device: another of the partner's devices
never saw the code, so it still warns.

"It doesn't match" declines. When every partner who was asked has declined, the
requester's page says so.

**Confirming the email — the link sent to the account's address.** It goes to
`/login/recover/confirm#token=…`, with a second random token of its own, not the
one the requester's page holds. The token is in the fragment, which a browser
never sends to a server, so it stays out of access logs; the page reads it and
posts it from a **"Yes, this is me" button**. Loading the page changes nothing,
because mail scanners open links to look at them, and one doing so must not be
able to vouch for anybody. The button sets `email_confirmed_at`
(`confirmRecoveryEmail` in `server/recovery.ts`). It works while the request is
open — pending, or already approved — in either order with the partner, and an
expired, superseded or unknown link all get the one answer: it no longer works.

The requester's page shows both halves as they happen: "Waiting for your
partner…" and "We've emailed a link to …". The email line reads the same for an
address with no account, which is never sent anything.

**Completing — authorised by the token.** Once the status is `approved` **and**
the email is confirmed, the requester's page posts the token and the new
password's `authSecret` to `POST /api/account-recovery/complete`, which refuses
with a 409 while either half is missing. In one `db.batch()` the server:

- swaps `user_keys` to the new public key;
- deletes every old wrap and stores the new password wrap;
- **deletes every passkey** — none can open the new key, and one left behind
  would sign in to a device that could never get its key;
- sets the password credential to Better Auth's own hash of the `authSecret`
  (`setPasswordHashStatement` in `server/credentials.ts`), so sign-in verifies
  it like any other;
- **deletes every session**, which signs out whoever has the lost devices;
- marks the address verified, which the emailed link just proved — so the
  ordinary sign-in that follows works even for an account that never confirmed
  its sign-up link;
- marks the request `completed`.

The page then signs in with Better Auth's ordinary email sign-in, stashes the
new identity the way signup does, and lands on `/today` with the key in hand.

**More than one partner.** Every partner is asked, and whichever finishes first
approves the sign-in. The others' requests stay open, and each shares their
own partnership's vault when they get to it; until they do, the
requester's board with them says their older messages are still on their way,
and the partner's copy notes that someone else already approved the sign-in —
and still asks them to check the code with the requester themselves.

A device that still had the old key cached finds the server serving a
different public key the next time it loads, drops the stale key, and is sent
to sign in again (`initialiseKeyring` in `crypto/session.svelte.ts`).

## What comes back

- **Everything shared with a partner who helps** — the partnership vault,
  wrapped for the new key: messages, and the partnership's tasks and rewards
  (docs/messaging.md).
- **The account's own vault** — the tasks and rewards in their own space,
  with their history — if any partner held it in escrow: the partner
  who helps passes on their half, and the server releases its half once the
  sign-in completes by email (docs/encryption.md, "Escrow"). Released for
  seven days after the sign-in; the next load does it automatically.
- **Nothing from a partner who does not help** until they do — or until their
  device trusts the new key and shares their partnership's vault on its own.

**Someone with no partner gets nothing back**, because nobody held anything.
Their own vault is replaced with a new, empty one on the first load after the
sign-in, and their own tasks and rewards sealed in the old one go with it: the
rows reference their vault and are deleted with it, since nobody can ever
open them again and an entry with no title could not even be edited.

## Rules the endpoints are built around

**No account-existence oracle.** `POST /api/account-recovery` is
unauthenticated, so it must not say whether an email has an account, or
whether that account has a partner. It answers `{ token }` for every
well-formed request; an unknown email still gets a row (with no user), still
counts towards the rate limit, and simply never gets approved — its status
stays `pending` until it expires, the same as a request nobody has answered
yet. An unknown token reads as `expired`. The confirm email is the one
difference, and it goes to the account's own inbox, sent in the background so
that not even the response time differs.

**Nothing usable at rest.** Both tokens are stored as their SHA-256. The email and
the client address are stored only as HMACs keyed with the auth secret, used
for the rate limit and for superseding — an unkeyed hash of either would be
reversible by guessing. The auth secret is a server setting in the same
database (docs/server-settings.md), so this protects the rows from anyone who
reads the table alone — a log, an export of one table, a support query — but
not from someone with the whole database, who has the key too. The new password's `authSecret` reaches the server
only at completion, and only as the hash Better Auth stores.

**Rate limits.** Three requests per email and ten per client address, per
hour (`MAX_REQUESTS_PER_EMAIL`, `MAX_REQUESTS_PER_IP` in `server/recovery.ts`).
A 429 is the only other answer the start endpoint gives, and an unknown email
reaches it at exactly the same rate. Every answer also waits out
`RECOVERY_START_RESPONSE_FLOOR_MS` (`server/response-floor.ts`), because an
address with an account costs one more read — its partnerships — than an
unknown one, and that would otherwise show in how fast it answers.

**One request at a time.** A new request supersedes the requester's pending
one, and its restore requests go with it, so a partner is never shown two codes
and left to guess which is current. Requests expire 24 hours after they start.
A restore request whose sign-in has expired, been superseded or been declined
disappears from the board and refuses uploads (`restoreStillLive` in
`server/messaging.ts`).

**The requester's token is never in a URL.** Status and completion are
`POST`s, so the token stays out of access logs and browser history. The email
token has to be in a link, so it is in the fragment instead.

## Why both halves

Either alone is someone else's say-so. With only a partner's approval, a partner
could file a request for your email from their own browser, approve it
themselves, and sign in as you — and every other partner of yours who then
approved would hand their vault to that partner's key. With only the
email, anyone who got into your inbox could replace your keys. Together, a
takeover needs both a partner who lies and your inbox.

The prompt to every partner still insists on comparing the code with the
requester in person or over a call, and completing still wipes every session
and passkey, so a takeover that did get both would sign the real owner out — it
is loud, not silent.

## Files

| Where                                          | What                                              |
| ---------------------------------------------- | ------------------------------------------------- |
| `src/routes/(public)/login/recover/`           | The requester's page                              |
| `src/routes/(public)/login/recover/confirm/`   | Where the emailed link lands                      |
| `src/routes/api/account-recovery/`             | Start, status, complete                           |
| `src/lib/server/recovery.ts`                   | Everything the endpoints and the confirm page do  |
| `src/lib/server/mail/templates.ts`             | The confirm email (`recoveryConfirmEmail`)        |
| `src/lib/server/messaging.ts`                  | Restore requests, and the approval on the last page |
| `src/lib/components/RestoreRequests.svelte`    | The partner's side, on the board                  |
| `src/lib/components/HelpRequestCallout.svelte` | The app-shell callout                             |
| `account_recovery_requests`                    | One row per request; see the comment in the schema |
