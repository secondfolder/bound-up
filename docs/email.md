# Email

The app sends email for two things: confirming that an account's address is
really the account holder's, and the emailed half of partner-assisted sign-in
([account-recovery.md](account-recovery.md)). Both rest on the same rule: an
address is only worth anything once someone has shown they read it.

## Verification

**An account cannot sign in until its address is confirmed.** That is Better
Auth's `requireEmailVerification`, set in `src/lib/server/auth.ts`, and it is
what lets anything else — recovery now, changing an email later — trust the
address.

1. **Sign-up makes no session.** The action creates the account and its keys
   as before, then sends the browser to `/signup/check-email` instead of
   `/home`. `autoSignIn` is off, and the sign-up form no longer stashes the
   unlock material, because nothing follows that could use it.
2. **The email** carries Better Auth's link, `/api/auth/verify-email?token=…`,
   a JWT signed with the server's auth secret and good for 24 hours
   (`VERIFICATION_LINK_TTL_SECONDS`). Following it marks the address verified
   and redirects to the `callbackURL` sign-up gave it: `/login?verified=1`.
3. **The login page** says "Your email is confirmed. Log in to continue", and
   signing in there finishes the job.

**Why there is no sign-in straight from the link.** Better Auth can create a
session when the link is followed (`autoSignInAfterVerification`), and it is
off on purpose. The link can be opened anywhere — another browser, the phone's
mail app — and a session made there without the password has no key:
`EncryptionGate` would bounce it straight to `/login?reason=device`. Signing in
is what unlocks, everywhere in this app, so the link leads to signing in rather
than around it.

**`redirectTo` rides along.** Sign-up passes it to the check-email page and into
the link's `callbackURL`, so someone who signed up to accept an invite lands
back on the invite after signing in. The URLs are built in one place,
`src/lib/email-verification.ts`.

**A link that does not work.** Better Auth appends `error=TOKEN_EXPIRED` (or
`INVALID_TOKEN`) to the callback, and the login page says the link expired or
did not work. There is no resend button there because none is needed: signing
in to an unconfirmed account with the right password is refused with "Confirm
your email address first" and **sends a fresh link** (`sendOnSignIn`). Better
Auth checks the password before it says anything about verification, so only
the account holder ever learns the address is unconfirmed.

**The check-email page** (in the shared `AuthPage` layout, its copy and
resend form in an `AuthBox` under an envelope that bobs twice on arrival,
unless reduced motion is asked for) says where the link went, from a short-lived cookie
the sign-up action sets (an address in a query string would end up in the
history and in access logs), and has a resend form. The cookie also holds when
the last link went, and the button counts down what is left of the minute
since then — "Send a new link in 42s" — so someone coming back half an hour
later can press it at once. Each resend restarts it. That is the per-address
limit made visible: the server allows one link a minute and four an hour to
an address, sign-up's own included, plus the usual per-client limit
([rate-limiting.md](rate-limiting.md)). A refusal it did not see coming, from
another tab say, resets the countdown to the wait the server gave. The minute
is `RESEND_COOLDOWN_SECONDS` in `src/lib/email-verification.ts`, which the rate
limit reads too, so the two cannot disagree. Arriving without the cookie,
nothing is known to have been sent, so the button is offered at once.

The resend form posts to `?/resend&redirectTo=…` (`resendAction`), not a bare
`?/resend`: a form action's query replaces the page's, and a bare one dropped
the invite from every resent link.

**Someone else can use up an address's links from the resend form** — the
limit is per address, so it cannot tell the owner's requests from a
stranger's. The owner is never stuck, though: signing in with the right
password sends a link outside that count (see "A link that does not work").

### No account-existence oracle

Sign-up and resend both answer the same whether or not an address already has
an account:

- **Signing up with a taken address** looks exactly like signing up with a new
  one. Once verification is required, Better Auth answers it with a made-up
  user that was never stored, and calls `onExistingUserSignUp`, which emails
  the real owner instead ("someone tried to sign up with your email"). The
  sign-up action checks whether the returned user exists only so as not to
  write keys for one that does not.
- **Resending** goes to Better Auth's `sendVerificationEmail` with no session,
  which does nothing for an unknown or already-confirmed address and says
  `{ status: true }` either way, behind a 500 ms floor.
- **No send is ever awaited.** Every email is handed to `sendInBackground`,
  so a slow provider cannot make a real account's response slower than a made-up
  one, and a failing provider cannot make it an error. The per-address limit
  is checked in the background with the send, for the same reason.
- **Sign-up takes the same time either way.** A new account costs Better Auth
  two inserts and the action a key batch, which a taken address skips, so it
  answered measurably faster. Every sign-up that reaches Better Auth now waits
  out `SIGN_UP_RESPONSE_FLOOR_MS` (`src/lib/server/response-floor.ts`), set
  above the slower path. The form action is the only way to sign up: Better
  Auth's own `POST /api/auth/sign-up/email` is in `disabledPaths`
  (`server/auth.ts`), since it had no floor, and answers 404.

### The first account on a new server

A new server has no email set up — that is done from the admin page — and the
first account is the admin, so it could never confirm its address to get
there. So when the account sign-up just made is the only one, and email is not
set up (`mailProblem` in `mail/config.ts` says why not), the action marks it
verified and sends the browser to `/login?setup=1` instead of the check-email
page. The login page says they are the admin and should set up email at
Settings → Admin → Server settings once signed in. This widens nothing:
whoever signs up first is the admin either way, and once email works, or a
second account exists, everyone confirms as usual. The link Better Auth tried
to send fails in the background and is logged, saying where to set email up.

Under `vite dev` this never happens, because unset email falls back to the
outbox there (see below), so the first account confirms by link like any
other.

### Accounts from before

`drizzle/0024_verify_existing_accounts.sql` marks every account that existed
when this shipped as verified. They could all sign in the day before, so
locking them out until each found a link would have been all cost and no
benefit.

## The mailer

`src/lib/server/mail/`. Reached as `locals.mailer`, and built by
`hooks.server.ts` the first time a request sends something, not on every
request.

It is configured at Settings → Admin → Server settings, from the server
settings `mailFrom` (the sender), `mailTransport` and the chosen transport's
own setting ([server-settings.md](server-settings.md)):

| Transport | Set with        | Works on                       | For                                  |
| --------- | --------------- | ------------------------------ | ------------------------------------ |
| Resend    | `resendApiKey`  | Workers, the Docker image, dev | Production on Workers                |
| SMTP      | `smtpUrl`       | the Docker image, dev          | Self-hosters with a mail server      |
| Outbox    | `mailOutboxDir` | the Docker image, dev          | `npm run dev` and the Playwright suite |

**Needed, but not a startup failure.** A sender and one transport must be set
(`parseMailConfig` in `mail/config.ts`). Push is optional because a server
without it still works; a server without email has sign-ups nobody can finish.
But email is set from inside the app, so a server without it has to start for
anyone to set it: the admin hub and the server settings page warn that email
is not set up, and the first account gets in without a link (above). A send
attempted meanwhile fails with a message naming what is missing and where to
set it, which `sendInBackground` logs. It must not fail the request that
sends: only some addresses are sent anything, so an error there would say
which have accounts.

**Under `vite dev`, unset email is the outbox.** With no sender and no
transport chosen, mail goes to `./.mail-outbox` from `Bound Up <dev@localhost>`
(`DEV_OUTBOX_DIR`, `DEV_MAIL_FROM`), so nobody needs a provider to click their
own sign-up link. Only `vite dev`: the Docker image and Workers never send
anywhere nobody chose.

**The test email.** The server settings page has a "Send a test email" button,
which sends one to the admin's own address and waits for it, so the page can
say whether it worked and, if not, the provider's error. It is the one awaited
send: the never-await rule below protects a stranger's address, and this goes
to the address of whoever pressed the button.

**What is logged.** A failed send is logged by what kind of email it was,
never with the address. A Resend refusal logs its status and its error `name`
(`validation_error`, `invalid_api_key`) but not its `message`, which can quote
the recipient back.

**Why Resend, and why SMTP too.** Workers cannot open an SMTP connection or
write a file, so it needs an HTTP API, and Resend's is one `fetch` with no SDK.
A self-hoster may well have a mail server and no wish for a third-party
account, so the Node build also speaks SMTP, through nodemailer. SMTP and the
outbox live in `mail/local.ts`, imported only behind `dev || __SELF_HOSTED__`,
so neither nodemailer nor `node:fs` is in the worker bundle. `parseMailConfig`
refuses them outright on Workers rather than failing at the first send, and
the admin page says so.

**The outbox** writes each message to `<dir>/<time>-<uuid>.json`, holding
`to`, `subject`, `text`, `html` and `sentAt`. Under `vite dev` it defaults to
`./.mail-outbox` (gitignored): open the newest file to find a sign-up link.
The Playwright suite points it at its run directory (`e2e/global-setup.ts`
writes the setting) and reads the links back with `e2e/mail.ts`, so `signUp`
in `e2e/helpers.ts` follows the real link before signing in.

## What an email says

`mail/templates.ts`. **The app's name, a verb and one link — never what the
app is for.** An inbox preview is seen by whoever is near the screen, the same
reasoning as the lock-screen rule in [notifications.md](notifications.md). No
email ever includes anything a user wrote. Each has a plain-text and an HTML
body, and the link appears in full in both.

| Email                                 | Sent when                                         |
| ------------------------------------- | ------------------------------------------------- |
| Confirm your email for Bound Up       | Sign-up, resend, and signing in unconfirmed       |
| Someone tried to sign up…             | Sign-up with an address that already has an account |
| Confirm you are signing back in…      | A partner-assisted sign-in for an existing account |

**Every screen that waits on an email says to check Junk.** The sign-up
"Check your email" page, the message for signing in unconfirmed, and the
partner-assisted sign-in's email step each end with "Not there? Check your Junk
or Spam folder." A new mailer, a new domain or a self-hosted SMTP relay is
exactly what a spam filter distrusts, and a link that never seems to come
reads as the app being broken. The admin's test email needs none: whoever
sends it is waiting for the result on the page.

## Files

| Where                                       | What                                               |
| ------------------------------------------- | -------------------------------------------------- |
| `src/lib/server/mail/`                      | Config, transports, templates, `sendInBackground`  |
| `src/lib/server/mail/config.ts`             | Settings to config, the dev outbox, `mailProblem`  |
| `src/lib/server/auth.ts`                    | `requireEmailVerification`, `emailVerification`    |
| `src/lib/email-verification.ts`             | The round trip's URLs, and what the login page says |
| `src/routes/(public)/signup/`               | Sign-up, ending on the check-email page (or, for the first account without email, on login) |
| `src/routes/(public)/signup/check-email/`   | "Check your email", and the resend form            |
| `src/routes/(public)/login/`                | The confirmed / expired / first-account notice, the unconfirmed error |
| `src/routes/(auth-required)/(app)/admin/server/` | The email settings and the test email         |
| `e2e/mail.ts`                               | Reading the outbox in the Playwright suite         |
