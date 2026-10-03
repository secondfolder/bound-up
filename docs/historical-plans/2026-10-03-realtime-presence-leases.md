# Realtime presence leases (plan)

Proposed in chat on 2026-10-03 after the preview's logs showed
`Safari on iPhone … skipped (watching)` for messages sent minutes after the
phone had left the message board, and approved as "go with your recommended
fix". The plan as written then, verbatim:

> The fix I'd recommend is to stop relying on the server noticing the hang-up:
>
> 1. **Have the page say when it leaves.** When `live.ts` tears down or the
>    page is hidden, it calls `navigator.sendBeacon` to a small
>    `…/events/leave?device=` endpoint, and the room drops that user's watcher
>    for that device. A beacon is built to survive the page going away.
> 2. **One stream per device.** When a device opens a new stream, the room
>    drops any older one for the same device. That costs nothing and stops
>    dead streams piling up.
> 3. **An expiry as a safety net.** A watcher whose last sign of life is older
>    than about a minute stops counting as watching, for the case where iOS
>    suspends the app before the beacon gets out. The client would re-send a
>    cheap "still here" while visible. The cost is that a message arriving
>    within the first minute after locking could still be skipped, but it can
>    no longer go missing indefinitely.
>
> There's a cheaper alternative: drop the "already watching" check and always
> push. That trades this bug for a redundant notification whenever you're
> looking at the thread.
>
> Should I implement 1–3 with tests and a `docs/notifications.md` update, then
> deploy and repeat this exact test (tap a notification, go home, send)?
