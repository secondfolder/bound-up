# Email verification (roadmap: `email-verification`)

## Context

Bound Up has no way to prove that someone owns the email address on their
account, and no mailer at all. That leaves two problems:

- Accounts can be created for addresses the person does not own.
- Partner-assisted sign-in has a documented takeover gap: a partner can file a
  recovery request for your email and approve it themselves
  (`docs/account-recovery.md` "Not built yet", `docs/temporary-code.md`).

`change-email` on the roadmap depends on this work too.

Decisions made:

- **Mailer:** Resend over HTTP on both targets, or SMTP on the Node targets
  only.
- **Enforcement is hard:** an account cannot sign in until its address is
  verified.
- **Recovery:** completing a recovery needs a partner's approval **and** a
  link sent to the account's email address.
- **A mailer is required.** The server refuses to start without one, like
  `BETTER_AUTH_SECRET`.

The schema already has what Better Auth needs: `user.email_verified` and the
`verification` table. Better Auth's verification tokens are signed JWTs, so they
do not need that table.

## 1. Mailer: `src/lib/server/mail/`

This directory must not import aliases: Better Auth's callback runs inside
`createAuth`, and the recovery code calls it too.

- **`config.ts`.** `readMailConfig(platform)` reads each value as
  `platform?.env?.X ?? privateEnv.X`, the same pattern as `readVapidConfig` in
  `src/lib/server/push.ts:45`.
  - `MAIL_FROM` is required.
  - Exactly one transport must be set:
    - `RESEND_API_KEY`.
    - `SMTP_URL`, only when `dev || __SELF_HOSTED__`.
    - `MAIL_OUTBOX_DIR`: writes each message as a JSON file. Allowed only when
      `dev || __SELF_HOSTED__`, and documented as testing-only.
  - It returns a discriminated union, or throws an actionable error that names
    the env vars and points to `docs/self-hosting.md` and
    `npm run secrets`.
- **`index.ts`.** `createMailer(config, fetchImpl = fetch)` returns
  `{ send({ to, subject, text, html }) }`.
  - Resend is a plain `fetch` POST, so it needs no SDK and fits the Workers
    bundle.
  - SMTP uses `nodemailer` and the outbox uses `node:fs`. Both are reached by
    `await import()` behind `if (dev || __SELF_HOSTED__)`, as
    `db/backend.ts` does, so neither ends up in the worker bundle.
- **`templates.ts`.** `verificationEmail(url)` and `recoveryConfirmEmail(url)`
  build plain text plus minimal HTML.
  - The wording stays discreet: "Confirm your email for Bound Up", with no
    content hints.
  - That follows the reasoning `docs/notifications.md` gives for what a
    notification may say.
- **Startup check.** `hooks.server.ts` calls `readMailConfig` next to the
  `BETTER_AUTH_SECRET` check, after the `building` bail-out. A missing config
  therefore throws on the first request with the fix in the message.
  - Add the keys as optional `string` to `App.Platform.env` in `src/app.d.ts`.
- **Sending in the background.** Move `inBackground(platform, task)` out of
  `push.ts` into a shared server helper and reuse it.
  - Sending never blocks the response, which also avoids a timing oracle.
  - Failures are logged without the address, and the user can resend.

## 2. Better Auth: `src/lib/server/auth.ts`

- **Signature change.** `createAuth` gains a `sendMail` (or mailer) in
  `AuthRequestConfig`. `hooks.server.ts` passes it in per request, so there is
  no module state (invariant 2).
- **`emailAndPassword` options:**
  - `requireEmailVerification: true`.
  - `autoSignIn: false`. Signing up no longer creates a session.
- **`emailVerification` options:**
  - `sendOnSignUp: true`.
  - `sendOnSignIn: true`. An unverified user who signs in with the correct
    password gets a fresh link.
  - `autoSignInAfterVerification: false`.
  - `expiresIn: 24h`.
  - `sendVerificationEmail: ({ user, url }) => inBackground(...)`.
- **Why `autoSignInAfterVerification` is off.** The link can be opened on any
  device or browser. A session created without the password leaves no key in the
  stash, and `EncryptionGate` would immediately bounce to
  `/login?reason=device`. Instead, the link lands on a "confirmed, now sign in"
  login page, and signing in does the unlocking as it always has (the
  no-unlock-form convention).
- **Comments.** Each option gets a comment saying why it is set, as the file
  requires.

## 3. Sign-up, the check-email page, and login

**Sign-up action** (`src/routes/(public)/signup/+page.server.ts`)
- The order stays the same: rate limit, `signUpEmail`, `putUserKeys` (with
  rollback), redirect.
- The redirect goes to the new `/signup/check-email` instead of `redirectTo`.
  `redirectTo` is carried along as a query parameter, so an invite acceptance
  survives the round trip.
- Fix the L54 comment that relies on `autoSignIn`.

**Sign-up form** (`SignupForm.svelte`)
- Stop stashing the unlock material, because no session follows. Leave a
  comment saying why.

**New `(public)/signup/check-email` page**
- It says "We've sent a link to your address".
- It has a resend form: superforms, a schema in
  `src/lib/schemas/resendVerificationForm.ts`, and `InputField`.
- The resend action calls:
  - `locals.authRateLimit('verification-email')`, then
  - a per-email `consumeRateLimit` scope, then
  - `locals.auth.api.sendVerificationEmail({ body: { email, callbackURL } })`.
- Its response is identical whether or not the account exists, so it cannot be
  used as an account-existence oracle. Confirm Better Auth's behaviour for an
  unknown email during implementation, and wrap it if needed.
- The callback URL is `/login?verified=1&redirectTo=…`.

**Login** (`src/routes/(public)/login/+page.server.ts` and `LoginForm.svelte`)
- **`EMAIL_NOT_VERIFIED`.** Map the 403 to "Confirm your email first. We've sent
  a new link." It does not leak which factor was wrong: Better Auth checks the
  password first, so only the account holder ever sees it. Include a link to the
  check-email page for resending.
- **The load handles three new query parameters:**
  - `verified=1`: a success notice, "Email confirmed. Sign in to continue".
  - `error=invalid_token`: the link is not valid.
  - `error=token_expired`: the link is no longer valid. This message also
    links to resend.
  - These are the values Better Auth's `verify-email` endpoint appends to
    `callbackURL`.
- `redirectTo` keeps working through the existing allowlist,
  `redirectTargetOrHome`.

**Rate limiting** (`src/lib/server/rate-limit.ts`)
- Add a `verification-email` bucket to `AUTH_RATE_LIMITS`.
- Map `/send-verification-email` in `bucketForAuthPath` to that bucket.
- Update the `App.Locals.authRateLimit` doc comment in `src/app.d.ts`.

**Existing accounts**
- No real users exist yet, but the owner's dev and production accounts would be
  locked out.
- Add a custom migration with `npx drizzle-kit generate --custom --name
  verify_existing_accounts` that runs
  `UPDATE user SET email_verified = 1;`.

## 4. Recovery needs email proof (`src/lib/server/recovery.ts`)

**Schema** (`schema/app.ts`, `accountRecoveryRequests`)
- Add `emailTokenHash` (text, nullable) and `emailConfirmedAt` (`timestamp_ms`,
  nullable).
- Generate the migration with
  `npm run db:generate -- --name recovery_email_confirmation`.

**`startAccountRecovery`**
- When the account exists, it creates a random token, stores its hash (reusing
  the request's existing token-hashing helper), and sends
  `recoveryConfirmEmail(url)` through `inBackground`.
- The response is unchanged whether or not the account exists, which keeps the
  no-oracle rule.

**New `(public)/login/recover/confirm` page**
- `?token=` on a GET only renders a "Confirm it's you" button. The button's form
  action sets `emailConfirmedAt`.
- Recovery must not run on a GET, so a mail scanner that prefetches the link
  cannot confirm a takeover.
- A token that is expired, already used, or unknown gets a single generic
  message.

**`recoveryStatus`**
- It returns `emailConfirmed`. `/login/recover/+page.svelte` then shows two
  pending items, "Waiting on your partner" and "Waiting on your email", until
  both are done.

**`completeAccountRecovery`**
- Next to the `status !== 'approved'` check at L274, also refuse when
  `emailConfirmedAt` is null. The `complete` endpoint returns 409 with a
  distinct reason.
- Completing a recovery also sets `user.email_verified = 1` in the same
  `db.batch`, because the link proved ownership of the address.

**Remove the gap comment**
- Remove the KNOWN GAP comment in `messaging.ts` (`applyHistoryRestore`, about
  L1704). Leave a short note there saying approval alone is no longer
  sufficient, and why.

## 5. Configuration and tooling

- **Example env files.** `.env.example` and `.dev.vars.example` get `MAIL_FROM`
  plus `MAIL_OUTBOX_DIR=./.mail-outbox` for dev. Gitignore `.mail-outbox/`.
- **`scripts/secrets.mjs`.**
  - For `dev` and `local-preview`, it fills in `MAIL_FROM` and
    `MAIL_OUTBOX_DIR` defaults.
  - For `production` and `remote-preview`, it prompts for `MAIL_FROM` and
    `RESEND_API_KEY`. They cannot be generated.
- **`docker-compose.yml`.**
  - `MAIL_FROM` is required, using `:?`.
  - `RESEND_API_KEY` and `SMTP_URL` are optional, each with a comment.
- **Workers.** Nothing to add to `wrangler.jsonc`, because these are secrets and
  not bindings.
- **Breaking change.** The commit introducing the startup requirement is
  `feat!:`, so the self-hosted image gets a major version (see
  `docs/self-hosting.md#versioning-and-publishing`).

## 6. Tests

**Unit tests (node project)**
- `mail/config.test.ts` covers:
  - each transport;
  - more than one transport, or none, set at once;
  - `SMTP_URL` and the outbox refused when the target is not Node.
- `mail/index.test.ts` covers Resend with a fake `fetch` (request shape, a
  non-2xx response throws) and the outbox writing into a temp directory.
- `templates.test.ts` checks that the URL is present and the wording is
  discreet.

**Route tests (`fakeEvent`, `createTestDb`)**
- `signup/page.server.test.ts`: the action redirects to check-email, and
  `redirectTo` is preserved.
- `check-email/page.server.test.ts`: resend is rate-limited per IP and per
  email, and the response is the same for an unknown email.
- `login/page.server.test.ts`: `EMAIL_NOT_VERIFIED` maps to its message, and
  the `verified` and `error` query parameters render.
- `recovery.test.ts`:
  - completion is refused when the request is approved but the email is
    unconfirmed;
  - completion is refused when the email is confirmed but the request is not
    approved;
  - completion succeeds when both are done, and sets `email_verified`;
  - the confirm action refuses an expired or reused token, and a GET does not
    confirm.

**e2e**
- **Environment.** `playwright.config.ts` and the `--env` list in
  `e2e/server.mjs` gain `MAIL_FROM` and a `MAIL_OUTBOX_DIR` under the run
  directory (from `e2e/run-paths.ts`). In image mode that directory is inside
  the container.
- **`e2e/mail.ts`.** `latestMailTo(email)` reads the outbox. In image mode it
  goes through `docker exec`, mirroring `e2e/db.ts`'s `sql()`. It polls rather
  than sampling once.
- **`signUp` helper** (`e2e/helpers.ts`). It submits sign-up, waits for
  `/signup/check-email`, follows the link from `latestMailTo`, then calls
  `logIn`, so the existing `waitForKeyring` wait still applies.
  - It is one helper, and the about 140 call sites do not change.
  - If following the link proves too slow across the suite, fall back to setting
    `email_verified` through `sql()` in the helper. The dedicated spec covers
    the link either way.
- **New `e2e/email-verification.spec.ts`:**
  - sign up, receive the mail, follow the link, see the "confirmed" notice, sign
    in, land on `/home`;
  - an unverified sign-in shows the message, and a new mail arrives;
  - a tampered token shows the invalid-link message;
  - an invite `redirectTo` survives sign-up, verification and sign-in;
  - resend from the check-email page.
- **Update the existing recovery e2e spec.** After the partner approves,
  completion stays blocked until the confirm link is followed and the button is
  pressed.

## 7. Docs and roadmap (part of done)

- **New `docs/email.md`** covers:
  - the mailer and its transports, and why both HTTP and SMTP exist;
  - the required config;
  - the verification flow, and why there is no auto sign-in after verifying;
  - the outbox for dev and e2e;
  - the email copy rules.
  - Add it to the AGENTS.md feature-doc table.
- **`docs/account-recovery.md`.** Replace the "Not built yet" section with the
  two-factor completion rules. Also fix L8 ("no password reset by email").
- **`docs/temporary-code.md`.** Remove the "without email verification"
  section.
- **`docs/encryption.md`.** Fix L432-434.
- **`docs/rate-limiting.md`.** Add the new bucket, and fix the "Nothing else is
  limited" sentence.
- **`docs/self-hosting.md`.** Add the mail variables to the env table, plus an
  upgrade note about the breaking change.
- **`docs/development.md`.** Cover the secrets targets, the dev outbox, and
  setting the Resend key for deploy.
- **`AGENTS.md`.**
  - Add the mail directory as an alias-free zone if it ends up imported by
    `recovery.ts` or `scheduled` code.
  - Add to the e2e notes that `signUp` now goes through the outbox.
  - Add `docs/email.md` to the table.
- **Settings.** Leave the account page's email panel copy alone, because
  change-email is still not available.
- **`src/lib/roadmap/roadmap.json`.** Set `email-verification` to
  `status: "shipped"` with `shippedOn`.
- **Historical plan.** Copy this plan to
  `docs/historical-plans/2026-10-DD-email-verification.md`.
- **Memory.** Update `recovery-needs-email-verification` once the work has
  shipped.

## Verification

- `npm run check`, `npm run lint`, and `npm test` (vitest plus Playwright).
- `npm run test:e2e:image`. This exercises the outbox inside the container and
  the startup requirement.
- `npm run preview` with `RESEND_API_KEY` in `.dev.vars`, to check that the
  worker bundle has no `nodemailer` or `node:fs`. Grep the built worker, then do
  one real sign-up and receive the email.
- Start the Docker image without any mail env, and confirm it fails with the
  actionable message.
- Manual pass under `npm run dev`:
  - sign up, open the link from `.mail-outbox/`, sign in;
  - an unverified sign-in;
  - recovery, with partner approval and the email confirm in either order.
