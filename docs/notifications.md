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
- **Suggested once the app is installed.** Adding it to the Home Screen is
  what makes push possible on an iPhone, so the app shell then shows
  `NotificationsHint`: "Get notified about new messages", linking to
  Notifications settings. It is the follow-on to `HomeScreenHint`, and the two
  never show together, since one is for a browser tab and the other for the
  Home Screen app. It shows only when push can work and the person has not
  decided yet (`shouldSuggestPush` in `push-client.ts`):
  - the page is running standalone,
  - this server has push keys (`pushAvailable` in the shell's load),
  - the browser supports push,
  - the permission is still at "ask",
  - and this device has no subscription.

  So someone who said no, or turned notifications off, is not asked again. It
  is a link rather than a switch, because the permission prompt has to come
  from the settings screen's own button. It is hidden on that screen, and
  dismissing it is remembered per device, through the same
  `DismissibleHint` base as the Home Screen hint.
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

**What happened, never content and never who.** The copy is "New message" or
"New reaction". The server could not include a message's text if it tried,
because it only ever holds ciphertext — and it cannot include who sent it
either, because partnership names are sealed too
([docs/partners.md](partners.md#names-are-sealed)). The lock screen is the one
place the app is visible to whoever picks the phone up, so saying less there is
no loss: a tap opens the thread, where the name is.

- The payload is encrypted to the device, so the push service sees only that
  *a* notification went to *an* endpoint.
- A reply gets the thread's `Topic` and a `thread-<id>` tag, so a burst of
  replies to a phone that was off arrives as one notification, and a newer one
  replaces an older one on screen. A reaction gets neither, so it can never
  replace a message notification nobody has read yet.
- A tap opens the thread's own page, `/messages/<threadId>`, which takes its
  partnership from the thread rather than from the device's context, so it
  opens the same thread whatever the device was last looking at, and leaves
  that alone ([contexts.md](contexts.md#items-carry-their-own-space)).
  Opening it reads it, as tapping its sticker on the board would; it used to
  open the board at `?thread=` and ring a never-opened thread there, which a
  board that follows the context can no longer promise to show. Links in
  notifications already delivered to the old `/partner/<id>/messages` 404,
  and the error page links back to the board. The service worker refuses to
  navigate off the app's own origin whatever a payload says.
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
- **A browser that changes hands lets go of the previous account.** Only that
  sign-out button can unsubscribe, because only it runs in the browser. A
  session that expires, `/logout`, or simply signing in as somebody else leaves
  the subscription where it was, still the previous account's. So on every
  full load the app shell sends this browser's endpoint to
  `POST /api/push/subscriptions/check`, and the server answers whose it is. If
  it is another account's, the server deletes that row and the browser
  unsubscribes. Holding the endpoint is what authorises deleting a row that is
  not yours, since only the browser with the subscription has it. If it is the
  signed-in account's, the stored device id is refreshed. A device sent to sign
  in again by `EncryptionGate` comes back to its own row, so nothing changes
  for it.
- **A device is never handed to a new account.** The check releases a
  subscription but never registers it for whoever signed in. Browser permission
  was given by the previous person, so the new one turns notifications on with
  a tap like anyone else. The settings screen used to re-register on every
  visit, which quietly moved a previous person's device to whoever opened it.
  This was found on a Mac whose Firefox, signed in as one account, was being
  sent the other account's notifications.

## Not telling a device what it is showing

A device with the board or thread open is already being told, live, by the SSE
feed (see [messaging.md](messaging.md#realtime)), so a push to it as well is
noise. The realtime room knows who is listening, so it answers the question:

- `watchRoom` (`src/lib/realtime/live.ts`) opens the stream with `?device=<id>`, the id the server gave this
  browser when it subscribed, kept in `localStorage` under `PUSH_DEVICE_ID_KEY`.
- The events endpoint passes the room a watcher whose **user id comes from the
  session** and whose device id comes from that query. The query is only ever
  compared against that user's own subscriptions.
- `publishMessagingEvent` returns the watchers of the `messages` topic, at no
  extra cost, from the request it already makes. Only that topic's: one room
  serves every realtime feature (see [realtime.md](realtime.md)), and a device
  with only a notebook page of the partnership open is not showing the board,
  so it must still be pushed to. `watchingDevices` keeps only the recipient's
  own. `sendPush` skips those.

It is per device on purpose: a board open on a laptop says nothing about
whether its owner is looking at their phone, so the phone is still told.
If the stored id is lost, the only cost is one redundant notification. An
Everyone board over several partners holds no stream
([messaging.md](messaging.md#realtime)), so a device showing one is not
watching and is still pushed to: it would not ring the sticker either until
it is looked at again.

What a watching device gets instead is in-page: its board rings the new
thread's sticker, and a thread page shows a toast for a message in another
thread. Both are described in
[messaging.md](messaging.md#notices-while-watching).

**"Has a stream open" only means "is on screen" because streams are leases.**
The feed hangs up whenever the page is hidden or left, but on Workers that
hang-up never reaches the room. So the page also says goodbye by beacon, and a
stream it stops renewing is dropped after 60 seconds (see
[messaging.md](messaging.md#a-stream-is-a-lease)). Before that, a phone that
tapped a notification, landed on the board and then went to its home screen
stayed listed as watching. Every later message skipped it, with nothing
logged. The 60 seconds is now the worst case: a device that vanishes without
saying goodbye, a phone locked mid-thread say, can miss pushes for up to that
long.

## Configuration

Three server settings ([server-settings.md](server-settings.md)), set at
Settings → Admin → Server settings: `vapidPublicKey`, `vapidPrivateKey` and
`vapidSubject`, read by `readVapidConfig` in `src/lib/server/push.ts`.

**The key pair generates itself** the first time the server finds it missing,
like the auth secret, so a new server, a fresh dev database and each Worker
database have a pair of their own without anyone making one.

**The subject is optional.** It is the `mailto:` or `https:` URL push services
can contact. Left empty it defaults to `mailto:` and the address in the mail
sender setting, so a server with email set up needs nothing more. Only with
neither is push off: `readVapidConfig` returns null, nothing is sent, and the
settings screen says notifications are not set up on this server.

**Keep the pair once it is in use.** Every subscription is bound to the public
key it was made with, so the admin page's Regenerate button deletes every push
subscription along with the old pair: they could never be sent to again, and
leaving them would only make every send fail. Each device has to turn
notifications on again.

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
| `src/lib/push-client.ts`                             | Browser only: support detection, enable, disable, ownership check |
| `src/service-worker.ts`                              | Shows a push and opens the thread on tap                        |
| `src/routes/api/push/subscriptions/`                 | `POST` subscribe; `[id]` `PATCH` categories and `DELETE`; `check` |
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
  that the payload a browser would read names nobody and says nothing more,
  and covers category opt-outs, watched devices, 410 clean-up and never
  throwing.
- `notifications.test.ts` covers the copy, topic, labels and the push-service
  allowlist. The endpoint tests cover auth, ownership and the allowlist on the
  wire.
- `NotificationSettings.svelte.test.ts` covers each browser state with
  `$lib/push-client` mocked.
- Whether a device counts as watching is covered at each layer: the lease
  rules per backend in `server/realtime/{durable-object,local}.test.ts`, the
  presence endpoint in `api/realtime/events/server.test.ts` (which also checks
  that a notebook stream does not count as watching the board), and the page's
  renewals and goodbye in `realtime/live.test.ts`. None of them can
  show that Workers never tells the room about a hang-up, which is why the
  lease exists at all; that was found on a deployed preview.
- `e2e/notifications.spec.ts` drives the real screen, service worker and
  endpoints, with `PushManager` and the notification permission faked in the
  page. Headless Chromium reports notifications as denied whatever the context
  is granted, and a real subscription would register with Google. The suite
  never sends a message to a subscribed account, so the server never calls a
  real push service. It also covers a browser changing hands: one account
  subscribes, the session is cleared without the settings sign-out, another
  signs up, and the first account's device is gone without the second
  getting it.
- **Not covered by any automated test: delivery on a real iPhone.** That needs
  `npm run preview` or a deploy with real keys, the app added to the Home
  Screen, and a second account sending a message while the phone is locked.
