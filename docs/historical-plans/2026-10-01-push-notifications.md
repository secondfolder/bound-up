# Push notifications for messages and reactions (iOS-first, Workers Free plan)

## Context

`push-notifications` is a featured, planned roadmap item ("Hear about new messages
and tasks without opening the app"), and `session-notifications` depends on it.
Today a partner only learns of a new message if the app is open and visible: the
SSE feed (`src/lib/server/realtime/`) hangs up on `visibilitychange` because an
open Durable Object stream would burn about 83% of the free plan's daily GB-s.
Push is how a hidden or closed app finds out.

Decisions taken: the lock-screen text names the partner only ("New message from
Sam"), never the message text. v1 covers new threads, replies and reactions,
with categories so tasks and invites can be added later.

## Research findings

**iOS.** Web Push works only for a site **added to the Home Screen** (iOS 16.4+).
A Safari tab never gets it. The existing `site.webmanifest` (`display:
standalone`, `start_url: /home`) already qualifies. Permission must be requested
from a user gesture inside the installed app. WebKit has **no silent push**: a
push that does not show a notification gets the subscription revoked. So
"don't notify, they're looking at it" has to be decided on the server, never by
a service worker dropping the push. Safari 18.4+ supports **Declarative Web
Push**: a JSON payload (`{"web_push": 8030, "notification": {title, body,
navigate, tag, app_badge}}`) that the OS shows without running a service worker.
That is the most reliable path on iOS, and the same JSON is easy for a service
worker to parse elsewhere.

**Protocol.** Standard Web Push: VAPID (RFC 8292, an ES256-signed JWT) plus
aes128gcm payload encryption (RFC 8291) to each subscription's `p256dh`/`auth`.
Apple's endpoint is `web.push.apple.com`. FCM and Mozilla use the same protocol,
so one implementation covers Android and desktop as well. The payload is
encrypted to the device, so Apple sees only metadata. The partner name is safe
in it; message text cannot be there anyway, since the server never has it.

**Free plan fit.**
- No extra product is needed. No APNs certificate, no Apple developer account,
  no Queues: each push is one outbound `fetch` **subrequest**. Subrequests do not
  count against 100k requests/day, and the free limit is 50 per invocation.
- 10 ms CPU per invocation. One push costs one ECDH keygen + derive, HKDF,
  AES-GCM and an ES256 sign, all native WebCrypto and well under a millisecond
  each. A partnership's handful of devices fits easily. Send through
  `platform.ctx.waitUntil` so the response is not held up; `waitUntil` allows
  30 s of wall time.
- Library: a zero-dependency WebCrypto one that runs on both workerd and Node
  20, because the Docker build needs it too. The candidates are
  `@block65/webcrypto-web-push` v2 (RFC 8291/8292, which explicitly fixed
  Safari/iOS) and `@mmmike/web-push`. Prefer block65. **Not** `web-push`, which
  needs Node `crypto`/`https`.

## Approach

### 1. Data (`schema/app.ts`, then `drizzle-kit generate --name add_push_subscriptions`)
- `push_subscriptions`: `id`, `userId` (FK, cascade), `endpoint` (unique; it is a
  capability, so never return it in load data), `p256dh`, `auth`, a `label`
  (from the UA, so settings can show "iPhone"), `timestamps`, `lastSuccessAt`.
  Index on `userId`.
- Per-user preferences: one column per category on a user-settings row
  (`notifyMessages`, `notifyReactions`, both defaulting to true). Follow
  whatever `src/lib/server/user-settings.ts` already does.

### 2. Secrets
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a `mailto:`), read
from `platform.env` or `privateEnv` by the existing pattern. A missing key
throws an actionable error naming `npm run push:keys`, a new script that
generates the pair. Document all three in `docs/development.md` and
`docs/self-hosting.md`, and add them to `.dev.vars` and `.env` examples.

### 3. Server sender: `src/lib/server/push.ts`
- `sendPush(db, env, userIds, message)` loads the subscriptions (explicit
  columns), builds a **declarative** payload, encrypts and sends each one.
- The `Topic` header plus notification `tag` = thread id, so a burst of replies
  replaces one notification rather than stacking.
- `app_badge` = the recipient's unread thread count, from the existing
  `listUnreadCounts` in `src/lib/server/messaging.ts`.
- `TTL` of about a day, `Urgency: high` for messages and `normal` for reactions.
- 404/410 deletes the subscription. Other errors are logged and swallowed.
  Like `Notifier.publish`, it **must never throw**, because the write has
  already committed.
- `navigate` deep-links to `/partner/[id]/messages/[threadId]` via `resolve()`.

### 4. Wiring and "they're already looking" suppression
- At the publish sites in `src/routes/api/partnerships/[id]/threads/+server.ts`,
  `.../threads/[threadId]/messages/+server.ts` and `.../reaction/+server.ts`,
  call a `notifyPartner(...)` helper alongside `notifier.publish(...)` through
  `waitUntil`. A reaction pushes only when it is on the recipient's own
  message, and only when it is set (`PUT`), never on `DELETE`.
- **Suppression via the existing room.** `/subscribe` gains the viewer's
  `userId` (the events endpoint already knows `locals.user`). `/publish`
  replies with the user ids that have a live stream, and `Notifier.publish`
  returns them. A recipient in that set skips the push. Because streams close
  when the app is hidden, "connected" ≈ "app visible". This costs no extra DO
  time, since it reuses the request already made. Implement it in both
  `remote.ts`/`durable-object.ts` and `local.ts`, and keep "metadata only"
  intact: user ids, no content.
- Self-hosted build: same code path, with the local notifier.

### 5. Client
- `src/service-worker.ts`, deliberately minimal: `push` (parse the declarative
  JSON, `showNotification`, always) and `notificationclick` (focus or open
  `navigate`). **No `fetch` handler and no caching**, with a comment saying why:
  a caching SW is a separate, risky decision. On Safari 18.4+ the OS handles
  declarative pushes itself, and the SW is the fallback for everyone else.
- A Notifications section on the settings page (`(auth-required)/(app)/settings`),
  with these states:
  - unsupported browser;
  - **iOS Safari not installed**: Add-to-Home-Screen instructions, detected by
    `navigator.standalone`/`display-mode`;
  - permission denied: explain how to re-enable it in iOS Settings;
  - an on/off toggle per category;
  - this device subscribed or not, plus a list of other devices with remove.
- Subscribe calls `pushManager.subscribe({ userVisibleOnly: true,
  applicationServerKey })` inside the click handler, then POSTs to
  `api/push/subscriptions`. A matching `DELETE` handles unsubscribe. Both
  endpoints carry their own `locals.user` check, like the other `api/` routes.
- Copy talks about notifications, never encryption (see the
  encryption-invisible convention).
- Optional: gate the whole thing behind a `push-notifications` entry in
  `src/lib/features.ts` with `requireFeature` while it beds in.

### 6. Docs and roadmap
- New `docs/notifications.md` (the iOS install requirement, no-silent-push,
  suppression, payload privacy, free-plan budget) and its row in the AGENTS.md
  table.
- `docs/messaging.md` Realtime section: the new user-id awareness of the room.
- `roadmap.json`: `push-notifications` → shipped, or a twig for "messages and
  reactions" if tasks come later.
- Copy this plan to `docs/historical-plans/2026-10-XX-push-notifications.md`.

## Later (not v1)
Task reminders from the existing `*/15` cron (watch the 10 ms CPU budget per
cron run, and batch), invites, rewards claimed, session notifications. On-device
decrypted previews via a mutable declarative push and the SW reading the
IndexedDB key: fragile on iOS, and against the discreet default.

## Verification
- Node tests: the payload builder (declarative shape, no content, partner name
  through `viewPartnership()`), 410 → row deleted, a thrown fetch is swallowed,
  suppression when the recipient is connected, a reaction on your own message
  does not push, and the endpoints' auth and membership checks
  (`createTestDb`/`fakeEvent`).
- DO/local notifier tests: `/publish` returns the connected user ids.
- Component test: the settings states (unsupported, not-installed, denied,
  subscribed) with `pushManager` faked.
- e2e: subscribe in Chromium with a granted `notifications` permission, then
  assert a row exists and that sending a message makes the server attempt a
  push. Intercept outbound push in dev with a fake endpoint, since the sealed
  test browser cannot reach FCM.
- `npm run preview` with real VAPID keys, then a **real iPhone**: install to the
  Home Screen, enable, lock the phone, and have the partner send a message.
  Check the notification, the tap deep-link and the badge. Repeat with the app
  open to confirm suppression. Watch the CPU time in Workers observability.
- `npm run check`, `lint`, `test`, `test:e2e:image`.
