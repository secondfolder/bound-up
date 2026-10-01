# Push notifications

A partner's message or reaction can reach a phone that is locked, or an app
that is closed. Messages and reactions are covered today. Both are a category
each device can turn off by itself, and the plumbing is built to take more
categories (task reminders are next on the roadmap).

## The protocol, and why it fits the Free plan

This is standard **Web Push**: a browser subscribes and hands back an endpoint
on its vendor's push service (Apple, Google, Mozilla or Microsoft). The server
POSTs to that endpoint, with the payload encrypted to the device (RFC 8291,
`aes128gcm`) and signed with the server's own **VAPID** key (RFC 8292). One
protocol reaches every vendor, so there is no per-platform code on the server.

It needs nothing beyond an outbound `fetch`. There is no APNs certificate, no
Apple developer account, no native app, and on Workers nothing outside the
Free plan:

- **One push is one subrequest.** Subrequests do not count against the 100k
  requests a day; the Free limit is 50 per invocation, and an account has at
  most `MAX_PUSH_DEVICES` (10) devices, so one message fans out well inside it.
- **CPU.** Each device costs an ECDH key, an HKDF, an AES-GCM seal and an
  ES256 signature, all native WebCrypto and each well under a millisecond, so
  ten devices sit comfortably inside the Free plan's 10 ms.
- **Latency.** The sending happens in `ctx.waitUntil` after the response, so a
  sender never waits on a round trip to Apple. The Node builds have no such
  limit, and the promise simply runs.

The library is `@block65/webcrypto-web-push`, chosen because it is WebCrypto
only and so runs unchanged on workerd and in the Docker image's Node. Its 2.x
is the version Apple accepts: 1.x sent the draft `aesgcm` encoding. The usual
`web-push` package needs Node's `crypto` and `https`, so it is ruled out.

## iOS

- **Only from the Home Screen.** iOS (16.4+) offers push only to a site added
  to the Home Screen and opened from there. In a Safari tab there is not even a
  `PushManager`, so the settings screen checks for that first and explains how
  to add the app, reusing `shouldOfferHomeScreen` from `home-screen.ts`.
- **Permission needs a tap.** `enablePush` calls `Notification.requestPermission()`
  before any other `await`, because Safari only prompts inside a user gesture.
- **No silent push.** WebKit revokes a subscription whose push does not show a
  notification. So every push shows one, the service worker shows a generic
  notification for a payload it cannot read rather than nothing, and "they are
  already looking" is decided **on the server**, never by a device dropping the
  push (see [Not telling a device what it is showing](#not-telling-a-device-what-it-is-showing)).
- **Declarative Web Push.** Payloads are in WebKit's declarative format
  (`{ "web_push": 8030, "notification": { … } }`), which Safari 18.4+ shows
  without waking a service worker at all, the most reliable path iOS has.
  Everywhere else the same JSON goes to `src/service-worker.ts`, which shows it
  the same way.

## What a notification says

**The partner's name and a verb. Never content.** The server could not include
a message's text if it tried, because it only ever holds ciphertext. The lock
screen is the one place the app is visible to whoever picks the phone up, so
the copy stays at "New message from Sam" and "Sam reacted to your message".

- The name is what the **recipient** calls the sender. It comes from the
  sender's own view of the partnership, as `yourName` ("what the other person
  calls the viewer"), which is right rather than backwards because the other
  person is who is being notified. It still goes through `viewPartnership()`.
- The payload is encrypted to the device, so the push service sees only that
  *a* notification went to *an* endpoint.
- A reply gets the thread's `Topic` and a `thread-<id>` tag, so a burst of
  replies to a phone that was off arrives as one notification, and a newer one
  replaces an older one on screen. A reaction gets neither, so it can never
  replace a message notification nobody has read yet.
- A tap opens the board at `?thread=<id>`, and the board's load decides at
  tap time rather than at send time. A thread the recipient has opened before
  redirects straight to its own page. One they have never opened stays on the
  board, scrolled into view and ringed, the ring fading after about four
  seconds. It is seen first as its sealed envelope, as every new thread is,
  and opening it is still the recipient's own tap. Deciding at tap time means
  a thread opened on another device in the meantime goes straight through.
  The query is then dropped from the URL, so a reload does not highlight it
  again. The service worker refuses to navigate off the app's own origin
  whatever a payload says.
- `TTL` is a day: long enough for a phone off overnight, short enough that a
  week away does not end in a pile of stale banners.

## Devices

`push_subscriptions` has one row per browser subscription, not per user,
because categories are per device: reactions on the phone but not the laptop is
a reasonable thing to want.

- **The endpoint is a capability.** Anyone with it and the keys beside it can
  make that device show a notification, so it never goes in load data. Screens
  name a device by `id` and a rough `label` ("Safari on iPhone").
- **The endpoint is unique,** and subscribing again is an upsert on it. A
  browser re-subscribing therefore updates its row instead of adding a second
  one that would show every notification twice. That includes a different
  account subscribing on the same browser: the device moves to them.
- **Only known push services.** The server POSTs to whatever endpoint is
  stored, so `isKnownPushService` limits endpoints to Apple, FCM, Mozilla and
  WNS over HTTPS on the default port. Otherwise any account could aim the
  server at an arbitrary URL, which on a self-hosted box could be on the
  private network.
- **At most ten per account.** Subscribing past the cap drops the oldest, most
  likely a browser that was cleared without the push service reporting it yet.
- **Gone devices clean themselves up.** A 404 or 410 from a push service is
  what an uninstalled app or a revoked permission looks like, and that row is
  deleted on the spot. Other failures are logged by status only, because the
  response can echo the endpoint.
- **Signing out forgets the device.** The settings screen's sign-out
  unsubscribes and deletes this device while the session can still say which
  one it is, since the notifications would otherwise go on naming a partner on
  a lock screen nobody is signed in behind. A device sent to sign in again by
  `EncryptionGate` keeps its subscription: that is the same person on the same
  device, and they would only be surprised to find notifications switched off.

## Not telling a device what it is showing

A device with the board or thread open is already being told, live, by the SSE
feed (see [messaging.md](messaging.md#realtime)), so a push to it as well is
noise. The realtime room knows who is listening, so it answers the question:

- `live.ts` opens the stream with `?device=<id>`, the id the server gave this
  browser when it subscribed, kept in `localStorage` under `PUSH_DEVICE_ID_KEY`.
- The events endpoint passes the room a watcher whose **user id comes from the
  session** and whose device id comes from that query. The query is only ever
  compared against that user's own subscriptions.
- `Notifier.publish` returns the watchers, at no extra cost, from the request
  it already makes. `watchingDevices` keeps only the recipient's own.
  `sendPush` skips those.

It is per device on purpose: a board open on a laptop says nothing about
whether its owner is looking at their phone, so the phone is still told.
Because the feed hangs up whenever the page is hidden, "has a stream open"
amounts to "is on screen". If the stored id is lost, the only cost is one
redundant notification.

## Configuration

Three variables, all or none: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and
`VAPID_SUBJECT` (a `mailto:` or `https:` URL that push services can contact).
`npm run secrets -- <target>` generates a pair into `.env`, `.dev.vars`,
production's wrangler secrets or the Preview base config, and never replaces
one that is already set (see docs/development.md). `npm run secrets -- print`
prints one instead; without a checkout, `npx web-push generate-vapid-keys`
prints one in the same format. In dev they go in `.env`; self-hosted, in the
container's environment.

**Optional, unlike `BETTER_AUTH_SECRET`.** Without them `readVapidConfig`
returns null, nothing is sent, and the settings screen says notifications are
not set up on this server, so a self-hosted instance upgraded from before push
existed keeps starting.

**Keep the pair once it is in use.** Every subscription is bound to the public
key it was made with. Replacing the pair stops notifications on every device
until each one is turned on again.

## The service worker

`src/service-worker.ts` handles `push` and `notificationclick` and nothing
else. **It has no `fetch` handler and caches nothing.** An offline cache is a
separate decision with failure modes of its own (a stale build served after a
deploy, for one), and notifications need none of it. Without a `fetch`
listener the browser never routes a request through it.

SvelteKit's automatic registration is off (`serviceWorker.register: false` in
`svelte.config.js`). The worker is registered by `enablePush` when someone turns
notifications on, so it is not one more thing between every other visitor and
the page.

## Where it lives

| Path                                                 | What                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------- |
| `src/lib/notifications.ts`                           | Pure: payload, copy, topic, device label, the push-service list |
| `src/lib/server/push.ts`                             | Devices, `sendPush`, `notifyPartner`, VAPID config              |
| `src/lib/push-client.ts`                             | Browser only: support detection, enable, disable, resync        |
| `src/service-worker.ts`                              | Shows a push and opens the thread on tap                        |
| `src/routes/api/push/subscriptions/`                 | `POST` subscribe; `[id]` `PATCH` categories and `DELETE`        |
| `src/routes/(auth-required)/(app)/settings/notifications/` | The settings screen, around `NotificationSettings.svelte` |

The send and reaction endpoints call `notifyPartner` straight after
`notifier.publish`. A reaction always notifies, because `setReaction` refuses
one on your own message, and only when it is set: taking one back is not news.

The subscribe and device endpoints are API routes, not superforms actions, for
the same reason messaging is: the subscription only exists after
`pushManager.subscribe()` runs in the browser, so there is no form to bind.
The Zod schemas are in `src/lib/schemas/pushSubscription.ts`.

## Testing

- `src/lib/server/push.test.ts` sends to a fake push service and **decrypts
  what arrived with a real RFC 8291 decoder** (`$lib/testing/push`). It pins
  that the payload a browser would read names the partner and nothing more,
  and covers category opt-outs, watched devices, 410 clean-up and never
  throwing.
- `notifications.test.ts` covers the copy, topic, labels and the push-service
  allowlist. The endpoint tests cover auth, ownership and the allowlist on the
  wire.
- `NotificationSettings.svelte.test.ts` covers each browser state with
  `$lib/push-client` mocked.
- `e2e/notifications.spec.ts` drives the real screen, service worker and
  endpoints, with `PushManager` and the notification permission faked in the
  page. Headless Chromium reports notifications as denied whatever the context
  is granted, and a real subscription would register with Google. The suite
  never sends a message to a subscribed account, so the server never calls a
  real push service.
- **Not covered by any automated test: delivery on a real iPhone.** That needs
  `npm run preview` or a deploy with real keys, the app added to the Home
  Screen, and a second account sending a message while the phone is locked.
