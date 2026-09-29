# Rate limiting

Signing in, signing up and changing a password are rate limited per client
address. It is the server's only defence against password guessing: the
password never reaches the server (the browser posts a key derived from it —
see [encryption.md](encryption.md)), so the server cannot judge a password's
strength, only how often someone is trying one.

Partner-assisted recovery has limits of its own, per email and per address,
described in [account-recovery.md](account-recovery.md). Nothing else
is limited.

## Why the app does it, not Better Auth

Better Auth has a rate limiter, and it is switched off (`rateLimit` in
`src/lib/server/auth.ts`). In this app it protected nothing:

- **It only runs in Better Auth's HTTP router.** The `/login`, `/signup` and
  change-password form actions call `locals.auth.api.signInEmail` and friends
  directly, which never pass through it — and those forms are how everyone
  signs in with a password.
- **It is on only when `NODE_ENV` is `production`.** Workers does not set it,
  so on Workers it was off even for the HTTP endpoints.
- **It counts in memory.** On Workers that is one isolate of many, so a
  guesser spread across them would rarely meet the limit.
- **It finds the client in `X-Forwarded-For`**, which the self-hosted image
  receives only behind a proxy — and a client talking to the container
  directly can set it to anything. With no address it falls back to one shared
  bucket, so one guesser could lock everyone out. That fallback is the warning
  it used to log in the Docker image: _"Rate limiting could not determine a
  client IP…"_.

## How it works

`src/lib/server/rate-limit.ts`.

- **Buckets.** `sign-in`, `sign-up` and `change-password`, each with two
  fixed-window rules (`AUTH_RATE_LIMITS`): a short one against a burst, and an
  hour against the steady guesser the short one alone lets through.

  | Bucket            | Per minute | Per hour |
  | ----------------- | ---------- | -------- |
  | `sign-in`         | 5          | 30       |
  | `sign-up`         | 3          | 10       |
  | `change-password` | 5          | 20       |

  Every attempt counts, successful or not. Counting only failures would need a
  second write after Better Auth answers, and a real person signs in once. The
  numbers leave room for a household behind one address.
- **Where it is checked.** `hooks.server.ts` builds `locals.authRateLimit` for
  each request. The three form actions call it before Better Auth and answer
  a refusal with a form error and a 429 ("Too many attempts. Try again in 42
  seconds."). The hook calls it too, for the equivalent Better Auth endpoints
  (`/api/auth/sign-in/*`, `/api/auth/sign-up/*`, `/api/auth/change-password`),
  answering with a 429 in Better Auth's error shape and a `Retry-After`. The
  form and its endpoint share a bucket, so alternating between them buys
  nothing. Passkey sign-in is not limited: an assertion cannot be guessed.
- **Who the client is.** SvelteKit's `getClientAddress()`: `cf-connecting-ip`
  on Workers; on adapter-node, the connection's peer, or the header named by
  `ADDRESS_HEADER` (below). IPv6 addresses are counted by their /64
  (`clientBucket`), because one subscriber is handed a whole /64 and could
  otherwise use a fresh address per attempt. An adapter that cannot say at all
  gets one shared bucket rather than no limit.
- **Where it counts.** The `auth_rate_limits` table, in D1 or the SQLite file,
  so every Workers isolate sees the same counts. Each rule is one row, updated
  by a single upsert that either adds one or, once the window has closed,
  starts again at one. A statement is atomic on both drivers, so a burst of
  concurrent attempts cannot all read a count below the limit. A refused
  attempt still counts, so a client that keeps hammering stays refused.
- **What it stores.** The row key is an HMAC of the rule and the address,
  keyed with the auth secret (`keyed-hash.ts`, shared with account recovery),
  because an address is guessable and a plain hash of one is reversible.
  Nothing else about the client is kept.
- **Pruning.** Rows whose window has closed are deleted by the scheduled sweep:
  `scheduled.ts` on Workers, `self-hosted/sweep.ts` in the Docker image. The
  table holds about an hour of clients at most.

## Where it is off

- **`vite dev`**: every request comes from localhost, and the e2e suite signs
  up hundreds of accounts a minute. Better Auth's limiter was off in dev too.
- **`AUTH_RATE_LIMIT=off`**, in the environment (or `platform.env` on
  Workers). The Playwright suite sets it when it runs against the Docker image,
  for the same reason as dev; an operator limiting at their own proxy may too.
  `scripts/docker-smoke.sh` checks the limit against the image instead: five
  wrong sign-ins are refused as wrong, and the sixth as too many.

## Self-hosted: the client's address

Behind a reverse proxy, the connection's peer is the proxy, so every client
would share its bucket. Tell adapter-node where the proxy puts the real
address:

```sh
ADDRESS_HEADER=X-Forwarded-For
XFF_DEPTH=1   # the number of proxies you run in front of the container
```

`XFF_DEPTH` counts from the right of `X-Forwarded-For`, so only addresses your
own proxies appended are trusted, and a client cannot choose its bucket by
sending the header itself. Without a proxy, leave both unset. See
[self-hosting.md](self-hosting.md#running-it).

## Adding a place people type a password

A new form action or endpoint that checks a password, or creates an account,
calls `locals.authRateLimit` with the matching bucket before Better Auth —
the hook cannot see what a form action goes on to do. Add a bucket to
`AUTH_RATE_LIMITS` if none fits, and a route test with a refusing
`authRateLimit` passed to `fakeEvent`, as the login, signup and security
tests do.
