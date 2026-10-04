# App version and update notice (plan)

Proposed in chat on 2026-10-04, after the question "I suspect that when I
update the app iOS's aggressive caching of saved to home page web apps still
uses the old code and it doesn't provide any way to reload the page. What can
I do about that?" The plan as written then, verbatim:

> It's probably not a cache problem. Your service worker has no `fetch`
> handler, and SvelteKit's `/_app/immutable/*` files have content hashes in
> their names, so a fresh launch can't load old JavaScript from the HTTP
> cache. What's more likely is that **iOS isn't relaunching the app at all.**
> A home-screen web app is suspended when you switch away and resumed when you
> come back, sometimes days later. Resuming keeps the old page in memory,
> running the old JS. The app uses client-side navigation, so nothing ever
> loads a new document. In standalone mode there's no reload button and no
> pull-to-refresh, so you can't get out of it. Force-quitting from the app
> switcher works, but nobody knows to do that.
>
> There's one real cache risk: if the HTML for a route like `/home` gets
> cached, it points to the old hashed bundles. I checked, and nothing in
> `src` sets `Cache-Control` on page responses. It's worth confirming in
> production that HTML goes out with `no-cache` or `private, no-store`. Pages
> showing session data generally shouldn't be cached anyway.
>
> ## The fix: SvelteKit's built-in version detection
>
> You're not using it yet. There's no `kit.version` in `svelte.config.js`.
>
> 1. **Turn on polling** in `svelte.config.js`:
>    ```js
>    kit: {
>      version: { pollInterval: 5 * 60_000 }, // checks /_app/version.json
>      ...
>    }
>    ```
>    Each build gets a version string. When SvelteKit sees a new one, it sets
>    `updated.current` (from `$app/state`) to true. From then on, **every link
>    click does a full page load instead of a client-side navigation.** That
>    alone gets resumed sessions onto the new code the next time someone taps
>    something.
>
> 2. **Check when the app comes back to the foreground.** Polling timers barely
>    run while iOS has the app suspended, so call `updated.check()` on resume.
>    This goes in the root `+layout.svelte`:
>    ```ts
>    onMount(() => {
>      const onVisible = () => { if (document.visibilityState === 'visible') updated.check(); };
>      document.addEventListener('visibilitychange', onVisible);
>      return () => document.removeEventListener('visibilitychange', onVisible);
>    });
>    ```
>
> 3. **Optionally, show a prompt or reload on your own terms.** When
>    `updated.current` turns true, you could:
>    - show a small "A new version is available · Reload" notice that calls
>      `location.reload()`, or
>    - reload automatically on resume, but only when that can't lose anything.
>      Your rule that nothing a user typed is ever lost matters here. Composer
>      drafts are already saved on the device, but forms aren't, so a prompt
>      is the safer default.
>
> 4. **Handle a failed chunk load.** If someone on an old version opens a
>    lazily loaded route after a deploy, the browser may ask for a chunk that
>    no longer exists. On Workers, assets from previous builds aren't
>    guaranteed to stick around. SvelteKit fires `vite:preloadError`, and a
>    handler can call `location.reload()` when that happens.
>
> Steps 1 and 2 cover most of it; 3 is the polish.
>
> I can implement 1–3 now: the config, the resume check, and a reload notice
> that follows the request-failure notice pattern. That also needs an e2e test
> that fakes a version bump and a short note in `docs/development.md`. Want me
> to go ahead?

Approved with these amendments, verbatim:

> Do all options, with option 3 with a non-expiring toast. Also the version
> number should be calculated the same way it is for the docker build and I
> want you to show the version number in muted text at the bottom of the
> settings page. I don't want the version number commited to the repo, I've
> set package.json to `0.0.0-set-on-publish` and I want that to stay. Instead
> it should be set in the built copy of the app.
