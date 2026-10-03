# Push device ownership check (plan)

Proposed in chat on 2026-10-03, after the preview showed Firefox on a Mac,
signed in as `test@test.com`, still holding the other account's push
subscription, and approved as "Make your suggested fixes". The plan as written
then, verbatim:

> **The fix I'd suggest:**
> 1. **Check ownership on sign-in.** When the signed-in app first loads in a
>    browser that has a push subscription, it sends that subscription's
>    endpoint to a new `POST /api/push/subscriptions/check`. Holding the
>    endpoint proves the request comes from that browser, because the endpoint
>    is the browser's own secret address.
> 2. **Release it if it's someone else's.** If the row belongs to a different
>    account, the server deletes it. The browser then unsubscribes and forgets
>    its stored device id. The previous owner stops being notified there.
> 3. **Never move it silently.** The new account is not subscribed
>    automatically. Browser permission was granted to the previous person, not
>    to them, so they turn notifications on from Settings like anyone else.
> 4. **Same person coming back:** if the row is theirs, as after an
>    `EncryptionGate` sign-out, nothing changes.
>
> The cost is one small request per full page load of the app, and only in
> browsers that are subscribed. It would come with tests and a
> `docs/notifications.md` update, since that doc currently says signing out
> forgets the device, which is only true for the Settings button.
