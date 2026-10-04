# Versions and updates

What version a build calls itself, where that comes from, and how a page
that is already open finds out a newer build has been deployed.

## The version number

The version is the one semantic-release gives a release: `feat:` bumps the
minor, `fix:`/`perf:` the patch, and so on (the rules are in
[self-hosting.md](self-hosting.md#versioning-and-publishing)). It is never
committed. `package.json` stays at `0.0.0-set-on-publish`, and the version
lives in the `v*` tag the release job pushes. The settings page shows it in
muted text at the bottom.

Every build works it out for itself instead, in
`vite-plugins/app-version.ts`, and bakes it in as the `__APP_VERSION__`
constant through `define` in `vite.config.ts`. The tag cannot simply be read,
because Cloudflare's deploy-on-push builds a commit on `main` before CI has
tested and tagged it. So the build does semantic-release's sums itself:

1. Take the highest `v*` tag the commit contains, by version.
2. Run `@semantic-release/commit-analyzer`'s `analyzeCommits` over the commits
   since that tag, with the plugin config read from `release.config.mjs`.
3. Bump the tag's version by the release type that comes back, or leave it
   alone if the type is null.

Because it is the same analyzer with the same config, the two cannot
disagree. A commit that releases nothing (`chore:`, `docs:`) shows the
version it was deployed on top of.

A build from any branch semantic-release does not release from (its
`branches` in `release.config.mjs`, so anything but `main`) adds the commit
as semver build metadata, for example `1.2.0+3f2a9c1`. The number is what the
branch would release if it were merged as it is. A branch is never tagged,
though, so after its first `feat:` every later commit gives the same number,
and without the hash a reload onto a new preview deploy would look like
nothing had changed. Cloudflare's build checks out a detached HEAD, so the
branch comes from its `WORKERS_CI_BRANCH` variable. A detached HEAD with no
branch name gets the hash too, because an unknown branch is not known to be a
release.

The edge cases:

- **A shallow clone**, which is what Cloudflare's build makes, has neither
  the tags nor the history. The build runs `git fetch --unshallow --tags`
  first.
- **No git at all** (the Docker build, a tarball) gives `0.0.0-dev` and a
  warning. A wrong version on the settings page is not worth failing a
  deploy over.
- **`APP_VERSION` in the build's environment** wins over all of that, for a
  build that already knows its version.

### The Docker image

The image is the exception, because the build stage has no `.git` (it is in
`.dockerignore`). The release version also does not exist yet when CI builds
and tests the image, and the released image has to be those same tested
layers. So the version goes in the image's last layer: `ARG VERSION` sets
`ENV APP_VERSION`, beside the OCI version label. `$lib/server/app-version`
prefers it at runtime, in the self-hosted build only, and that is why the
settings page gets the version from its server load rather than from
`__APP_VERSION__` directly. `src/lib/server/self-hosted/dockerfile.test.ts`
checks that only metadata follows the `ARG`.

## Picking up a new deploy

A home-screen web app on iOS is suspended when someone switches away and
resumed when they come back, sometimes days later. It is not relaunched, so
it keeps running the JavaScript it was opened with. Navigation is
client-side, so nothing loads a new document, and in standalone mode there
is no reload button and no pull-to-refresh. This is not caching: there is no
service-worker cache (see [notifications.md](notifications.md)), and the
hashed `/_app/immutable/` files a fresh launch asks for are always the
current ones.

SvelteKit's version check handles most of it:

- **`kit.version.pollInterval`** (`svelte.config.js`) fetches
  `/_app/version.json` every five minutes. When it no longer matches the
  running build, `updated.current` from `$app/state` becomes true, and from
  then on **every link click is a full page load**, which gets the new code.
  `kit.version.name` stays SvelteKit's default, the build time, not the
  release version, so that a `chore:` deploy is picked up too.
- **A navigation whose route module has gone** (deploys replace the hashed
  chunks) is caught by SvelteKit itself. It checks for an update and loads
  the page in full.

`UpdateAvailableNotice.svelte`, mounted once in the root layout, covers the
rest:

- **It checks on resume.** iOS barely runs timers for a suspended app, so
  the poll can miss days. A `visibilitychange` to `visible` calls
  `updated.check()`.
- **It checks when a lazy import fails.** `vite:preloadError` means a
  module that is not a route (the editor, the encryption library) was
  missing. The import still fails where it was made, so the failure is
  reported there as usual. The check means a way out appears with it.
- **It offers a reload and never reloads by itself.** Reloading could lose
  a half-filled form, so it shows a `wa-toast-item` with
  `duration = 0`, which never times out, and a "Reload" button. The toast
  stays until someone reloads or closes it. If it is closed, the next link
  click still loads the new build.

None of this runs under `vite dev`: there SvelteKit's `updated.check()`
always answers false. The component test fakes `updated`
(`$lib/testing/updated.svelte`), and `e2e/app-update.spec.ts` runs only
against the Docker image (`npm run test:e2e:image`, and CI). It fakes a
deploy by answering `version.json` with a different version.
